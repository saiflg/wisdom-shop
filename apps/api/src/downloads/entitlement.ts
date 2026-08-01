/**
 * Who may download a product's file.
 *
 * Kept pure so the rule can be read and tested on its own. Getting this wrong
 * is the difference between a shop and a free file host, so it is written as
 * one function with every branch named rather than as conditions scattered
 * through a service.
 */

/**
 * Orders whose money has actually been taken. The same set used by analytics
 * and vendor earnings — a customer whose order is still PENDING has not paid,
 * and one who was refunded no longer owns what they bought.
 */
// PARTIALLY_REFUNDED is included deliberately: refunds here are amounts,
// not line items, so a partial refund does not say *which* item went back.
// Revoking every download because some money was returned would take away
// files the customer still paid for. Withdrawing access is a decision for a
// full refund.
export const SETTLED_ORDER_STATUSES = [
  "PAID",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "PARTIALLY_REFUNDED",
] as const;

/** Staff who can see any product's file, for support and verification. */
const CATALOGUE_STAFF = ["ADMIN", "SUPER_ADMIN", "MANAGER", "EDITOR"];

export type DownloadRefusal =
  | { allowed: true }
  | { allowed: false; reason: "not-purchased" | "order-not-settled" };

export interface EntitlementInput {
  /** Roles on the requesting user's token. */
  roles: string[];
  /** The vendor account that owns the product, if any. */
  productVendorUserId: string | null;
  requestingUserId: string;
  /** Statuses of this user's orders that contain the product. */
  purchasedOrderStatuses: string[];
}

export function canDownload(input: EntitlementInput): DownloadRefusal {
  // Staff first: support needs to be able to check what a customer received.
  if (input.roles.some((role) => CATALOGUE_STAFF.includes(role))) {
    return { allowed: true };
  }

  // A vendor may fetch the file attached to their own product — they
  // uploaded it, and they need to confirm what buyers get.
  if (
    input.productVendorUserId !== null &&
    input.productVendorUserId === input.requestingUserId
  ) {
    return { allowed: true };
  }

  if (input.purchasedOrderStatuses.length === 0) {
    return { allowed: false, reason: "not-purchased" };
  }

  const settled = new Set<string>(SETTLED_ORDER_STATUSES);
  if (input.purchasedOrderStatuses.some((status) => settled.has(status))) {
    return { allowed: true };
  }

  // They have an order for it, but it is pending, cancelled or refunded.
  // Distinguished from "never bought it" because the two need different
  // things said to the customer.
  return { allowed: false, reason: "order-not-settled" };
}
