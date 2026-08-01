import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { SettingsService } from "../../settings/settings.service";
import type { ProviderRefundInput, ProviderRefundResult } from "./provider-refund";

/** The subset of Paystack's transaction-initialise response we rely on. */
interface PaystackInitResponse {
  status: boolean;
  message: string;
  data?: { authorization_url: string; access_code: string; reference: string };
}

/** The subset of Paystack's refund response we rely on. */
interface PaystackRefundResponse {
  status: boolean;
  message: string;
  data?: { id: number | string; status: string };
}

/** The subset of a Paystack webhook event we act on. */
export interface PaystackEvent {
  event: string;
  data: {
    reference?: string;
    amount?: number;
    currency?: string;
    status?: string;
    metadata?: { orderNumber?: string } | null;
  };
}

/**
 * Paystack integration.
 *
 * Deliberately NOT a copy of the Stripe provider: Paystack signs webhooks
 * with HMAC-SHA512 over the raw body using the *secret key* (not a separate
 * webhook secret), sends it in `x-paystack-signature`, and includes no
 * timestamp — so there is no replay window to check, which is exactly why
 * the event-id idempotency ledger matters here.
 *
 * Amounts are in the currency's minor unit (kobo for NGN), matching how
 * orders are stored, so no conversion is applied.
 */
@Injectable()
export class PaystackProvider {
  private readonly logger = new Logger(PaystackProvider.name);
  private static readonly API_BASE = "https://api.paystack.co";

  constructor(private readonly settings: SettingsService) {}

  async isConfigured(): Promise<boolean> {
    return this.settings.isConfigured("PAYSTACK_SECRET_KEY");
  }

  private async requireSecretKey(): Promise<string> {
    const key = await this.settings.get("PAYSTACK_SECRET_KEY");
    if (!key) {
      throw new ServiceUnavailableException(
        "Paystack payments are not configured. Add a Paystack secret key in Admin → Settings → Payments to enable them.",
      );
    }
    return key;
  }

  async initializeTransaction(input: {
    orderNumber: string;
    amountMinorUnits: number;
    currency: string;
    customerEmail: string;
    callbackUrl: string;
  }): Promise<{ reference: string; authorizationUrl: string }> {
    const response = await fetch(`${PaystackProvider.API_BASE}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await this.requireSecretKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: input.customerEmail,
        amount: input.amountMinorUnits,
        currency: input.currency,
        reference: input.orderNumber,
        callback_url: input.callbackUrl,
        metadata: { orderNumber: input.orderNumber },
      }),
    });

    const payload = (await response.json().catch(() => undefined)) as PaystackInitResponse | undefined;

    if (!response.ok || !payload?.status || !payload.data) {
      const message = payload?.message ?? `HTTP ${response.status}`;
      this.logger.error(`Paystack transaction initialise failed: ${message}`);
      throw new ServiceUnavailableException(`Could not start Paystack payment: ${message}`);
    }

    return { reference: payload.data.reference, authorizationUrl: payload.data.authorization_url };
  }

  /**
   * Verifies `x-paystack-signature`: HMAC-SHA512 of the raw body keyed with
   * the secret key. Compared in constant time so the check can't be probed
   * byte-by-byte via timing.
   */
  async verifyWebhookSignature(rawBody: Buffer, signatureHeader: string): Promise<PaystackEvent> {
    const expected = createHmac("sha512", await this.requireSecretKey()).update(rawBody).digest("hex");

    const provided = Buffer.from(signatureHeader, "utf8");
    const computed = Buffer.from(expected, "utf8");
    if (provided.length !== computed.length || !timingSafeEqual(provided, computed)) {
      throw new Error("Paystack signature mismatch");
    }

    return JSON.parse(rawBody.toString("utf8")) as PaystackEvent;
  }

  /**
   * Refunds part or all of a transaction.
   *
   * Paystack takes the original transaction *reference* — which is exactly
   * what we stored — so no resolution step is needed here.
   *
   * It has **no idempotency header**, so a retried HTTP call really would
   * create a second refund. Our `@@unique([orderId, idempotencyKey])` is the
   * only guard, which is why the refund row is written before this is called.
   *
   * Amounts stay in minor units: Paystack works in kobo, matching storage.
   */
  async refund(input: ProviderRefundInput): Promise<ProviderRefundResult> {
    const secretKey = await this.requireSecretKey();

    const res = await fetch(`${PaystackProvider.API_BASE}/refund`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transaction: input.providerRef,
        amount: input.amountMinorUnits,
        currency: input.currency,
      }),
    });

    const payload = (await res.json().catch(() => undefined)) as PaystackRefundResponse | undefined;

    // Paystack reports business failures in the body with HTTP 200, so the
    // status code alone is not enough to know the money moved.
    if (!res.ok || !payload?.status || !payload.data) {
      throw new ServiceUnavailableException(
        `Paystack refused the refund: ${payload?.message ?? `HTTP ${res.status}`}`,
      );
    }

    return {
      providerRefundId: String(payload.data.id),
      // Paystack settles refunds asynchronously; "processed" is the only
      // state that means done.
      status: payload.data.status === "processed" ? "SUCCEEDED" : "PENDING",
      raw: payload,
    };
  }
}
