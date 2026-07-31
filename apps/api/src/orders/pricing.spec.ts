import { calculateOrderTotals } from "./pricing";

describe("calculateOrderTotals", () => {
  it("charges nothing extra with the default zero policy", () => {
    const result = calculateOrderTotals(
      { subtotalCents: 5000, requiresShipping: true },
      { shippingFlatCents: 0, taxPercent: 0 },
    );

    expect(result).toEqual({
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
