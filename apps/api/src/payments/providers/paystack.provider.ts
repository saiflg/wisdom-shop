import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { EnvConfig } from "../../config/env.validation";

/** The subset of Paystack's transaction-initialise response we rely on. */
interface PaystackInitResponse {
  status: boolean;
  message: string;
  data?: { authorization_url: string; access_code: string; reference: string };
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

  constructor(private readonly config: ConfigService<EnvConfig, true>) {
    if (!this.config.get("PAYSTACK_SECRET_KEY", { infer: true })) {
      this.logger.warn(
        "PAYSTACK_SECRET_KEY not configured — Paystack payments are disabled. Set it in .env to enable.",
      );
    }
  }

  get isConfigured(): boolean {
    return Boolean(this.config.get("PAYSTACK_SECRET_KEY", { infer: true }));
  }

  private requireSecretKey(): string {
    const key = this.config.get("PAYSTACK_SECRET_KEY", { infer: true });
    if (!key) {
      throw new ServiceUnavailableException(
        "Paystack payments are not configured. Set PAYSTACK_SECRET_KEY to enable them.",
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
        Authorization: `Bearer ${this.requireSecretKey()}`,
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
  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string): PaystackEvent {
    const expected = createHmac("sha512", this.requireSecretKey()).update(rawBody).digest("hex");

    const provided = Buffer.from(signatureHeader, "utf8");
    const computed = Buffer.from(expected, "utf8");
    if (provided.length !== computed.length || !timingSafeEqual(provided, computed)) {
      throw new Error("Paystack signature mismatch");
    }

    return JSON.parse(rawBody.toString("utf8")) as PaystackEvent;
  }
}
