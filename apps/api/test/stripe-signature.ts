import { createHmac } from "node:crypto";

/**
 * Builds a genuine Stripe-Signature header for a payload.
 *
 * Stripe signs `${timestamp}.${payload}` with HMAC-SHA256 using the webhook
 * secret, so a valid signature can be produced locally from a test secret.
 * That means the entire webhook path — signature verification, idempotency,
 * amount reconciliation, status transitions — is testable for real without
 * network access, a Stripe account, or any live credentials.
 */
export function signStripePayload(
  payload: string,
  secret: string,
  timestampSeconds: number = Math.floor(Date.now() / 1000),
): string {
  const signature = createHmac("sha256", secret)
    .update(`${timestampSeconds}.${payload}`, "utf8")
    .digest("hex");
  return `t=${timestampSeconds},v1=${signature}`;
}

/** A minimal `checkout.session.completed` event shaped like Stripe's. */
export function buildCheckoutCompletedEvent(input: {
  eventId: string;
  sessionId: string;
  orderNumber: string;
  amountTotal: number;
  currency?: string;
}): string {
  return JSON.stringify({
    id: input.eventId,
    object: "event",
    type: "checkout.session.completed",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: input.sessionId,
        object: "checkout.session",
        amount_total: input.amountTotal,
        currency: (input.currency ?? "usd").toLowerCase(),
        client_reference_id: input.orderNumber,
        metadata: { orderNumber: input.orderNumber },
        payment_status: "paid",
        status: "complete",
      },
    },
  });
}

/** A minimal `charge.refunded` event shaped like Stripe's. */
export function buildChargeRefundedEvent(input: {
  eventId: string;
  chargeId: string;
  orderNumber: string;
}): string {
  return JSON.stringify({
    id: input.eventId,
    object: "event",
    type: "charge.refunded",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: input.chargeId,
        object: "charge",
        refunded: true,
        metadata: { orderNumber: input.orderNumber },
      },
    },
  });
}
