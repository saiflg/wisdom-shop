import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { OrderStatus, PaymentProvider, Prisma, Refund } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../common/audit/audit-log.service";
import { MailerService } from "../common/mailer/mailer.service";
import { StripeProvider } from "./providers/stripe.provider";
import { PaystackProvider } from "./providers/paystack.provider";
import { FlutterwaveProvider } from "./providers/flutterwave.provider";
import { PayPalProvider } from "./providers/paypal.provider";
import type { ProviderRefundInput, ProviderRefundResult } from "./providers/provider-refund";
import { checkRefundAmount, isRefundableStatus, orderStatusAfterRefund } from "./refund-policy";

export interface RefundRequest {
  /** Omit to refund the whole remaining balance. */
  amountCents?: number;
  reason?: string;
  /**
   * Supplied by the caller so a retry is the same refund. Generated when
   * absent, which makes each call a distinct refund — correct for a genuine
   * second refund, and the reason the admin UI sends a stable key.
   */
  idempotencyKey?: string;
}

/**
 * Issuing refunds — the only place in this codebase that sends money *out*.
 *
 * Separate from `PaymentsService` because the risk profile is different.
 * Everything else in payments reacts to a provider telling us what already
 * happened; this initiates an irreversible transfer, so it is written to be
 * read carefully.
 *
 * The order of operations is deliberate and is the whole design:
 *
 *   1. Write a PENDING refund row, inside a transaction, having re-read the
 *      balance. The unique constraint on (orderId, idempotencyKey) makes a
 *      concurrent duplicate lose here rather than at the provider.
 *   2. Call the provider.
 *   3. Record what it said.
 *
 * Writing first means a crash between 1 and 2 leaves a PENDING row — visible,
 * reconcilable evidence that a refund may be in flight. The other order would
 * leave money gone with nothing to show for it, which is the failure mode
 * that actually hurts.
 */
@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeProvider,
    private readonly paystack: PaystackProvider,
    private readonly flutterwave: FlutterwaveProvider,
    private readonly paypal: PayPalProvider,
    private readonly auditLog: AuditLogService,
    private readonly mailer: MailerService,
  ) {}

  /** What can still be refunded, and what has been, for one order. */
  async summary(orderNumber: string) {
    const order = await this.loadOrder(orderNumber);
    const { paidCents, settledRefundCents } = await this.balances(order.id);

    return {
      orderNumber: order.orderNumber,
      currency: order.currency,
      status: order.status,
      paidCents,
      refundedCents: settledRefundCents,
      refundableCents: Math.max(0, paidCents - settledRefundCents),
      refundable: isRefundableStatus(order.status),
      refunds: await this.prisma.refund.findMany({
        where: { orderId: order.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          amountCents: true,
          currency: true,
          reason: true,
          providerRef: true,
          failureReason: true,
          provider: true,
          createdAt: true,
        },
      }),
    };
  }

  async refundOrder(
    orderNumber: string,
    request: RefundRequest,
    initiatedById: string,
  ): Promise<Refund> {
    const order = await this.loadOrder(orderNumber);

    if (!isRefundableStatus(order.status)) {
      throw new ConflictException(
        `An order that is ${order.status.toLowerCase()} cannot be refunded.`,
      );
    }

    const payment = await this.prisma.payment.findFirst({
      where: { orderId: order.id, status: { in: ["SUCCEEDED", "REFUNDED"] } },
      orderBy: { createdAt: "desc" },
    });
    if (!payment || !payment.providerRef) {
      // Without a provider reference there is nothing to refund against. This
      // happens for orders settled out of band, and the honest answer is that
      // this system cannot return that money.
      throw new ConflictException(
        "This order has no completed provider payment to refund against.",
      );
    }

    const idempotencyKey = request.idempotencyKey ?? randomUUID();

    // An idempotent replay returns the original rather than refunding again.
    const existing = await this.prisma.refund.findUnique({
      where: { orderId_idempotencyKey: { orderId: order.id, idempotencyKey } },
    });
    if (existing) return existing;

    // Balance is re-read inside the transaction that writes the row, so two
    // simultaneous refunds cannot both see the same remaining balance.
    const pending = await this.prisma
      .$transaction(async (tx) => {
        const { paidCents, settledRefundCents } = await this.balances(order.id, tx);

        const check = checkRefundAmount({
          requestedCents: request.amountCents,
          paidCents,
          settledRefundCents,
        });
        if (check.error) throw new BadRequestException(check.error);

        return tx.refund.create({
          data: {
            orderId: order.id,
            paymentId: payment.id,
            provider: payment.provider,
            status: "PENDING",
            amountCents: check.amountCents,
            currency: order.currency,
            reason: request.reason,
            idempotencyKey,
            initiatedById,
          },
        });
      })
      .catch((error: unknown) => {
        // Lost the race on the unique constraint: the other caller is
        // refunding this, so this one must not.
        if (isUniqueViolation(error)) {
          throw new ConflictException("A refund with this key is already being processed.");
        }
        throw error;
      });

    return this.executeRefund(pending, order.status, {
      providerRef: payment.providerRef,
      orderNumber: order.orderNumber,
      amountMinorUnits: pending.amountCents,
      currency: pending.currency,
      idempotencyKey,
    });
  }

  /** Calls the provider, then records the outcome either way. */
  private async executeRefund(
    pending: Refund,
    fromStatus: OrderStatus,
    input: ProviderRefundInput,
  ): Promise<Refund> {
    let result: ProviderRefundResult;
    try {
      result = await this.providerFor(pending.provider).refund(input);
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error(
        `Refund ${pending.id} failed at ${pending.provider}: ${message}`,
      );

      await this.prisma.refund.update({
        where: { id: pending.id },
        data: { status: "FAILED", failureReason: message.slice(0, 500) },
      });

      await this.auditLog.record({
        userId: pending.initiatedById ?? undefined,
        action: "refund.failed",
        entity: "Order",
        entityId: pending.orderId,
        metadata: { provider: pending.provider, amountCents: pending.amountCents, error: message },
      });

      // Surfaced rather than swallowed: an admin who clicked refund needs to
      // know the money did not move. The FAILED row is the record.
      throw new ConflictException(`The refund was not accepted: ${message}`);
    }

    return this.recordSuccess(pending, fromStatus, result);
  }

  private async recordSuccess(
    pending: Refund,
    fromStatus: OrderStatus,
    result: ProviderRefundResult,
  ): Promise<Refund> {
    const { paidCents, settledRefundCents } = await this.balances(pending.orderId, undefined, pending.id);

    const nextStatus = orderStatusAfterRefund({
      paidCents,
      settledRefundCents,
      amountCents: pending.amountCents,
    });

    const [refund] = await this.prisma.$transaction([
      this.prisma.refund.update({
        where: { id: pending.id },
        data: {
          // A provider that has accepted but not settled stays PENDING, so the
          // balance does not treat unsettled money as already returned.
          status: result.status,
          providerRef: result.providerRefundId,
          rawResponse: result.raw as Prisma.InputJsonValue,
        },
      }),
      this.prisma.order.update({ where: { id: pending.orderId }, data: { status: nextStatus } }),
      this.prisma.orderStatusHistory.create({
        data: {
          orderId: pending.orderId,
          fromStatus,
          toStatus: nextStatus,
          changedByUserId: pending.initiatedById,
          note: `Refunded ${pending.amountCents} ${pending.currency} via ${pending.provider}`,
        },
      }),
      ...(nextStatus === "REFUNDED"
        ? [
            this.prisma.payment.updateMany({
              where: { orderId: pending.orderId, provider: pending.provider },
              data: { status: "REFUNDED" as const },
            }),
          ]
        : []),
    ]);

    await this.auditLog.record({
      userId: pending.initiatedById ?? undefined,
      action: "refund.issued",
      entity: "Order",
      entityId: pending.orderId,
      metadata: {
        provider: pending.provider,
        amountCents: pending.amountCents,
        providerRef: result.providerRefundId,
        orderStatus: nextStatus,
      },
    });

    await this.notifyCustomer(pending);

    return refund;
  }

  /** Best-effort: a mail failure must not undo a refund that already happened. */
  private async notifyCustomer(refund: Refund): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: refund.orderId },
        include: { user: { select: { email: true, firstName: true } } },
      });
      if (!order) return;

      const amount = (refund.amountCents / 100).toFixed(2);
      const reasonText = refund.reason ? `\n\nReason: ${refund.reason}` : "";
      const reasonHtml = refund.reason ? `<p>Reason: ${refund.reason}</p>` : "";

      await this.mailer.send({
        to: order.user.email,
        subject: `Refund issued for order ${order.orderNumber}`,
        text:
          `Hi ${order.user.firstName},\n\n` +
          `We've refunded ${amount} ${refund.currency} for order ${order.orderNumber}.${reasonText}\n\n` +
          "It can take a few working days to appear on your statement.",
        html:
          `<p>Hi ${order.user.firstName},</p>` +
          `<p>We&rsquo;ve refunded <strong>${amount} ${refund.currency}</strong> for order ` +
          `<strong>${order.orderNumber}</strong>.</p>` +
          reasonHtml +
          "<p>It can take a few working days to appear on your statement.</p>",
      });
    } catch (error) {
      this.logger.warn(`Refund ${refund.id} issued but the email failed: ${(error as Error).message}`);
    }
  }

  /**
   * What was paid and what has already gone back.
   *
   * PENDING refunds count against the balance alongside SUCCEEDED ones: money
   * that may already be in flight must not be refundable a second time.
   * FAILED refunds do not count — nothing moved, so that balance is still
   * available.
   */
  private async balances(
    orderId: string,
    tx?: Prisma.TransactionClient,
    excludeRefundId?: string,
  ): Promise<{ paidCents: number; settledRefundCents: number }> {
    const client = tx ?? this.prisma;

    const [paid, refunded] = await Promise.all([
      client.payment.aggregate({
        where: { orderId, status: { in: ["SUCCEEDED", "REFUNDED"] } },
        _sum: { amountCents: true },
      }),
      client.refund.aggregate({
        where: {
          orderId,
          status: { in: ["PENDING", "SUCCEEDED"] },
          ...(excludeRefundId ? { id: { not: excludeRefundId } } : {}),
        },
        _sum: { amountCents: true },
      }),
    ]);

    return {
      paidCents: paid._sum.amountCents ?? 0,
      settledRefundCents: refunded._sum.amountCents ?? 0,
    };
  }

  private providerFor(provider: PaymentProvider): { refund(input: ProviderRefundInput): Promise<ProviderRefundResult> } {
    switch (provider) {
      case "STRIPE":
        return this.stripe;
      case "PAYSTACK":
        return this.paystack;
      case "FLUTTERWAVE":
        return this.flutterwave;
      case "PAYPAL":
        return this.paypal;
    }
  }

  private async loadOrder(orderNumber: string) {
    const order = await this.prisma.order.findFirst({
      where: { orderNumber, deletedAt: null },
    });
    if (!order) throw new NotFoundException("Order not found");
    return order;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}
