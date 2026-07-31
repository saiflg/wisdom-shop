import {
  calculateDiscountCents,
  evaluateCoupon,
  isWellFormed,
  normaliseCode,
  type CouponLike,
} from "./coupon-policy";

const NOW = new Date("2026-07-31T12:00:00.000Z");

function coupon(overrides: Partial<CouponLike> = {}): CouponLike {
  return {
    code: "SAVE10",
    percentOff: 10,
    amountOffCents: null,
    minSubtotalCents: null,
    maxRedemptions: null,
    redeemedCount: 0,
    expiresAt: null,
    active: true,
    ...overrides,
  };
}

describe("calculateDiscountCents", () => {
  it("takes a percentage off", () => {
    expect(calculateDiscountCents(coupon({ percentOff: 10 }), 10_000)).toBe(1000);
    expect(calculateDiscountCents(coupon({ percentOff: 100 }), 10_000)).toBe(10_000);
  });

  it("rounds a percentage to the minor unit", () => {
    // 15% of 19.99 is 2.9985 — it has to land on a whole number of cents.
    expect(calculateDiscountCents(coupon({ percentOff: 15 }), 1999)).toBe(300);
  });

  it("takes a fixed amount off", () => {
    expect(
      calculateDiscountCents(coupon({ percentOff: null, amountOffCents: 500 }), 10_000),
    ).toBe(500);
  });

  it("never discounts more than the order is worth", () => {
    // A £50 coupon against a £10 order takes off £10. Unclamped, the order
    // total goes negative, which means paying the customer to shop.
    expect(
      calculateDiscountCents(coupon({ percentOff: null, amountOffCents: 5000 }), 1000),
    ).toBe(1000);
  });

  it("never returns a negative discount", () => {
    // A negative coupon would otherwise *increase* the price.
    expect(
      calculateDiscountCents(coupon({ percentOff: null, amountOffCents: -500 }), 1000),
    ).toBe(0);
    expect(calculateDiscountCents(coupon({ percentOff: -10 }), 1000)).toBe(0);
  });

  it("handles a zero subtotal without going negative", () => {
    expect(calculateDiscountCents(coupon({ percentOff: null, amountOffCents: 500 }), 0)).toBe(0);
  });
});

describe("evaluateCoupon", () => {
  it("accepts a plain active coupon", () => {
    expect(evaluateCoupon(coupon(), 10_000, NOW)).toEqual({ valid: true, discountCents: 1000 });
  });

  it("refuses an inactive coupon", () => {
    expect(evaluateCoupon(coupon({ active: false }), 10_000, NOW)).toMatchObject({
      valid: false,
      reason: "inactive",
    });
  });

  it("refuses an expired coupon", () => {
    expect(
      evaluateCoupon(coupon({ expiresAt: new Date("2026-07-30T12:00:00.000Z") }), 10_000, NOW),
    ).toMatchObject({ valid: false, reason: "expired" });
  });

  it("treats the expiry instant itself as expired", () => {
    // A coupon "valid until noon" should not still work at exactly noon.
    expect(evaluateCoupon(coupon({ expiresAt: NOW }), 10_000, NOW)).toMatchObject({
      reason: "expired",
    });
  });

  it("accepts one that expires later", () => {
    expect(
      evaluateCoupon(coupon({ expiresAt: new Date("2026-08-01T12:00:00.000Z") }), 10_000, NOW),
    ).toEqual({ valid: true, discountCents: 1000 });
  });

  it("refuses one that is fully redeemed", () => {
    expect(
      evaluateCoupon(coupon({ maxRedemptions: 5, redeemedCount: 5 }), 10_000, NOW),
    ).toMatchObject({ valid: false, reason: "fully-redeemed" });
  });

  it("allows the last redemption", () => {
    // Off-by-one here either wastes a use or gives one away.
    expect(evaluateCoupon(coupon({ maxRedemptions: 5, redeemedCount: 4 }), 10_000, NOW)).toEqual({
      valid: true,
      discountCents: 1000,
    });
  });

  it("refuses below the minimum spend", () => {
    expect(
      evaluateCoupon(coupon({ minSubtotalCents: 5000 }), 4999, NOW),
    ).toMatchObject({ valid: false, reason: "below-minimum" });
  });

  it("accepts exactly at the minimum spend", () => {
    expect(evaluateCoupon(coupon({ minSubtotalCents: 5000 }), 5000, NOW)).toMatchObject({
      valid: true,
    });
  });

  it("refuses a coupon that sets both kinds of discount", () => {
    // Which one wins would otherwise be decided by whoever reads the code.
    expect(
      evaluateCoupon(coupon({ percentOff: 10, amountOffCents: 500 }), 10_000, NOW),
    ).toMatchObject({ valid: false, reason: "misconfigured" });
  });

  it("refuses a coupon that sets neither", () => {
    expect(
      evaluateCoupon(coupon({ percentOff: null, amountOffCents: null }), 10_000, NOW),
    ).toMatchObject({ valid: false, reason: "misconfigured" });
  });

  it("reports the minimum in the message so the customer knows the gap", () => {
    const decision = evaluateCoupon(coupon({ minSubtotalCents: 5000 }), 1000, NOW);
    expect(decision.valid).toBe(false);
    if (!decision.valid) expect(decision.message).toContain("50.00");
  });
});

describe("isWellFormed", () => {
  it("requires exactly one kind of discount", () => {
    expect(isWellFormed({ percentOff: 10, amountOffCents: null })).toBe(true);
    expect(isWellFormed({ percentOff: null, amountOffCents: 500 })).toBe(true);
    expect(isWellFormed({ percentOff: 10, amountOffCents: 500 })).toBe(false);
    expect(isWellFormed({ percentOff: null, amountOffCents: null })).toBe(false);
  });
});

describe("normaliseCode", () => {
  it("matches codes case-insensitively and ignores stray spacing", () => {
    expect(normaliseCode("  save10 ")).toBe("SAVE10");
    expect(normaliseCode("SaVe10")).toBe("SAVE10");
  });
});
