import { BadRequestException, ConflictException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomBytes } from "node:crypto";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import { TenancyService } from "@/tenancy/tenancy.service";
import { TenantSecretsService } from "@/common/crypto/tenant-secrets.service";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import type { EnvConfig } from "@/config/env.validation";
import { FeesService } from "./fees.service";
import {
  amountToCredit,
  buildCheckoutRequest,
  buildReference,
  checkoutUrlFrom,
  invoiceIdFromReference,
  parsePaymentEvent,
  verifyWebhook,
  type FeeProvider,
} from "./fee-checkout";

/** What a webhook caller is told. Never detail: it is an unauthenticated route. */
export interface WebhookOutcome {
  received: true;
  /** For our own logs and tests, not for the provider. */
  action: "recorded" | "duplicate" | "ignored" | "refused";
}

@Injectable()
export class FeeCheckoutService {
  private readonly logger = new Logger(FeeCheckoutService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tenancy: TenancyService,
    private readonly secrets: TenantSecretsService,
    private readonly fees: FeesService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  /**
   * Starts a checkout for one invoice and hands back where to send the payer.
   *
   * Refuses clearly rather than half-working when the school has not
   * configured a gateway — the same rule as every other provider in this
   * system. A parent seeing "online payment is not set up for this school
   * yet" can ring the bursar; a parent seeing a broken redirect cannot.
   */
  async startCheckout(invoiceId: string, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();

    // Through the fees service, so a guardian asking about another family's
    // invoice is refused by the code that already owns that rule.
    const invoice = await this.fees.getInvoice(invoiceId, viewer);
    const outstanding = invoice.totalCents - invoice.paidCents;
    if (outstanding <= 0) throw new ConflictException("That invoice is already settled");

    const settings = await client.paymentGatewaySettings.findFirst({
      where: { enabled: true, secretKeyEncrypted: { not: null } },
    });
    if (!settings) {
      throw new ConflictException(
        "Online payment is not set up for this school yet. Please pay the school office directly.",
      );
    }

    const secretKey = this.secrets.tryDecrypt(settings.secretKeyEncrypted);
    if (!secretKey) {
      // The row says enabled but the key will not decrypt — a rotated
      // encryption key, most likely. Say so rather than sending the family
      // to a gateway that will reject them.
      throw new ConflictException("This school's payment settings need re-entering. Please tell the school office.");
    }

    const provider = settings.provider as FeeProvider;
    const reference = buildReference(invoice.id, randomBytes(6).toString("hex"));
    const appUrl = this.config.get("APP_URL", { infer: true });

    const request = buildCheckoutRequest({
      provider,
      secretKey,
      amountCents: outstanding,
      currency: settings.currency ?? "NGN",
      callbackUrl: `${appUrl}/invoices?paid=${encodeURIComponent(reference)}`,
      reference,
      payerEmail: await this.payerEmailFor(invoice.studentProfileId),
      invoiceNumber: invoice.invoiceNumber,
    });

    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });
    const payload = await response.json().catch(() => undefined);

    if (!response.ok) {
      // The provider's own words, which are usually specific ("Invalid key",
      // "Currency not supported for this account") and always more useful
      // than "checkout failed".
      const message =
        (payload as { message?: string } | undefined)?.message ?? `${response.status} ${response.statusText}`;
      this.logger.error(`${provider} checkout failed: ${message}`);
      throw new BadRequestException(`The payment provider refused this: ${message}`);
    }

    const url = checkoutUrlFrom(provider, payload);
    if (!url) {
      throw new BadRequestException("The payment provider did not return a checkout link");
    }

    return { url, reference, provider, amountCents: outstanding };
  }

  /**
   * A webhook from a payment provider.
   *
   * Unauthenticated by necessity — the provider has no login — so the
   * signature is the only thing standing between a stranger and a credited
   * invoice. Nothing here trusts the body until `verifyWebhook` passes.
   *
   * The school is named in the URL rather than inferred from the payload:
   * each school configures its own webhook address, and a wrong slug simply
   * fails the signature check, because the secret belongs to that school.
   */
  async handleWebhook(input: {
    schoolSlug: string;
    provider: FeeProvider;
    rawBody: Buffer;
    signatureHeader: string | undefined;
  }): Promise<WebhookOutcome> {
    const school = await this.tenancy.findActiveSchoolBySlug(input.schoolSlug);
    // Deliberately the same answer as a bad signature: an enumerator must not
    // learn which slugs are real from a webhook endpoint.
    if (!school) return this.refuse("unknown school");

    const client = await this.tenancy.getClientForSchool(school.id);
    const settings = await client.paymentGatewaySettings.findFirst({
      where: { provider: input.provider, enabled: true },
    });
    if (!settings) return this.refuse(`${input.provider} is not enabled for ${input.schoolSlug}`);

    const webhookSecret = this.secrets.tryDecrypt(settings.webhookSecretEncrypted) ?? "";
    const verified = verifyWebhook({
      provider: input.provider,
      rawBody: input.rawBody,
      signatureHeader: input.signatureHeader,
      webhookSecret,
    });
    if (!verified.ok) return this.refuse(`${input.schoolSlug}: ${verified.reason}`);

    let body: unknown;
    try {
      body = JSON.parse(input.rawBody.toString("utf8"));
    } catch {
      return this.refuse("body is not JSON");
    }

    const event = parsePaymentEvent(input.provider, body);
    // Not an error: providers send event types we do not handle, and a 500
    // would have them retrying it forever.
    if (!event) return { received: true, action: "ignored" };
    if (!event.succeeded) return { received: true, action: "ignored" };

    const invoiceId = invoiceIdFromReference(event.reference);
    if (!invoiceId) return this.refuse(`reference is not ours: ${event.reference}`);

    const invoice = await client.feeInvoice.findFirst({ where: { id: invoiceId } });
    if (!invoice) return this.refuse(`no invoice for reference ${event.reference}`);

    const decision = amountToCredit({
      eventAmountCents: event.amountCents,
      // `paidCents` is maintained on the invoice as payments land, so a
      // balance never requires summing the payment table — and this must use
      // the same number the rest of the system does.
      invoiceOutstandingCents: invoice.totalCents - invoice.paidCents,
    });
    if ("refuse" in decision) return this.refuse(`${event.reference}: ${decision.refuse}`);

    const result = await this.fees.creditGatewayPayment({
      client,
      invoiceId: invoice.id,
      amountCents: decision.credit,
      reference: event.reference,
      note: `${input.provider} ${event.eventId}`,
      recordedByName: `${input.provider} webhook`,
    });

    if (result === "duplicate") return { received: true, action: "duplicate" };
    if (typeof result === "object") return this.refuse(`${event.reference}: ${result.refused}`);
    return { received: true, action: "recorded" };
  }

  /**
   * Who the gateway should send the receipt to.
   *
   * A guardian first — they are the one paying — then the student's own
   * address. Providers reject a checkout with no email, so there is a last
   * resort that is obviously not a real inbox rather than a plausible one.
   */
  private async payerEmailFor(studentProfileId: string): Promise<string> {
    const client = await this.tenantPrisma.getClient();
    const profile = await client.studentProfile.findUnique({
      where: { id: studentProfileId },
      include: {
        user: { select: { email: true } },
        guardianLinks: { include: { guardianUser: { select: { email: true } } } },
      },
    });

    const guardianEmail = profile?.guardianLinks.map((link) => link.guardianUser.email).find(Boolean);
    return guardianEmail ?? profile?.user.email ?? "fees@school.invalid";
  }

  /**
   * Logs why, tells the caller nothing.
   *
   * A provider does not need to know which check failed, and an attacker
   * probing this endpoint must not be able to tell "wrong school" from
   * "wrong signature" from "no such invoice".
   */
  private refuse(reason: string): WebhookOutcome {
    this.logger.warn(`Fee webhook refused — ${reason}`);
    return { received: true, action: "refused" };
  }
}
