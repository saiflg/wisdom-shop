import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import Stripe from "stripe";
import { SettingsService } from "../../settings/settings.service";
import type { ProviderRefundInput, ProviderRefundResult } from "./provider-refund";

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

  /**
   * Refunds part or all of a payment.
   *
   * Stripe refunds a *payment intent*, but what we stored when the webhook
   * arrived is the Checkout **Session** id — those are different objects, and
   * passing a session id straight to `refunds.create` fails. The session is
   * resolved to its payment intent below rather than adding a column, so
   * orders paid before refunds existed can still be refunded.
   *
   * The idempotency key goes to Stripe as well as guarding our own table: if
   * we crash after this call but before recording it, the retry returns the
   * same refund instead of sending the money twice.
   */
  async refund(input: ProviderRefundInput): Promise<ProviderRefundResult> {
    const client = await this.getClient();
    const paymentIntentId = await this.resolvePaymentIntent(client, input.providerRef);

    const refund = await client.refunds.create(
      {
        payment_intent: paymentIntentId,
        amount: input.amountMinorUnits,
        metadata: { orderNumber: input.orderNumber },
      },
      { idempotencyKey: input.idempotencyKey },
    );

    // "failed" and "canceled" mean no money moved. Returning them as a status
    // would let the order be marked refunded on the strength of a refusal.
    if (refund.status === "failed" || refund.status === "canceled") {
      throw new ServiceUnavailableException(
        `Stripe refused the refund (status ${refund.status}${
          refund.failure_reason ? `: ${refund.failure_reason}` : ""
        }).`,
      );
    }

    return {
      providerRefundId: refund.id,
      status: refund.status === "succeeded" ? "SUCCEEDED" : "PENDING",
      raw: refund,
    };
  }

  /**
   * Accepts either a payment intent id or a Checkout Session id.
   *
   * Prefix matching rather than a stored flag: Stripe's ids are stably
   * prefixed, and this keeps working for rows written before this method
   * existed.
   */
  private async resolvePaymentIntent(client: Stripe, providerRef: string): Promise<string> {
    if (providerRef.startsWith("pi_")) return providerRef;

    if (providerRef.startsWith("cs_")) {
      const session = await client.checkout.sessions.retrieve(providerRef);
      const intent = session.payment_intent;
      const intentId = typeof intent === "string" ? intent : intent?.id;
      if (!intentId) {
        throw new ServiceUnavailableException(
          "That Stripe checkout session has no payment to refund.",
        );
      }
      return intentId;
    }

    throw new ServiceUnavailableException(
      `Cannot refund Stripe reference "${providerRef}" — not a payment intent or checkout session.`,
    );
  }
}
