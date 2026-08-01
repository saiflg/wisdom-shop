import type { OrderStatus } from "@prisma/client";

/**
 * The rules about refund *amounts*, kept pure.
 *
 * Every function here decides something that, if wrong, sends the wrong
 * amount of money out of the merchant account. None of them touch the
 * database or a provider, so all of it can be tested exhaustively — including
 * the cases that are awkward to reach through the API, like a refund arriving
 * for an order that a provider webhook already partly refunded.
 */

/** Order statuses from which a refund makes sense at all. */
const REFUNDABLE_STATUSES: OrderStatus[] = [
  "PAID",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "PARTIALLY_REFUNDED",
];

export function isRefundableStatus(status: OrderStatus): boolean {
  return REFUNDABLE_STATUSES.includes(status);
}

/**
 * How much of an order can still be refunded.
 *
 * Only refunds that *succeeded* or are still in flight count against the
 * balance. A failed attempt did not move money, so it must not reduce what
 * can be refunded — otherwise a provider outage would permanently strand a
 * customer's money.
 */
export function refundableCents(paidCents: number, settledRefundCents: number): number {
  return Math.max(0, paidCents - settledRefundCents);
}

export interface RefundAmountCheck {
  /** Null when the refund may proceed. */
  error: string | null;
  amountCents: number;
}

/**
 * Validates a requested refund against what is left.
 *
 * `requested` may be undefined, which means "refund everything remaining" —
 * the common case, and safer to compute here than to make every caller
 * work it out.
 */
export function checkRefundAmount(input: {
  requestedCents?: number;
  paidCents: number;
  settledRefundCents: number;
}): RefundAmountCheck {
  const remaining = refundableCents(input.paidCents, input.settledRefundCents);
  const amountCents = input.requestedCents ?? remaining;

  if (remaining <= 0) {
    return { error: "This order has already been fully refunded.", amountCents: 0 };
  }
  if (!Number.isInteger(amountCents)) {
    // Money is integer minor units everywhere in this codebase. A fractional
    // amount means a unit mix-up upstream, and rounding it silently would
    // send the wrong number.
    return { error: "Refund amount must be a whole number of minor units.", amountCents: 0 };
  }
  if (amountCents <= 0) {
    return { error: "Refund amount must be greater than zero.", amountCents: 0 };
  }
  if (amountCents > remaining) {
    return {
      error: `Refund of ${amountCents} exceeds the ${remaining} still refundable on this order.`,
      amountCents: 0,
    };
  }
  return { error: null, amountCents };
}

/**
 * What the order's status becomes once a refund of `amountCents` settles.
 *
 * Compares against the amount actually *paid*, not the order total: if only
 * part of an order was ever captured, refunding that part is a full refund.
 */
export function orderStatusAfterRefund(input: {
  paidCents: number;
  settledRefundCents: number;
  amountCents: number;
}): Extract<OrderStatus, "REFUNDED" | "PARTIALLY_REFUNDED"> {
  const total = input.settledRefundCents + input.amountCents;
  return total >= input.paidCents ? "REFUNDED" : "PARTIALLY_REFUNDED";
}
