import { createHmac } from "node:crypto";

/**
 * Builds a genuine `x-paystack-signature` for a payload.
 *
 * Paystack's scheme differs from Stripe's in three ways that matter:
 *  - HMAC-**SHA512**, not SHA256
 *  - keyed with the **secret key**, not a separate webhook secret
 *  - the header is the bare hex digest, with **no timestamp** — so there is
 *    no replay window, which is why idempotency carries more weight here.
 */
export function signPaystackPayload(payload: string, secretKey: string): string {
  return createHmac("sha512", secretKey).update(payload, "utf8").digest("hex");
}

export function buildPaystackChargeSuccess(input: {
  reference: string;
  orderNumber: string;
  amountMinorUnits: number;
  currency?: string;
}): string {
  return JSON.stringify({
    event: "charge.success",
    data: {
      reference: input.reference,
      amount: input.amountMinorUnits,
      currency: input.currency ?? "NGN",
      status: "success",
      metadata: { orderNumber: input.orderNumber },
    },
  });
}

export function buildPaystackRefund(input: { reference: string; orderNumber: string }): string {
  return JSON.stringify({
    event: "refund.processed",
    data: {
      reference: input.reference,
      status: "processed",
      metadata: { orderNumber: input.orderNumber },
    },
  });
}
