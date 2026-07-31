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
}

export interface PricingResult {
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
}

export function calculateOrderTotals(input: PricingInput, config: PricingConfig): PricingResult {
  const shippingCents = input.requiresShipping ? config.shippingFlatCents : 0;
  // Tax applies to goods plus shipping; rounded half-up to the minor unit.
  const taxableCents = input.subtotalCents + shippingCents;
  const taxCents = Math.round((taxableCents * config.taxPercent) / 100);

  return {
    subtotalCents: input.subtotalCents,
    shippingCents,
    taxCents,
    totalCents: input.subtotalCents + shippingCents + taxCents,
  };
}
