import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";
import type { EnvConfig } from "../../config/env.validation";

/**
 * Thin wrapper around the Stripe SDK.
 *
 * The client is created lazily and only if STRIPE_SECRET_KEY is configured.
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

  constructor(private readonly config: ConfigService<EnvConfig, true>) {
    if (!this.config.get("STRIPE_SECRET_KEY", { infer: true })) {
      this.logger.warn(
        "STRIPE_SECRET_KEY not configured — Stripe payment initiation is disabled. Set it in .env to enable.",
      );
    }
  }

  get isConfigured(): boolean {
    return Boolean(this.config.get("STRIPE_SECRET_KEY", { infer: true }));
  }

  private getClient(): Stripe {
    const secretKey = this.config.get("STRIPE_SECRET_KEY", { infer: true });
    if (!secretKey) {
      throw new ServiceUnavailableException(
        "Card payments are not configured. Set STRIPE_SECRET_KEY to enable them.",
      );
    }
    this.client ??= new Stripe(secretKey);
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
    const session = await this.getClient().checkout.sessions.create({
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
  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string): Stripe.Event {
    const webhookSecret = this.config.get("STRIPE_WEBHOOK_SECRET", { infer: true });
    if (!webhookSecret) {
      throw new ServiceUnavailableException(
        "STRIPE_WEBHOOK_SECRET is not configured, so webhooks cannot be verified.",
      );
    }

    // constructEvent does the HMAC comparison and timestamp tolerance check.
    // Deliberately using the static helper so signature verification does
    // not require a secret key (and therefore works in tests).
    return Stripe.webhooks.constructEvent(rawBody, signatureHeader, webhookSecret);
  }
}
