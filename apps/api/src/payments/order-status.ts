import type { OrderStatus } from "@prisma/client";

/**
 * Allowed order status transitions.
 *
 * Webhooks arrive out of order and get retried, so transitions must be
 * explicit rather than "whatever the last message said". In particular a
 * REFUNDED or CANCELLED order must never be dragged back to PAID by a
 * late-arriving success event.
 */
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["PAID", "CANCELLED"],
  PAID: ["PROCESSING", "SHIPPED", "PARTIALLY_REFUNDED", "REFUNDED", "CANCELLED"],
  PROCESSING: ["SHIPPED", "PARTIALLY_REFUNDED", "REFUNDED", "CANCELLED"],
  SHIPPED: ["DELIVERED", "PARTIALLY_REFUNDED", "REFUNDED"],
  DELIVERED: ["PARTIALLY_REFUNDED", "REFUNDED"],
  // Fulfilment continues after a partial refund — the customer still owns
  // what they were not refunded for, and that part may still need shipping.
  PARTIALLY_REFUNDED: ["PROCESSING", "SHIPPED", "DELIVERED", "REFUNDED"],
  CANCELLED: [],
  REFUNDED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** True when the order is already in the target state — a no-op, not a failure. */
export function isAlreadyInState(from: OrderStatus, to: OrderStatus): boolean {
  return from === to;
}
