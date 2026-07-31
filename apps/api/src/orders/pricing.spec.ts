import { calculateOrderTotals } from "./pricing";

describe("calculateOrderTotals", () => {
  it("charges nothing extra with the default zero policy", () => {
    const result = calculateOrderTotals(
      { subtotalCents: 5000, requiresShipping: true },
      { shippingFlatCents: 0, taxPercent: 0 },
    );

    expect(result).toEqual({
      discountCents: 0,
      subtotalCents: 5000,
      shippingCents: 0,
      taxCents: 0,
      totalCents: 5000,
    });
  });

  it("applies flat shipping only when shipping is required", () => {
    const config = { shippingFlatCents: 1500, taxPercent: 0 };

    expect(calculateOrderTotals({ subtotalCents: 5000, requiresShipping: true }, config).shippingCents).toBe(1500);
    expect(calculateOrderTotals({ subtotalCents: 5000, requiresShipping: false }, config).shippingCents).toBe(0);
  });

  it("taxes goods plus shipping", () => {
    const result = calculateOrderTotals(
      { subtotalCents: 10000, requiresShipping: true },
      { shippingFlatCents: 2000, taxPercent: 10 },
    );

    // 10% of (10000 + 2000)
    expect(result.taxCents).toBe(1200);
    expect(result.totalCents).toBe(13200);
  });

  it("rounds tax to the nearest minor unit rather than leaving a fraction", () => {
    const result = calculateOrderTotals(
      { subtotalCents: 999, requiresShipping: false },
      { shippingFlatCents: 0, taxPercent: 7.5 },
    );

    // 999 * 7.5% = 74.925 → 75
    expect(result.taxCents).toBe(75);
    expect(Number.isInteger(result.taxCents)).toBe(true);
    expect(result.totalCents).toBe(1074);
  });

  it("keeps totals internally consistent", () => {
    const result = calculateOrderTotals(
      { subtotalCents: 12345, requiresShipping: true },
      { shippingFlatCents: 500, taxPercent: 5 },
    );

    expect(result.totalCents).toBe(result.subtotalCents + result.shippingCents + result.taxCents);
  });

  it("handles an empty-value subtotal without producing NaN", () => {
    const result = calculateOrderTotals(
      { subtotalCents: 0, requiresShipping: false },
      { shippingFlatCents: 0, taxPercent: 20 },
    );

    expect(result.totalCents).toBe(0);
  });
});

describe("calculateOrderTotals with a discount", () => {
  const config = { shippingFlatCents: 500, taxPercent: 10 };

  it("taxes the discounted goods, not the full price", () => {
    // Taxing the pre-discount price would charge tax on money nobody paid.
    const result = calculateOrderTotals(
      { subtotalCents: 10_000, requiresShipping: true, discountCents: 2000 },
      config,
    );

    expect(result.discountCents).toBe(2000);
    // (10000 - 2000 + 500) * 10% = 850
    expect(result.taxCents).toBe(850);
    expect(result.totalCents).toBe(10_000 - 2000 + 500 + 850);
  });

  it("does not discount shipping", () => {
    // A coupon reduces the price of the goods, not the cost of moving them.
    const result = calculateOrderTotals(
      { subtotalCents: 1000, requiresShipping: true, discountCents: 1000 },
      { shippingFlatCents: 500, taxPercent: 0 },
    );

    expect(result.shippingCents).toBe(500);
    expect(result.totalCents).toBe(500);
  });

  it("never produces a negative total", () => {
    // The clamp is the difference between a free order and refunding the
    // customer for shopping.
    const result = calculateOrderTotals(
      { subtotalCents: 1000, requiresShipping: false, discountCents: 99_999 },
      { shippingFlatCents: 0, taxPercent: 0 },
    );

    expect(result.discountCents).toBe(1000);
    expect(result.totalCents).toBe(0);
  });

  it("ignores a negative discount rather than adding to the price", () => {
    const result = calculateOrderTotals(
      { subtotalCents: 1000, requiresShipping: false, discountCents: -500 },
      { shippingFlatCents: 0, taxPercent: 0 },
    );

    expect(result.discountCents).toBe(0);
    expect(result.totalCents).toBe(1000);
  });

  it("treats an absent discount as zero", () => {
    const result = calculateOrderTotals({ subtotalCents: 1000, requiresShipping: false }, config);
    expect(result.discountCents).toBe(0);
  });
});
