import {
  checkRefundAmount,
  isRefundableStatus,
  orderStatusAfterRefund,
  refundableCents,
} from "./refund-policy";

describe("isRefundableStatus", () => {
  it("allows refunding an order that was actually paid for", () => {
    for (const status of ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"] as const) {
      expect(isRefundableStatus(status)).toBe(true);
    }
  });

  it("allows refunding again after a partial refund", () => {
    expect(isRefundableStatus("PARTIALLY_REFUNDED")).toBe(true);
  });

  it("refuses an order no money was ever taken for", () => {
    // Refunding a PENDING order would send money the customer never paid.
    expect(isRefundableStatus("PENDING")).toBe(false);
    expect(isRefundableStatus("CANCELLED")).toBe(false);
  });

  it("refuses an order that is already fully refunded", () => {
    expect(isRefundableStatus("REFUNDED")).toBe(false);
  });
});

describe("refundableCents", () => {
  it("is what was paid, less what has already gone back", () => {
    expect(refundableCents(5000, 0)).toBe(5000);
    expect(refundableCents(5000, 2000)).toBe(3000);
    expect(refundableCents(5000, 5000)).toBe(0);
  });

  it("never goes negative, even if the ledger says more went back than came in", () => {
    // Possible when a chargeback webhook and a manual refund both land. The
    // balance clamping means the *next* refund is refused rather than
    // computed from a negative, which would look like a large credit.
    expect(refundableCents(5000, 6000)).toBe(0);
  });
});

describe("checkRefundAmount", () => {
  it("defaults to the whole remaining balance", () => {
    const result = checkRefundAmount({ paidCents: 5000, settledRefundCents: 0 });
    expect(result).toEqual({ error: null, amountCents: 5000 });
  });

  it("defaults to what is left after an earlier partial refund", () => {
    const result = checkRefundAmount({ paidCents: 5000, settledRefundCents: 2000 });
    expect(result).toEqual({ error: null, amountCents: 3000 });
  });

  it("accepts a partial amount", () => {
    const result = checkRefundAmount({ requestedCents: 1500, paidCents: 5000, settledRefundCents: 0 });
    expect(result).toEqual({ error: null, amountCents: 1500 });
  });

  it("accepts exactly the remaining balance", () => {
    // The boundary that matters: off by one here either strands a cent or
    // over-refunds by one.
    const result = checkRefundAmount({ requestedCents: 3000, paidCents: 5000, settledRefundCents: 2000 });
    expect(result.error).toBeNull();
    expect(result.amountCents).toBe(3000);
  });

  it("refuses one minor unit more than remains", () => {
    const result = checkRefundAmount({ requestedCents: 3001, paidCents: 5000, settledRefundCents: 2000 });
    expect(result.error).toMatch(/exceeds/);
    expect(result.amountCents).toBe(0);
  });

  it("refuses a refund on a fully refunded order", () => {
    const result = checkRefundAmount({ paidCents: 5000, settledRefundCents: 5000 });
    expect(result.error).toMatch(/already been fully refunded/);
  });

  it("refuses zero and negative amounts", () => {
    // A negative refund is a charge. It must never be reachable from here.
    expect(checkRefundAmount({ requestedCents: 0, paidCents: 5000, settledRefundCents: 0 }).error)
      .toMatch(/greater than zero/);
    expect(checkRefundAmount({ requestedCents: -100, paidCents: 5000, settledRefundCents: 0 }).error)
      .toMatch(/greater than zero/);
  });

  it("refuses a fractional amount rather than rounding it", () => {
    // A non-integer means someone passed major units, or a percentage
    // calculation leaked through. Rounding would send a plausible-looking
    // wrong number; refusing surfaces the bug.
    const result = checkRefundAmount({ requestedCents: 19.99, paidCents: 5000, settledRefundCents: 0 });
    expect(result.error).toMatch(/whole number/);
    expect(result.amountCents).toBe(0);
  });

  it("returns a zero amount alongside every error", () => {
    // So a caller that ignores `error` cannot accidentally refund something.
    for (const input of [
      { requestedCents: 99999, paidCents: 5000, settledRefundCents: 0 },
      { requestedCents: -1, paidCents: 5000, settledRefundCents: 0 },
      { paidCents: 5000, settledRefundCents: 5000 },
    ]) {
      const result = checkRefundAmount(input);
      expect(result.error).not.toBeNull();
      expect(result.amountCents).toBe(0);
    }
  });
});

describe("orderStatusAfterRefund", () => {
  it("is PARTIALLY_REFUNDED when money is left on the order", () => {
    expect(orderStatusAfterRefund({ paidCents: 5000, settledRefundCents: 0, amountCents: 2000 })).toBe(
      "PARTIALLY_REFUNDED",
    );
  });

  it("is REFUNDED once the last of it goes back", () => {
    expect(orderStatusAfterRefund({ paidCents: 5000, settledRefundCents: 2000, amountCents: 3000 })).toBe(
      "REFUNDED",
    );
  });

  it("is REFUNDED in one step when the whole amount goes back at once", () => {
    expect(orderStatusAfterRefund({ paidCents: 5000, settledRefundCents: 0, amountCents: 5000 })).toBe(
      "REFUNDED",
    );
  });

  it("compares against what was paid, not the order total", () => {
    // An order can be captured for less than its face value. Refunding the
    // captured amount is a full refund, and leaving it PARTIALLY_REFUNDED
    // would make it look like the customer is still owed something.
    expect(orderStatusAfterRefund({ paidCents: 3000, settledRefundCents: 0, amountCents: 3000 })).toBe(
      "REFUNDED",
    );
  });
});
