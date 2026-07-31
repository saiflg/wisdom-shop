import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { SettingsService } from "../../settings/settings.service";

/** The subset of a PayPal webhook event we act on. */
export interface PayPalEvent {
  id?: string;
  event_type?: string;
  resource?: {
    id?: string;
    status?: string;
    amount?: { value?: string; currency_code?: string };
    // On CHECKOUT.ORDER.* the amount sits under purchase_units instead.
    purchase_units?: { amount?: { value?: string; currency_code?: string }; custom_id?: string }[];
    custom_id?: string;
    supplementary_data?: { related_ids?: { order_id?: string } };
  };
}

export interface PayPalWebhookHeaders {
  transmissionId?: string;
  transmissionTime?: string;
  transmissionSig?: string;
  certUrl?: string;
  authAlgo?: string;
}

/**
 * PayPal integration.
 *
 * **⚠ Never executed against the real PayPal API.** Request shapes follow
 * their published v2 documentation and every branch is covered by tests with
 * the HTTP layer mocked, but nothing here has crossed a network to PayPal.
 * The first sandbox transaction is the real test.
 *
 * PayPal differs from every other provider here in two ways that matter:
 *
 * 1. **Calls need an OAuth token**, not a static key. Tokens are fetched with
 *    client credentials and cached until shortly before they expire, because
 *    minting one per request would double the latency of every payment.
 * 2. **Webhook verification is a remote call.** There is no local HMAC to
 *    compute: the signature is checked by asking PayPal's
 *    `verify-webhook-signature` endpoint. That means webhook handling depends
 *    on PayPal being reachable, and — importantly — that a network failure
 *    must be treated as *unverified*, never as verified. The code below fails
 *    closed for exactly that reason.
 */
@Injectable()
export class PayPalProvider {
  private readonly logger = new Logger(PayPalProvider.name);

  private cachedToken: { value: string; expiresAt: number } | null = null;

  constructor(private readonly settings: SettingsService) {}

  async isConfigured(): Promise<boolean> {
    const [id, secret] = await Promise.all([
      this.settings.isConfigured("PAYPAL_CLIENT_ID"),
      this.settings.isConfigured("PAYPAL_CLIENT_SECRET"),
    ]);
    return id && secret;
  }

  /** Sandbox unless explicitly switched to live, so a misconfiguration cannot take real money. */
  private async apiBase(): Promise<string> {
    const env = (await this.settings.get("PAYPAL_ENV")) ?? "sandbox";
    return env === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
  }

  private async credentials(): Promise<{ clientId: string; clientSecret: string }> {
    const [clientId, clientSecret] = await Promise.all([
      this.settings.get("PAYPAL_CLIENT_ID"),
      this.settings.get("PAYPAL_CLIENT_SECRET"),
    ]);
    if (!clientId || !clientSecret) {
      throw new ServiceUnavailableException(
        "PayPal payments are not configured. Add a client ID and secret in Admin → Settings → Payments to enable them.",
      );
    }
    return { clientId, clientSecret };
  }

  /**
   * An access token, cached until 60s before it expires.
   *
   * The margin matters: a token that expires in transit produces a 401 that
   * looks like a credential problem rather than a clock one.
   */
  private async accessToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now()) {
      return this.cachedToken.value;
    }

    const { clientId, clientSecret } = await this.credentials();
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const res = await fetch(`${await this.apiBase()}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    const payload = (await res.json().catch(() => undefined)) as
      | { access_token?: string; expires_in?: number }
      | undefined;

    if (!res.ok || !payload?.access_token) {
      this.logger.error(`PayPal token request failed with ${res.status}`);
      throw new ServiceUnavailableException("Couldn't authenticate with PayPal.");
    }

    this.cachedToken = {
      value: payload.access_token,
      expiresAt: Date.now() + Math.max(0, (payload.expires_in ?? 0) - 60) * 1000,
    };
    return payload.access_token;
  }

  /** Minor units to the decimal string PayPal expects ("10.50"). */
  static toAmountValue(amountMinorUnits: number): string {
    return (Math.round(amountMinorUnits) / 100).toFixed(2);
  }

  static fromAmountValue(value: string): number {
    return Math.round(Number(value) * 100);
  }

  async createOrder(input: {
    orderNumber: string;
    amountMinorUnits: number;
    currency: string;
    returnUrl: string;
    cancelUrl: string;
  }): Promise<{ redirectUrl: string; reference: string }> {
    const token = await this.accessToken();

    const res = await fetch(`${await this.apiBase()}/v2/checkout/orders`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            // custom_id is what comes back on the webhook, so the order can
            // be found without trusting anything the buyer can influence.
            custom_id: input.orderNumber,
            invoice_id: input.orderNumber,
            amount: {
              currency_code: input.currency,
              value: PayPalProvider.toAmountValue(input.amountMinorUnits),
            },
          },
        ],
        application_context: {
          return_url: input.returnUrl,
          cancel_url: input.cancelUrl,
        },
      }),
    });

    const payload = (await res.json().catch(() => undefined)) as
      | { id?: string; links?: { rel: string; href: string }[] }
      | undefined;

    const approveLink = payload?.links?.find((link) => link.rel === "approve")?.href;
    if (!res.ok || !payload?.id || !approveLink) {
      this.logger.error(`PayPal create-order failed for ${input.orderNumber}: ${res.status}`);
      throw new ServiceUnavailableException(
        "Couldn't start a PayPal payment. Please try again or use another method.",
      );
    }

    return { redirectUrl: approveLink, reference: payload.id };
  }

  /**
   * Asks PayPal whether a webhook is genuine.
   *
   * **Fails closed.** Any non-SUCCESS verdict, any non-2xx response, and any
   * network error all mean "not verified" — never "assume it is fine".
   * Getting that backwards would let anyone who can reach the endpoint mark
   * orders as paid whenever PayPal happened to be unreachable.
   */
  async verifyWebhookSignature(
    rawBody: Buffer,
    headers: PayPalWebhookHeaders,
  ): Promise<PayPalEvent> {
    const webhookId = await this.settings.get("PAYPAL_WEBHOOK_ID");
    if (!webhookId) {
      throw new ServiceUnavailableException(
        "No PayPal webhook ID is configured, so webhooks cannot be verified.",
      );
    }

    if (
      !headers.transmissionId ||
      !headers.transmissionTime ||
      !headers.transmissionSig ||
      !headers.certUrl ||
      !headers.authAlgo
    ) {
      throw new Error("PayPal webhook is missing signature headers");
    }

    const token = await this.accessToken();

    // The body is re-parsed and re-serialised by PayPal's own verifier, so
    // unlike the HMAC providers the exact bytes are not what is checked.
    const res = await fetch(`${await this.apiBase()}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        transmission_id: headers.transmissionId,
        transmission_time: headers.transmissionTime,
        transmission_sig: headers.transmissionSig,
        cert_url: headers.certUrl,
        auth_algo: headers.authAlgo,
        webhook_id: webhookId,
        webhook_event: JSON.parse(rawBody.toString("utf8")),
      }),
    });

    const payload = (await res.json().catch(() => undefined)) as
      | { verification_status?: string }
      | undefined;

    if (!res.ok || payload?.verification_status !== "SUCCESS") {
      throw new Error(
        `PayPal signature verification returned ${payload?.verification_status ?? res.status}`,
      );
    }

    return JSON.parse(rawBody.toString("utf8")) as PayPalEvent;
  }

  /** Pulls the order number out of whichever shape the event carries. */
  static orderNumberFrom(event: PayPalEvent): string | null {
    return (
      event.resource?.custom_id ??
      event.resource?.purchase_units?.[0]?.custom_id ??
      null
    );
  }

  /** Pulls the paid amount, in minor units, out of whichever shape it takes. */
  static paidMinorUnitsFrom(event: PayPalEvent): number | null {
    const value =
      event.resource?.amount?.value ?? event.resource?.purchase_units?.[0]?.amount?.value;
    if (value === undefined) return null;
    const minor = PayPalProvider.fromAmountValue(value);
    return Number.isFinite(minor) ? minor : null;
  }
}
