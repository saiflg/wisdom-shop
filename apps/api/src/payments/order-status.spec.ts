import type { OrderStatus } from "@prisma/client";
import { canTransition, isAlreadyInState } from "./order-status";

describe("order status transitions", () => {
  it("allows the normal payment path", () => {
    expect(canTransition("PENDING", "PAID")).toBe(true);
    expect(canTransition("PAID", "PROCESSING")).toBe(true);
    expect(canTransition("PROCESSING", "SHIPPED")).toBe(true);
    expect(canTransition("SHIPPED", "DELIVERED")).toBe(true);
  });

  it("never lets a refunded order go back to paid", () => {
    // The case that matters: a retried or late success webhook arriving
    // after a refund must not resurrect the order.
    expect(canTransition("REFUNDED", "PAID")).toBe(false);
    expect(canTransition("REFUNDED", "PROCESSING")).toBe(false);
    expect(canTransition("REFUNDED", "SHIPPED")).toBe(false);
  });

  it("treats cancelled and refunded as terminal", () => {
    const terminal: OrderStatus[] = ["CANCELLED", "REFUNDED"];
    const every: OrderStatus[] = [
      "PENDING",
      "PAID",
      "PROCESSING",
      "SHIPPED",
      "DELIVERED",
      "CANCELLED",
      "REFUNDED",
    ];

    for (const from of terminal) {
      for (const to of every) {
        expect(canTransition(from, to)).toBe(false);
      }
    }
  });

  it("does not allow skipping straight from pending to shipped", () => {
    expect(canTransition("PENDING", "SHIPPED")).toBe(false);
    expect(canTransition("PENDING", "DELIVERED")).toBe(false);
    expect(canTransition("PENDING", "REFUNDED")).toBe(false);
  });

  it("does not treat a status as a transition to itself", () => {
    expect(canTransition("PAID", "PAID")).toBe(false);
    expect(isAlreadyInState("PAID", "PAID")).toBe(true);
    expect(isAlreadyInState("PENDING", "PAID")).toBe(false);
  });

  it("allows refunds from any state where money has been taken", () => {
    expect(canTransition("PAID", "REFUNDED")).toBe(true);
    expect(canTransition("PROCESSING", "REFUNDED")).toBe(true);
    expect(canTransition("SHIPPED", "REFUNDED")).toBe(true);
    expect(canTransition("DELIVERED", "REFUNDED")).toBe(true);
    // ...but not before it has.
    expect(canTransition("PENDING", "REFUNDED")).toBe(false);
  });
});
