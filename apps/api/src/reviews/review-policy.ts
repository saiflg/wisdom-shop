/**
 * Who may review a product, and how a set of ratings is summarised.
 *
 * Pure functions, so the policy can be read in one place and tested without a
 * database.
 */

/**
 * Orders that count as having bought the thing. The same set used by
 * downloads, vendor earnings and analytics — a PENDING order has not been
 * paid for, and a cancelled or refunded one was undone.
 */
export const SETTLED_ORDER_STATUSES = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"] as const;

export type ReviewRefusal =
  | { allowed: true }
  | { allowed: false; reason: "not-purchased" | "order-not-settled" | "already-reviewed" };

export interface ReviewEligibilityInput {
  /** Statuses of this user's orders containing the product. */
  purchasedOrderStatuses: string[];
  /** True when this user already has a (non-deleted) review for it. */
  hasExistingReview: boolean;
}

/**
 * **Verified purchases only.**
 *
 * The alternative — letting any signed-in account review anything — makes the
 * rating a measure of who is most motivated to post, which for a marketplace
 * means competitors and the seller's own friends. Requiring a settled order
 * costs the price of the product per fake review, which is the only thing
 * that reliably deters them.
 *
 * The cost is real and worth stating: fewer reviews, and nothing from someone
 * who bought elsewhere. That is the trade being made deliberately.
 */
export function canReview(input: ReviewEligibilityInput): ReviewRefusal {
  if (input.purchasedOrderStatuses.length === 0) {
    return { allowed: false, reason: "not-purchased" };
  }

  const settled = new Set<string>(SETTLED_ORDER_STATUSES);
  if (!input.purchasedOrderStatuses.some((status) => settled.has(status))) {
    return { allowed: false, reason: "order-not-settled" };
  }

  // One per person per product. Editing an existing review is the supported
  // path; a second one would let a single customer weight the average.
  if (input.hasExistingReview) {
    return { allowed: false, reason: "already-reviewed" };
  }

  return { allowed: true };
}

export interface RatingSummary {
  average: number;
  count: number;
  /** How many reviews gave each score, keyed "1".."5". */
  distribution: Record<string, number>;
}

/**
 * Averages a set of ratings.
 *
 * Rounded to one decimal place *for display only* — the raw average is not
 * kept, because a stored rounded value would drift from the reviews it claims
 * to summarise the moment one is edited or removed.
 */
export function summariseRatings(ratings: number[]): RatingSummary {
  const distribution: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  for (const rating of ratings) {
    const key = String(rating);
    if (key in distribution) distribution[key] += 1;
  }

  if (ratings.length === 0) {
    return { average: 0, count: 0, distribution };
  }

  const total = ratings.reduce((sum, rating) => sum + rating, 0);
  return {
    average: Math.round((total / ratings.length) * 10) / 10,
    count: ratings.length,
    distribution,
  };
}
