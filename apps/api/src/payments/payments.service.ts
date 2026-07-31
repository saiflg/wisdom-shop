import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { OrderStatus, PaymentProvider, Prisma } from "@prisma/client";
import type Stripe from "stripe";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../common/audit/audit-log.service";
import { MailerService } from "../common/mailer/mailer.service";
import type { EnvConfig } from "../config/env.validation";
import { StripeProvider } from "./providers/stripe.provider";
import { LicensesService } from "../licenses/licenses.service";
import { PaystackProvider, type PaystackEvent } from "./providers/paystack.provider";
import { canTransition, isAlreadyInState } from "./order-status";

export interface WebhookResult {
  handled: boolean;
  reason: string;
}

/** A provider webhook normalised into the fields the shared logic needs. */
interface NormalisedPaymentEvent {
  provider: PaymentProvider;
  orderNumber: string;
  providerRef: string;
  /** Minor units (cents/kobo), or null when the provider didn't state one. */
  paidAmountMinor: number | null;
  raw: unknown;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly stripe: StripeProvider,
    private readonly paystack: PaystackProvider,
    private readonly auditLog: AuditLogService,
    private readonly mailer: MailerService,
    private readonly licenses: LicensesService,
  ) {}

  // ── Payment initiation ───────────────────────────────────────────────

  async startStripeCheckout(userId: string, orderNumber: string) {
    const order = await this.loadPayableOrder(userId, orderNumber);

    const appUrl = this.config.get("APP_URL", { infer: true });
    const session = await this.stripe.createCheckoutSession({
      orderNumber: order.orderNumber,
      amountCents: order.totalCents,
      currency: order.currency,
      customerEmail: order.user.email,
      successUrl: `${appUrl}/orders/${order.orderNumber}?payment=success`,
      cancelUrl: `${appUrl}/orders/${order.orderNumber}?payment=cancelled`,
    });

    await this.recordInitiated(order.id, "STRIPE", order, session.id);
    await this.auditLog.record({
      userId,
      action: "payment.initiated",
      entity: "Order",
      entityId: order.id,
      metadata: { provider: "STRIPE", ref: session.id },
    });

    return { provider: "STRIPE", reference: session.id, redirectUrl: session.url };
  }

  async startPaystackCheckout(userId: string, orderNumber: string) {
    const order = await this.loadPayableOrder(userId, orderNumber);

    const appUrl = this.config.get("APP_URL", { infer: true });
    const transaction = await this.paystack.initializeTransaction({
      orderNumber: order.orderNumber,
      // Orders already store minor units, which is what Paystack expects.
      amountMinorUnits: order.totalCents,
      currency: order.currency,
      customerEmail: order.user.email,
      callbackUrl: `${appUrl}/orders/${order.orderNumber}?payment=success`,
    });

    await this.recordInitiated(order.id, "PAYSTACK", order, transaction.reference);
    await this.auditLog.record({
      userId,
      action: "payment.initiated",
      entity: "Order",
      entityId: order.id,
      metadata: { provider: "PAYSTACK", ref: transaction.reference },
    });

    return {
      provider: "PAYSTACK",
      reference: transaction.reference,
      redirectUrl: transaction.authorizationUrl,
    };
  }

  private async loadPayableOrder(userId: string, orderNumber: string) {
    const order = await this.prisma.order.findFirst({
      where: { orderNumber, userId, deletedAt: null },
      include: { user: { select: { email: true } } },
    });
    if (!order) throw new NotFoundException("Order not found");

    if (order.status !== "PENDING") {
      throw new ConflictException(
        `This order is already ${order.status.toLowerCase()} and cannot be paid again`,
      );
    }
    return order;
  }

  private async recordInitiated(
    orderId: string,
    provider: PaymentProvider,
    order: { totalCents: number; currency: string },
    providerRef: string,
  ): Promise<void> {
    await this.prisma.payment.create({
      data: {
        orderId,
        provider,
        status: "INITIATED",
        amountCents: order.totalCents,
        currency: order.currency,
        providerRef,
      },
    });
  }

  // ── Webhooks ─────────────────────────────────────────────────────────

  async handleStripeWebhook(rawBody: Buffer, signatureHeader: string | undefined): Promise<WebhookResult> {
    this.assertWebhookPreconditions(rawBody, signatureHeader, "Stripe-Signature");

    let event: Stripe.Event;
    try {
      event = this.stripe.verifyWebhookSignature(rawBody, signatureHeader!);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      this.logger.warn(`Rejected Stripe webhook with invalid signature: ${(error as Error).message}`);
      throw new BadRequestException("Invalid webhook signature");
    }

    // Stripe supplies a unique event id, so idempotency keys on it directly.
    const claimed = await this.claimEvent("STRIPE", event.id, event.type);
    if (!claimed) return { handled: false, reason: "duplicate" };

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const orderNumber = session.metadata?.orderNumber ?? session.client_reference_id;
        if (!orderNumber) return { handled: false, reason: "no order reference" };
        return this.applySuccess({
          provider: "STRIPE",
          orderNumber,
          providerRef: session.id,
          paidAmountMinor: session.amount_total,
          raw: session,
        });
      }
      case "charge.refunded": {
        const charge = event.data.object;
        const orderNumber = charge.metadata?.orderNumber;
        if (!orderNumber) return { handled: false, reason: "no order reference on charge" };
        return this.applyRefund("STRIPE", orderNumber, charge.id);
      }
      default:
        return { handled: false, reason: `unhandled event type ${event.type}` };
    }
  }

  async handlePaystackWebhook(rawBody: Buffer, signatureHeader: string | undefined): Promise<WebhookResult> {
    this.assertWebhookPreconditions(rawBody, signatureHeader, "x-paystack-signature");

    let event: PaystackEvent;
    try {
      event = this.paystack.verifyWebhookSignature(rawBody, signatureHeader!);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      this.logger.warn(`Rejected Paystack webhook with invalid signature: ${(error as Error).message}`);
      throw new BadRequestException("Invalid webhook signature");
    }

    const reference = event.data?.reference;
    if (!reference) return { handled: false, reason: "no transaction reference" };

    // Paystack webhooks carry no unique event id, so the idempotency key is
    // (event type + transaction reference) — stable across redeliveries of
    // the same event without collapsing genuinely different events.
    const claimed = await this.claimEvent("PAYSTACK", `${event.event}:${reference}`, event.event);
    if (!claimed) return { handled: false, reason: "duplicate" };

    const orderNumber = event.data.metadata?.orderNumber ?? reference;

    switch (event.event) {
      case "charge.success":
        return this.applySuccess({
          provider: "PAYSTACK",
          orderNumber,
          providerRef: reference,
          paidAmountMinor: event.data.amount ?? null,
          raw: event,
        });
      case "refund.processed":
      case "charge.refund.processed":
        return this.applyRefund("PAYSTACK", orderNumber, reference);
      default:
        return { handled: false, reason: `unhandled event type ${event.event}` };
    }
  }

  private assertWebhookPreconditions(
    rawBody: Buffer,
    signatureHeader: string | undefined,
    headerName: string,
  ): void {
    if (!signatureHeader) {
      throw new BadRequestException(`Missing ${headerName} header`);
    }
    if (rawBody.length === 0) {
      // A misconfigured raw-body pipeline looks exactly like a bad signature
      // otherwise, which is very hard to diagnose. Fail honestly instead.
      this.logger.error(
        "Webhook received with an empty raw body — the app must be created with { rawBody: true }.",
      );
      throw new InternalServerErrorException("Webhook raw body unavailable");
    }
  }

  /**
   * Records the event key, returning false if it was already recorded.
   * The unique constraint is the real guard: concurrent duplicate deliveries
   * race on the insert and exactly one wins.
   */
  private async claimEvent(provider: PaymentProvider, eventId: string, eventType: string): Promise<boolean> {
    try {
      await this.prisma.processedWebhookEvent.create({ data: { provider, eventId, eventType } });
      return true;
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") return false;
      throw error;
    }
  }

  // ── Shared outcome handling (provider-agnostic) ──────────────────────

  private async applySuccess(event: NormalisedPaymentEvent): Promise<WebhookResult> {
    const order = await this.prisma.order.findFirst({ where: { orderNumber: event.orderNumber } });
    if (!order) {
      this.logger.error(`${event.provider} webhook references unknown order ${event.orderNumber}`);
      return { handled: false, reason: "unknown order" };
    }

    // Reconcile against our own record. The amount is never taken from the
    // client, and a provider amount that disagrees with the order is a red
    // flag we refuse rather than reconcile away.
    if (event.paidAmountMinor !== null && event.paidAmountMinor !== order.totalCents) {
      this.logger.error(
        `${event.provider} ref ${event.providerRef} paid ${event.paidAmountMinor} but order ${event.orderNumber} totals ${order.totalCents}; refusing to mark paid`,
      );
      await this.upsertPayment(order.id, event.provider, event.providerRef, order.currency, {
        status: "FAILED",
        amountCents: event.paidAmountMinor,
        rawWebhook: event.raw as Prisma.InputJsonValue,
      });
      await this.auditLog.record({
        userId: order.userId,
        action: "payment.amount_mismatch",
        entity: "Order",
        entityId: order.id,
        metadata: {
          provider: event.provider,
          ref: event.providerRef,
          paid: event.paidAmountMinor,
          expected: order.totalCents,
        },
      });
      return { handled: false, reason: "amount mismatch" };
    }

    const blocked = this.checkTransition(order.status, "PAID", event.orderNumber);
    if (blocked) return blocked;

    const existingPaymentId = await this.findPaymentId(order.id, event.provider, event.providerRef);

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: order.id }, data: { status: "PAID" } });

      const data = {
        status: "SUCCEEDED" as const,
        amountCents: event.paidAmountMinor ?? order.totalCents,
        rawWebhook: event.raw as Prisma.InputJsonValue,
      };

      if (existingPaymentId) {
        await tx.payment.update({ where: { id: existingPaymentId }, data });
      } else {
        await tx.payment.create({
          data: {
            orderId: order.id,
            provider: event.provider,
            providerRef: event.providerRef,
            currency: order.currency,
            ...data,
          },
        });
      }
    });

    await this.auditLog.record({
      userId: order.userId,
      action: "payment.succeeded",
      entity: "Order",
      entityId: order.id,
      metadata: { provider: event.provider, ref: event.providerRef, amount: event.paidAmountMinor },
    });

    await this.sendReceipt(order.userId, order.orderNumber, order.totalCents, order.currency);

    // Licensable items become usable the moment payment lands. Issuance is
    // idempotent (unique on orderItemId) and swallows its own errors, so a
    // redelivered webhook mints nothing extra and a licensing failure never
    // makes the provider retry a payment that already succeeded.
    await this.licenses.issueForOrder(order.id);

    return { handled: true, reason: "order marked paid" };
  }

  private async applyRefund(
    provider: PaymentProvider,
    orderNumber: string,
    providerRef: string,
  ): Promise<WebhookResult> {
    const order = await this.prisma.order.findFirst({ where: { orderNumber } });
    if (!order) return { handled: false, reason: "unknown order" };

    const blocked = this.checkTransition(order.status, "REFUNDED", orderNumber);
    if (blocked) return blocked;

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: order.id }, data: { status: "REFUNDED" } });
      await tx.payment.updateMany({ where: { orderId: order.id, provider }, data: { status: "REFUNDED" } });
    });

    await this.auditLog.record({
      userId: order.userId,
      action: "payment.refunded",
      entity: "Order",
      entityId: order.id,
      metadata: { provider, ref: providerRef },
    });

    return { handled: true, reason: "order marked refunded" };
  }

  /** Returns a WebhookResult when the transition must not proceed, else null. */
  private checkTransition(from: OrderStatus, to: OrderStatus, orderNumber: string): WebhookResult | null {
    if (isAlreadyInState(from, to)) {
      return { handled: false, reason: `order already ${to.toLowerCase()}` };
    }
    if (!canTransition(from, to)) {
      this.logger.warn(`Refusing to move order ${orderNumber} from ${from} to ${to}`);
      return { handled: false, reason: `illegal transition from ${from}` };
    }
    return null;
  }

  private async findPaymentId(
    orderId: string,
    provider: PaymentProvider,
    providerRef: string,
  ): Promise<string | null> {
    const existing = await this.prisma.payment.findFirst({
      where: { orderId, provider, providerRef },
      select: { id: true },
    });
    return existing?.id ?? null;
  }

  private async upsertPayment(
    orderId: string,
    provider: PaymentProvider,
    providerRef: string,
    currency: string,
    data: { status: "SUCCEEDED" | "FAILED"; amountCents: number | null; rawWebhook: Prisma.InputJsonValue },
  ): Promise<void> {
    const existingId = await this.findPaymentId(orderId, provider, providerRef);
    const payload = {
      status: data.status,
      amountCents: data.amountCents ?? 0,
      rawWebhook: data.rawWebhook,
    };

    if (existingId) {
      await this.prisma.payment.update({ where: { id: existingId }, data: payload });
    } else {
      await this.prisma.payment.create({
        data: { orderId, provider, providerRef, currency, ...payload },
      });
    }
  }

  private async sendReceipt(
    userId: string,
    orderNumber: string,
    totalCents: number,
    currency: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) return;

    const total = new Intl.NumberFormat("en-US", { style: "currency", currency }).format(totalCents / 100);
    await this.mailer.send({
      to: user.email,
      subject: `Payment received for order ${orderNumber}`,
      html: `<p>We've received your payment of <strong>${total}</strong> for order ${orderNumber}.</p>
<p>You can view the order in your account.</p>`,
    });
  }

  // ── Queries ──────────────────────────────────────────────────────────

  async listForOrder(userId: string, orderNumber: string) {
    const order = await this.prisma.order.findFirst({
      where: { orderNumber, userId, deletedAt: null },
      select: { id: true },
    });
    if (!order) throw new NotFoundException("Order not found");

    return this.prisma.payment.findMany({
      where: { orderId: order.id },
      // rawWebhook can contain provider payloads; not needed by the client.
      select: {
        id: true,
        provider: true,
        status: true,
        amountCents: true,
        currency: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Lets the frontend hide payment buttons for providers that aren't set up. */
  availableProviders(): { provider: PaymentProvider; configured: boolean }[] {
    return [
      { provider: "STRIPE", configured: this.stripe.isConfigured },
      { provider: "PAYSTACK", configured: this.paystack.isConfigured },
    ];
  }
}
