import {
  applyDiscount,
  describeAward,
  describeDiscount,
  discountProblem,
  discountValue,
  grossOf,
  removeDiscount,
  scholarshipApplies,
  type InvoiceForDiscount,
} from "./fee-discounts";

function invoice(overrides: Partial<InvoiceForDiscount> = {}): InvoiceForDiscount {
  return { totalCents: 100_000_00, discountCents: 0, paidCents: 0, status: "ISSUED", ...overrides };
}

describe("discountValue", () => {
  it("takes a percentage of the gross", () => {
    expect(discountValue({ kind: "PERCENT", value: 10 }, 100_000_00)).toBe(10_000_00);
  });

  it("rounds to the nearest minor unit", () => {
    // 33% of 1,001 minor units is 330.33.
    expect(discountValue({ kind: "PERCENT", value: 33 }, 1001)).toBe(330);
  });

  it("returns a fixed amount unchanged", () => {
    expect(discountValue({ kind: "FIXED", value: 5_000_00 }, 100_000_00)).toBe(5_000_00);
  });

  it("refuses a percentage outside 0–100", () => {
    expect(() => discountValue({ kind: "PERCENT", value: 120 }, 1000)).toThrow(/between 0 and 100/);
    expect(() => discountValue({ kind: "PERCENT", value: -5 }, 1000)).toThrow();
  });

  it("refuses a fractional fixed amount", () => {
    // Half a kobo is not money.
    expect(() => discountValue({ kind: "FIXED", value: 10.5 }, 1000)).toThrow(/whole number/);
  });
});

describe("percentages compound against the gross, not each other", () => {
  it("gives two 10% awards 20%, not 19%", () => {
    // A school explaining a bill should not have to explain an order of
    // application as well.
    let current = invoice({ totalCents: 100_000_00 });
    const first = applyDiscount(current, { kind: "PERCENT", value: 10 });
    current = { ...current, totalCents: first.totalCents, discountCents: first.discountCents };
    const second = applyDiscount(current, { kind: "PERCENT", value: 10 });

    expect(first.appliedCents).toBe(10_000_00);
    expect(second.appliedCents).toBe(10_000_00);
    expect(second.totalCents).toBe(80_000_00);
    expect(second.discountCents).toBe(20_000_00);
  });

  it("keeps the gross recoverable", () => {
    const applied = applyDiscount(invoice(), { kind: "PERCENT", value: 25 });
    expect(grossOf(applied)).toBe(100_000_00);
  });
});

describe("discountProblem", () => {
  it("allows an ordinary discount", () => {
    expect(discountProblem(invoice(), { kind: "PERCENT", value: 10 })).toBeNull();
  });

  it("REFUSES a discount that would take the bill below what has been paid", () => {
    // That does not reduce a bill, it creates a credit — money the school now
    // owes back. Credits are not modelled, exactly as overpayment is refused.
    const half = invoice({ totalCents: 100_000_00, paidCents: 90_000_00 });
    const problem = discountProblem(half, { kind: "PERCENT", value: 50 });
    expect(problem).toMatch(/more than the family still owes/i);
  });

  it("allows a discount exactly down to what has been paid", () => {
    const paid = invoice({ totalCents: 100_000_00, paidCents: 90_000_00 });
    expect(discountProblem(paid, { kind: "FIXED", value: 10_000_00 })).toBeNull();
  });

  it("refuses a settled invoice, and says why", () => {
    const settled = invoice({ paidCents: 100_000_00, status: "PAID" });
    expect(discountProblem(settled, { kind: "PERCENT", value: 10 })).toMatch(/refunding money/i);
  });

  it("refuses a voided invoice", () => {
    expect(discountProblem(invoice({ status: "VOID" }), { kind: "PERCENT", value: 10 })).toMatch(/voided/i);
  });

  it("refuses a discount worth nothing", () => {
    expect(discountProblem(invoice({ totalCents: 10 }), { kind: "PERCENT", value: 0.4 })).not.toBeNull();
  });

  it("refuses a nonsensical percentage or amount", () => {
    expect(discountProblem(invoice(), { kind: "PERCENT", value: 0 })).toMatch(/between 0 and 100/);
    expect(discountProblem(invoice(), { kind: "PERCENT", value: 101 })).toMatch(/between 0 and 100/);
    expect(discountProblem(invoice(), { kind: "FIXED", value: -1 })).toMatch(/greater than zero/);
  });

  it("refuses when there is nothing left to discount", () => {
    const nothingLeft = invoice({ totalCents: 50_000_00, paidCents: 50_000_00, status: "PARTIALLY_PAID" });
    expect(discountProblem(nothingLeft, { kind: "FIXED", value: 100 })).toMatch(/nothing left/i);
  });
});

describe("applyDiscount", () => {
  it("lowers what is payable and records what was given", () => {
    const outcome = applyDiscount(invoice(), { kind: "FIXED", value: 15_000_00 });
    expect(outcome.totalCents).toBe(85_000_00);
    expect(outcome.discountCents).toBe(15_000_00);
    expect(outcome.appliedCents).toBe(15_000_00);
  });

  it("NEVER lets the payable amount fall below what has been paid", () => {
    // Belt and braces with discountProblem: a caller that forgets to check
    // must not be able to create a refund by accident.
    expect(() =>
      applyDiscount(invoice({ paidCents: 95_000_00 }), { kind: "PERCENT", value: 50 }),
    ).toThrow();
  });

  it("throws rather than silently clamping a refused discount", () => {
    expect(() => applyDiscount(invoice({ status: "VOID" }), { kind: "FIXED", value: 100 })).toThrow(/voided/i);
  });

  it("works on an invoice that is partly paid", () => {
    const outcome = applyDiscount(
      invoice({ totalCents: 100_000_00, paidCents: 40_000_00, status: "PARTIALLY_PAID" }),
      { kind: "FIXED", value: 20_000_00 },
    );
    expect(outcome.totalCents).toBe(80_000_00);
  });
});

describe("removeDiscount", () => {
  it("puts the money back on the bill", () => {
    const outcome = removeDiscount({ ...invoice({ totalCents: 85_000_00, discountCents: 15_000_00 }) }, 15_000_00);
    expect(outcome.totalCents).toBe(100_000_00);
    expect(outcome.discountCents).toBe(0);
  });

  it("refuses to remove more than was ever given", () => {
    expect(() => removeDiscount(invoice({ discountCents: 100 }), 500)).toThrow(/larger than/i);
  });

  it("leaves payments alone", () => {
    const withPayment = invoice({ totalCents: 85_000_00, discountCents: 15_000_00, paidCents: 40_000_00 });
    const outcome = removeDiscount(withPayment, 15_000_00);
    expect(outcome.totalCents).toBe(100_000_00);
    // The outcome carries no paidCents: this function does not touch them.
    expect(Object.keys(outcome)).not.toContain("paidCents");
  });
});

describe("scholarshipApplies", () => {
  const award = {
    kind: "PERCENT" as const,
    value: 50,
    startDate: new Date("2026-09-01T00:00:00.000Z"),
    endDate: new Date("2027-07-31T00:00:00.000Z"),
    status: "ACTIVE",
  };

  it("applies inside its window", () => {
    expect(scholarshipApplies(award, new Date("2027-01-15T10:00:00.000Z"))).toBe(true);
  });

  it("includes both end days in full", () => {
    // An award running "to 31 July" covers the invoice raised on 31 July.
    expect(scholarshipApplies(award, new Date("2026-09-01T06:00:00.000Z"))).toBe(true);
    expect(scholarshipApplies(award, new Date("2027-07-31T23:00:00.000Z"))).toBe(true);
  });

  it("does not apply before or after", () => {
    expect(scholarshipApplies(award, new Date("2026-08-31T23:00:00.000Z"))).toBe(false);
    expect(scholarshipApplies(award, new Date("2027-08-01T01:00:00.000Z"))).toBe(false);
  });

  it("runs until withdrawn when there is no end date", () => {
    const ongoing = { ...award, endDate: null };
    expect(scholarshipApplies(ongoing, new Date("2030-01-01T00:00:00.000Z"))).toBe(true);
  });

  it("stops the moment it is withdrawn", () => {
    expect(scholarshipApplies({ ...award, status: "WITHDRAWN" }, new Date("2027-01-15T00:00:00.000Z"))).toBe(false);
  });
});

describe("wording", () => {
  it("reads the way a parent would say it", () => {
    expect(describeDiscount({ kind: "PERCENT", value: 20 }, "NGN")).toBe("20% off");
    expect(describeDiscount({ kind: "FIXED", value: 5_000_00 }, "NGN")).toBe("NGN 5,000.00 off");
  });

  it("says whether an award is ongoing, ending, or gone", () => {
    const base = { kind: "PERCENT" as const, value: 50, startDate: null, endDate: null, status: "ACTIVE" };
    expect(describeAward(base, "NGN")).toBe("50% off, ongoing");
    expect(describeAward({ ...base, endDate: new Date("2027-07-31T00:00:00Z") }, "NGN")).toMatch(/until 31 Jul 2027/);
    expect(describeAward({ ...base, status: "WITHDRAWN" }, "NGN")).toMatch(/withdrawn/);
  });
});
