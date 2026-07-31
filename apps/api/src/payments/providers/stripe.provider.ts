import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import Stripe from "stripe";
import { SettingsService } from "../../settings/settings.service";

/**
 * Thin wrapper around the Stripe SDK.
 *
 * The client is created lazily and only if a secret key is configured, from
 * Admin → Settings → Payments or the STRIPE_SECRET_KEY environment variable.
 * The project owner supplies that key themselves — nothing in this repo
 * ships a key, and with none set every call that would reach Stripe fails
 * with a clear 503 instead of a confusing SDK error.
 *
 * Signature verification is separate (see verifyWebhookSignature) and needs
 * only the webhook secret, so the webhook path is fully testable locally
 * without a secret key or any network access.
 */
@Injectable()
export class StripeProvider {
  private readonly logger = new Logger(StripeProvider.name);
  private client: Stripe | null = null;
  /** The key the cached client was built with, so a key change takes effect. */
  private clientKey: string | null = null;

  constructor(private readonly settings: SettingsService) {}

  async isConfigured(): Promise<boolean> {
    return this.settings.isConfigured("STRIPE_SECRET_KEY");
  }

  private async getClient(): Promise<Stripe> {
    const secretKey = await this.settings.get("STRIPE_SECRET_KEY");
    if (!secretKey) {
      throw new ServiceUnavailableException(
        "Card payments are not configured. Add a Stripe secret key in Admin → Settings → Payments to enable them.",
      );
    }
    // Rebuilt when the key changes: a client cached from the previous key
    // would keep charging the old account after a rotation.
    if (!this.client || this.clientKey !== secretKey) {
      this.client = new Stripe(secretKey);
      this.clientKey = secretKey;
    }
    return this.client;
  }

  /**
   * Creates a Checkout Session for an order.
   *
   * `metadata.orderNumber` is what the webhook uses to find the order again,
   * and `client_reference_id` gives the same value a first-class slot in the
   * Stripe dashboard for support lookups.
   */
  async createCheckoutSession(input: {
    orderNumber: string;
    amountCents: number;
    currency: string;
    customerEmail: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ id: string; url: string | null }> {
    const client = await this.getClient();
    const session = await client.checkout.sessions.create({
      mode: "payment",
      client_reference_id: input.orderNumber,
      customer_email: input.customerEmail,
      metadata: { orderNumber: input.orderNumber },
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: input.currency.toLowerCase(),
            unit_amount: input.amountCents,
            product_data: { name: `Wisdom Shop order ${input.orderNumber}` },
          },
        },
      ],
    });

    return { id: session.id, url: session.url };
  }

  /**
   * Verifies the Stripe-Signature header against the raw request bytes.
   * Throws if the signature is invalid, the timestamp is outside Stripe's
   * tolerance, or no webhook secret is configured — a webhook we cannot
   * authenticate must never be trusted.
   */
  async verifyWebhookSignature(rawBody: Buffer, signatureHeader: string): Promise<Stripe.Event> {
    const webhookSecret = await this.settings.get("STRIPE_WEBHOOK_SECRET");
    if (!webhookSecret) {
      throw new ServiceUnavailableException(
        "No Stripe webhook signing secret is configured, so webhooks cannot be verified.",
      );
    }

    // constructEvent does the HMAC comparison and timestamp tolerance check.
    // Deliberately using the static helper so signature verification does
    // not require a secret key (and therefore works in tests).
    return Stripe.webhooks.constructEvent(rawBody, signatureHeader, webhookSecret);
  }
}
