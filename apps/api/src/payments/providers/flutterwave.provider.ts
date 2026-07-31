import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { SettingsService } from "../../settings/settings.service";

/** The subset of Flutterwave's payment-initialise response we rely on. */
interface FlutterwaveInitResponse {
  status: string;
  message: string;
  data?: { link: string };
}

/** The subset of a Flutterwave webhook event we act on. */
export interface FlutterwaveEvent {
  event?: string;
  "event.type"?: string;
  data: {
    id?: number;
    tx_ref?: string;
    flw_ref?: string;
    amount?: number;
    currency?: string;
    status?: string;
    meta?: { orderNumber?: string } | null;
  };
}

/**
 * Flutterwave integration.
 *
 * **⚠ Never executed against the real Flutterwave API.** The request shapes
 * follow their published v3 documentation and every branch is covered by
 * tests with the HTTP layer mocked, but no call here has crossed a network to
 * Flutterwave. Treat the first sandbox transaction as the real test.
 *
 * Two differences from Stripe and Paystack that shape this file:
 *
 * 1. **Amounts are in MAJOR units.** Flutterwave takes `amount: 10.5` for
 *    ten pounds fifty, where the rest of this codebase — and every other
 *    provider here — works in minor units. The conversion happens once, at
 *    the boundary, and the reverse conversion on the way back in.
 * 2. **The webhook is authenticated by a shared secret, not a signature.**
 *    Flutterwave sends the configured hash verbatim in `verif-hash`; there is
 *    no HMAC over the body. That is materially weaker than Stripe or
 *    Paystack: it proves the sender knows the secret but says nothing about
 *    the payload, so a body cannot be shown to be untampered. It is compared
 *    in constant time regardless, and the amount is still reconciled against
 *    the order before anything is marked paid — which is what actually
 *    protects the money here.
 */
@Injectable()
export class FlutterwaveProvider {
  private readonly logger = new Logger(FlutterwaveProvider.name);
  private static readonly API_BASE = "https://api.flutterwave.com/v3";

  constructor(private readonly settings: SettingsService) {}

  async isConfigured(): Promise<boolean> {
    return this.settings.isConfigured("FLUTTERWAVE_SECRET_KEY");
  }

  private async requireSecretKey(): Promise<string> {
    const key = await this.settings.get("FLUTTERWAVE_SECRET_KEY");
    if (!key) {
      throw new ServiceUnavailableException(
        "Flutterwave payments are not configured. Add a secret key in Admin → Settings → Payments to enable them.",
      );
    }
    return key;
  }

  /** Minor units in, major units out — Flutterwave's API wants decimals. */
  static toMajorUnits(amountMinorUnits: number): number {
    return Math.round(amountMinorUnits) / 100;
  }

  /** And back, for reconciling a webhook amount against the stored order. */
  static toMinorUnits(amountMajorUnits: number): number {
    return Math.round(amountMajorUnits * 100);
  }

  async initializePayment(input: {
    orderNumber: string;
    amountMinorUnits: number;
    currency: string;
    customerEmail: string;
    redirectUrl: string;
  }): Promise<{ redirectUrl: string; reference: string }> {
    const secretKey = await this.requireSecretKey();

    // The order number doubles as the transaction reference, so a webhook
    // can be traced back to an order without trusting metadata.
    const reference = input.orderNumber;

    const res = await fetch(`${FlutterwaveProvider.API_BASE}/payments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tx_ref: reference,
        amount: FlutterwaveProvider.toMajorUnits(input.amountMinorUnits),
        currency: input.currency,
        redirect_url: input.redirectUrl,
        customer: { email: input.customerEmail },
        meta: { orderNumber: input.orderNumber },
      }),
    });

    const payload = (await res.json().catch(() => undefined)) as FlutterwaveInitResponse | undefined;

    if (!res.ok || payload?.status !== "success" || !payload.data?.link) {
      this.logger.error(
        `Flutterwave initialise failed for ${input.orderNumber}: ${payload?.message ?? res.status}`,
      );
      throw new ServiceUnavailableException(
        "Couldn't start a Flutterwave payment. Please try again or use another method.",
      );
    }

    return { redirectUrl: payload.data.link, reference };
  }

  /**
   * Checks the `verif-hash` header against the configured secret.
   *
   * Constant-time, so the comparison cannot be turned into a character-by-
   * character oracle by timing it — the same care the HMAC providers get,
   * even though the underlying scheme is weaker.
   */
  async verifyWebhookSignature(rawBody: Buffer, hashHeader: string): Promise<FlutterwaveEvent> {
    const secretHash = await this.settings.get("FLUTTERWAVE_WEBHOOK_HASH");
    if (!secretHash) {
      throw new ServiceUnavailableException(
        "No Flutterwave webhook hash is configured, so webhooks cannot be verified.",
      );
    }

    const provided = Buffer.from(hashHeader, "utf8");
    const expected = Buffer.from(secretHash, "utf8");
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      throw new Error("Flutterwave verif-hash mismatch");
    }

    return JSON.parse(rawBody.toString("utf8")) as FlutterwaveEvent;
  }
}
