import {
  checkCurrencies,
  oldestFirst,
  payrollPaymentReference,
  planRecovery,
  type OutstandingInvoice,
} from "./staff-fee-recovery";

let counter = 0;
function invoice(overrides: Partial<OutstandingInvoice> = {}): OutstandingInvoice {
  counter += 1;
  return {
    invoiceId: `inv${counter}`,
    studentProfileId: "s1",
    studentName: "Tunde Bello",
    invoiceNumber: `INV-${String(counter).padStart(4, "0")}`,
    outstandingCents: 40_000_00,
    currency: "NGN",
    dueDate: new Date("2026-09-30T00:00:00Z"),
    issuedAt: new Date("2026-09-01T00:00:00Z"),
    ...overrides,
  };
}

describe("planRecovery", () => {
  it("takes the agreed amount when the family owes more", () => {
    const plan = planRecovery([invoice({ outstandingCents: 100_000_00 })], 20_000_00);
    expect(plan.totalCents).toBe(20_000_00);
    expect(plan.remainingCents).toBe(80_000_00);
  });

  it("NEVER recovers more than the family owes", () => {
    // Money taken against a bill that does not exist is money taken from
    // somebody's wages.
    const plan = planRecovery([invoice({ outstandingCents: 5_000_00 })], 20_000_00);
    expect(plan.totalCents).toBe(5_000_00);
    expect(plan.remainingCents).toBe(0);
  });

  it("NEVER takes more in a month than the agreed amount", () => {
    // A teacher whose children owe a full term must not lose a month's pay.
    const plan = planRecovery(
      [invoice({ outstandingCents: 500_000_00 })],
      15_000_00,
    );
    expect(plan.totalCents).toBe(15_000_00);
  });

  describe("a cap of zero", () => {
    it("means the arrangement is off, NOT take everything", () => {
      // The worst possible reading of an unset field would empty a salary.
      const plan = planRecovery([invoice({ outstandingCents: 100_000_00 })], 0);
      expect(plan.totalCents).toBe(0);
      expect(plan.allocations).toEqual([]);
      expect(plan.remainingCents).toBe(100_000_00);
    });

    it("treats a negative cap the same way", () => {
      expect(planRecovery([invoice()], -5_000_00).totalCents).toBe(0);
    });
  });

  describe("spreading across several bills", () => {
    it("pays the OLDEST bill first rather than splitting evenly", () => {
      // Split evenly, four invoices stay unpaid and the family keeps getting
      // arrears letters about all four.
      const older = invoice({
        invoiceNumber: "INV-OLD",
        outstandingCents: 10_000_00,
        dueDate: new Date("2026-06-30T00:00:00Z"),
      });
      const newer = invoice({
        invoiceNumber: "INV-NEW",
        outstandingCents: 10_000_00,
        dueDate: new Date("2026-12-31T00:00:00Z"),
      });

      const plan = planRecovery([newer, older], 10_000_00);
      expect(plan.allocations).toHaveLength(1);
      expect(plan.allocations[0].invoiceNumber).toBe("INV-OLD");
    });

    it("fills the oldest completely before touching the next", () => {
      const plan = planRecovery(
        [
          invoice({ invoiceNumber: "A", outstandingCents: 6_000_00, dueDate: new Date("2026-01-31T00:00:00Z") }),
          invoice({ invoiceNumber: "B", outstandingCents: 6_000_00, dueDate: new Date("2026-05-31T00:00:00Z") }),
        ],
        9_000_00,
      );
      expect(plan.allocations.map((a) => [a.invoiceNumber, a.amountCents])).toEqual([
        ["A", 6_000_00],
        ["B", 3_000_00],
      ]);
      expect(plan.totalCents).toBe(9_000_00);
    });

    it("spreads across two children the same way", () => {
      const plan = planRecovery(
        [
          invoice({
            invoiceNumber: "SIS",
            studentProfileId: "s2",
            studentName: "Ada Bello",
            outstandingCents: 4_000_00,
            dueDate: new Date("2026-02-28T00:00:00Z"),
          }),
          invoice({
            invoiceNumber: "BRO",
            outstandingCents: 4_000_00,
            dueDate: new Date("2026-03-31T00:00:00Z"),
          }),
        ],
        6_000_00,
      );
      expect(plan.allocations.map((a) => a.studentName)).toEqual(["Ada Bello", "Tunde Bello"]);
      expect(plan.allocations.map((a) => a.amountCents)).toEqual([4_000_00, 2_000_00]);
    });

    it("never allocates more to an invoice than that invoice owes", () => {
      const plan = planRecovery(
        [
          invoice({ invoiceNumber: "SMALL", outstandingCents: 1_000_00 }),
          invoice({ invoiceNumber: "BIG", outstandingCents: 90_000_00 }),
        ],
        50_000_00,
      );
      for (const allocation of plan.allocations) {
        const source = allocation.invoiceNumber === "SMALL" ? 1_000_00 : 90_000_00;
        expect(allocation.amountCents).toBeLessThanOrEqual(source);
      }
      expect(plan.totalCents).toBe(50_000_00);
    });
  });

  it("ignores invoices that are already settled", () => {
    const plan = planRecovery(
      [invoice({ outstandingCents: 0 }), invoice({ invoiceNumber: "OWING", outstandingCents: 3_000_00 })],
      10_000_00,
    );
    expect(plan.allocations).toHaveLength(1);
    expect(plan.allocations[0].invoiceNumber).toBe("OWING");
  });

  it("does nothing for a family that owes nothing", () => {
    const plan = planRecovery([invoice({ outstandingCents: 0 })], 20_000_00);
    expect(plan).toEqual({
      totalCents: 0,
      allocations: [],
      remainingCents: 0,
      outstandingCents: 0,
    });
  });

  it("does nothing for a staff member with no children in the school", () => {
    expect(planRecovery([], 20_000_00).totalCents).toBe(0);
  });

  it("allocates exactly the total it reports", () => {
    // The plan and its parts must agree, or the payslip and the fee ledger
    // will not.
    const plan = planRecovery(
      [
        invoice({ outstandingCents: 3_333_00 }),
        invoice({ outstandingCents: 7_777_00 }),
        invoice({ outstandingCents: 1_111_00 }),
      ],
      9_000_00,
    );
    const summed = plan.allocations.reduce((t, a) => t + a.amountCents, 0);
    expect(summed).toBe(plan.totalCents);
    expect(plan.totalCents + plan.remainingCents).toBe(plan.outstandingCents);
  });
});

describe("oldestFirst", () => {
  it("sorts an invoice with no dates last", () => {
    // It cannot be overdue if nobody said when it was due, and inventing a
    // date would silently prioritise it over a bill that genuinely is late.
    const dated = invoice({ invoiceNumber: "DATED", dueDate: new Date("2027-01-01T00:00:00Z") });
    const undated = invoice({ invoiceNumber: "UNDATED", dueDate: null, issuedAt: null });
    expect([undated, dated].sort(oldestFirst).map((i) => i.invoiceNumber)).toEqual([
      "DATED",
      "UNDATED",
    ]);
  });

  it("falls back to the issue date when nothing is due", () => {
    const early = invoice({ invoiceNumber: "EARLY", dueDate: null, issuedAt: new Date("2026-01-01T00:00:00Z") });
    const late = invoice({ invoiceNumber: "LATE", dueDate: null, issuedAt: new Date("2026-06-01T00:00:00Z") });
    expect([late, early].sort(oldestFirst).map((i) => i.invoiceNumber)).toEqual(["EARLY", "LATE"]);
  });

  it("breaks a tie stably, so a preview does not change between runs", () => {
    const same = new Date("2026-03-01T00:00:00Z");
    const b = invoice({ invoiceNumber: "B", dueDate: same });
    const a = invoice({ invoiceNumber: "A", dueDate: same });
    expect([b, a].sort(oldestFirst).map((i) => i.invoiceNumber)).toEqual(["A", "B"]);
  });
});

describe("checkCurrencies", () => {
  it("accepts fees billed in the salary currency", () => {
    expect(checkCurrencies([invoice({ currency: "NGN" })], "NGN")).toEqual({ ok: true });
  });

  it("REFUSES to settle a bill in another currency", () => {
    // Deciding which of two currencies a deduction settles would be inventing
    // an exchange rate on the school's behalf.
    const result = checkCurrencies([invoice({ currency: "USD" })], "NGN");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("USD");
  });

  it("ignores the currency of an invoice that is already paid", () => {
    expect(
      checkCurrencies([invoice({ currency: "USD", outstandingCents: 0 })], "NGN"),
    ).toEqual({ ok: true });
  });

  it("is case-insensitive about currency codes", () => {
    expect(checkCurrencies([invoice({ currency: "ngn" })], "NGN")).toEqual({ ok: true });
  });

  it("accepts a family with nothing owing", () => {
    expect(checkCurrencies([], "NGN")).toEqual({ ok: true });
  });
});

describe("payrollPaymentReference", () => {
  it("is stable for a run, which is what makes it idempotent", () => {
    // fee_payments is unique on (invoiceId, reference), so a run applied twice
    // is refused by the database rather than by a caller remembering to check.
    expect(payrollPaymentReference("run_abc")).toBe("payroll:run_abc");
    expect(payrollPaymentReference("run_abc")).toBe(payrollPaymentReference("run_abc"));
  });

  it("differs between runs, so next month can still be recovered", () => {
    expect(payrollPaymentReference("run_a")).not.toBe(payrollPaymentReference("run_b"));
  });
});
