import { randomBytes } from "node:crypto";

/**
 * Human-quotable order reference, e.g. WS-20260730-3F9A1C4B2D.
 *
 * 40 bits of randomness per day-bucket makes collision negligible at any
 * plausible order volume, and `Order.orderNumber` is UNIQUE in the schema
 * so a collision would fail loudly rather than silently merge orders.
 */
export function generateOrderNumber(now: Date = new Date()): string {
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = randomBytes(5).toString("hex").toUpperCase();
  return `WS-${datePart}-${randomPart}`;
}
