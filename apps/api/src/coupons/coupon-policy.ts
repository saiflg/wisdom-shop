/**
 * Coupon validity and discount arithmetic.
 *
 * Pure, because this is the code that decides how much money to take off an
 * order, and every one of its edge cases is a way to charge the wrong amount.
 */

export interface CouponLike {
  code: string;
  percentOff: number | null;
  amountOffCents: number | null;
  minSubtotalCents: number | null;
  maxRedemptions: number | null;
  redeemedCount: number;
  expiresAt: Date | null;
  active: boolean;
}

export type CouponRefusalReason =
  | "inactive"
  | "expired"
  | "fully-redeemed"
  | "below-minimum"
  | "misconfigured";

export type CouponDecision =
  | { valid: true; discountCents: number }
  | { valid: false; reason: CouponRefusalReason; message: string };

/**
 * The discount a coupon takes off a subtotal.
 *
 * **Clamped to the subtotal.** A £50 fixed-amount coupon against a £10 order
 * must take off £10, not £50 — an unclamped discount produces a negative
 * total, which downstream means refunding the customer for the privilege of
 * shopping. Also clamped at zero so a nonsensical negative coupon cannot
 * *increase* the price.
 */
export function calculateDiscountCents(coupon: CouponLike, subtotalCents: number): number {
  const raw =
    coupon.percentOff !== null
      ? Math.round((subtotalCents * coupon.percentOff) / 100)
      : (coupon.amountOffCents ?? 0);

  return Math.max(0, Math.min(raw, Math.max(0, subtotalCents)));
}

/** True when the coupon sets exactly one kind of discount. */
export function isWellFormed(coupon: Pick<CouponLike, "percentOff" | "amountOffCents">): boolean {
  const hasPercent = coupon.percentOff !== null;
  const hasAmount = coupon.amountOffCents !== null;
  // Both would leave "which one wins" to whoever reads the code next; neither
  // is a coupon that does nothing.
  return hasPercent !== hasAmount;
}

export function evaluateCoupon(
  coupon: CouponLike,
  subtotalCents: number,
  now: Date = new Date(),
): CouponDecision {
  if (!isWellFormed(coupon)) {
    return {
      valid: false,
      reason: "misconfigured",
      message: "That coupon isn't set up correctly. Please contact support.",
    };
  }

  if (!coupon.active) {
    return { valid: false, reason: "inactive", message: "That coupon is no longer available." };
  }

  if (coupon.expiresAt !== null && coupon.expiresAt.getTime() <= now.getTime()) {
    return { valid: false, reason: "expired", message: "That coupon has expired." };
  }

  if (coupon.maxRedemptions !== null && coupon.redeemedCount >= coupon.maxRedemptions) {
    return {
      valid: false,
      reason: "fully-redeemed",
      message: "That coupon has been fully redeemed.",
    };
  }

  if (coupon.minSubtotalCents !== null && subtotalCents < coupon.minSubtotalCents) {
    return {
      valid: false,
      reason: "below-minimum",
      message: `That coupon needs a subtotal of at least ${formatMinor(coupon.minSubtotalCents)}.`,
    };
  }

  return { valid: true, discountCents: calculateDiscountCents(coupon, subtotalCents) };
}

/**
 * Formats a minor-unit amount for a message. Currency-agnostic on purpose:
 * the coupon does not carry one, and guessing a symbol here would be wrong
 * for every order that is not in it.
 */
function formatMinor(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Codes are matched case-insensitively, so "SAVE10" and "save10" are one coupon. */
export function normaliseCode(code: string): string {
  return code.trim().toUpperCase();
}
