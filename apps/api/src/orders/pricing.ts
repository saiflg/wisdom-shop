/**
 * Order pricing policy.
 *
 * Only a FLAT shipping strategy is implemented. The spec also calls for
 * weight-, distance-, and zone-based shipping plus real tax jurisdictions;
 * those need rate tables and a tax provider, so rather than half-build
 * them this exposes one honest, configurable strategy. Both values default
 * to 0 so no charge is ever invented without being configured explicitly.
 */
export interface PricingConfig {
  shippingFlatCents: number;
  taxPercent: number;
}

export interface PricingInput {
  subtotalCents: number;
  requiresShipping: boolean;
  /** Already clamped to the subtotal by the coupon policy. */
  discountCents?: number;
}

export interface PricingResult {
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
}

export function calculateOrderTotals(input: PricingInput, config: PricingConfig): PricingResult {
  const shippingCents = input.requiresShipping ? config.shippingFlatCents : 0;

  // Never more than the goods are worth, and never negative — a discount
  // that exceeded the subtotal would produce a negative total, which means
  // paying the customer to shop.
  const discountCents = Math.max(0, Math.min(input.discountCents ?? 0, input.subtotalCents));

  // Tax applies to the *discounted* goods plus shipping. Taxing the full
  // price and then discounting would charge tax on money nobody paid.
  // Shipping is deliberately not discounted: a coupon reduces the price of
  // the goods, not the cost of moving them.
  const taxableCents = input.subtotalCents - discountCents + shippingCents;
  const taxCents = Math.round((taxableCents * config.taxPercent) / 100);

  return {
    subtotalCents: input.subtotalCents,
    discountCents,
    shippingCents,
    taxCents,
    totalCents: input.subtotalCents - discountCents + shippingCents + taxCents,
  };
}
