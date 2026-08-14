import {
  checkRepayment,
  deductionThisMonth,
  isSettled,
  monthsRemaining,
  outstandingCents,
  summariseRegister,
  type LoanLike,
  type RegisterRow,
} from "./loan-math";

function loan(overrides: Partial<LoanLike> = {}): LoanLike {
  return {
    principalCents: 100_000_00,
    repaidCents: 0,
    monthlyDeductionCents: 25_000_00,
    status: "ACTIVE",
    ...overrides,
  };
}

describe("outstandingCents", () => {
  it("is what is left to pay", () => {
    expect(outstandingCents({ principalCents: 100_000, repaidCents: 30_000 })).toBe(70_000);
  });

  it("never goes negative, however the stored figures got that way", () => {
    // An over-repayment that slipped in historically must not show as a
    // credit the school then tries to pay back.
    expect(outstandingCents({ principalCents: 100_000, repaidCents: 150_000 })).toBe(0);
  });
});

describe("deductionThisMonth", () => {
  it("takes the usual instalment while there is plenty left", () => {
    expect(deductionThisMonth(loan())).toBe(25_000_00);
  });

  it("takes only what is left on the final month", () => {
    // The instalment is 25,000 but only 4,000 is owed. Taking 25,000 would be
    // taking money the school is not owed out of somebody's wages.
    expect(deductionThisMonth(loan({ repaidCents: 96_000_00 }))).toBe(4_000_00);
  });

  it("takes nothing once the loan is repaid", () => {
    expect(deductionThisMonth(loan({ repaidCents: 100_000_00 }))).toBe(0);
  });

  it("takes NOTHING from a written-off loan", () => {
    // Forgiving a debt and then continuing to deduct for it is the worst
    // possible outcome of a status field being ignored.
    expect(deductionThisMonth(loan({ status: "WRITTEN_OFF" }))).toBe(0);
  });

  it("takes nothing from a cancelled or settled loan", () => {
    expect(deductionThisMonth(loan({ status: "CANCELLED" }))).toBe(0);
    expect(deductionThisMonth(loan({ status: "SETTLED" }))).toBe(0);
  });

  it("recovers the whole balance when no instalment was set", () => {
    // A loan that silently never repays is harder to notice than one that
    // clears too quickly, and the cap still protects the borrower.
    expect(deductionThisMonth(loan({ monthlyDeductionCents: 0 }))).toBe(100_000_00);
  });

  it("ignores a negative instalment rather than paying somebody", () => {
    expect(deductionThisMonth(loan({ monthlyDeductionCents: -5_000_00 }))).toBe(100_000_00);
  });
});

describe("isSettled", () => {
  it("is true the moment nothing is left", () => {
    expect(isSettled({ principalCents: 50_000, repaidCents: 50_000 })).toBe(true);
  });

  it("is false while anything remains", () => {
    expect(isSettled({ principalCents: 50_000, repaidCents: 49_999 })).toBe(false);
  });
});

describe("checkRepayment", () => {
  it("accepts an ordinary instalment", () => {
    expect(checkRepayment(loan(), 25_000_00)).toEqual({ ok: true, amountCents: 25_000_00 });
  });

  it("caps an overpayment to what is owed rather than refusing it", () => {
    // Somebody entering the usual instalment on the final month is doing the
    // right thing; the system should take what is owed instead of making them
    // work out the remainder by hand.
    const result = checkRepayment(loan({ repaidCents: 98_000_00 }), 25_000_00);
    expect(result).toEqual({ ok: true, amountCents: 2_000_00 });
  });

  it("refuses a repayment against a fully repaid loan", () => {
    const result = checkRepayment(loan({ repaidCents: 100_000_00 }), 1_000);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/already repaid/);
  });

  it("refuses a repayment against a written-off loan", () => {
    const result = checkRepayment(loan({ status: "WRITTEN_OFF" }), 1_000);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/written off/);
  });

  it("refuses zero and negative amounts", () => {
    expect(checkRepayment(loan(), 0).ok).toBe(false);
    expect(checkRepayment(loan(), -500).ok).toBe(false);
  });

  it("refuses a fractional amount rather than rounding somebody's money", () => {
    const result = checkRepayment(loan(), 1_000.5);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/whole number/);
  });

  it("returns a decision instead of throwing, so one bad loan cannot abandon a payroll run", () => {
    expect(() => checkRepayment(loan({ status: "CANCELLED" }), 1_000)).not.toThrow();
  });
});

describe("monthsRemaining", () => {
  it("counts the instalments left", () => {
    expect(monthsRemaining(loan())).toBe(4);
  });

  it("rounds a part month up, because a part payment is still a month", () => {
    expect(monthsRemaining(loan({ repaidCents: 90_000_00 }))).toBe(1);
  });

  it("is zero for a cleared loan", () => {
    expect(monthsRemaining(loan({ repaidCents: 100_000_00 }))).toBe(0);
  });

  it("is null when it will never clear, rather than infinity", () => {
    // A live balance with no instalment is a standing arrangement somebody
    // should look at, not a number to render.
    expect(monthsRemaining(loan({ monthlyDeductionCents: 0 }))).toBeNull();
  });

  it("is null for a loan that is no longer being recovered", () => {
    expect(monthsRemaining(loan({ status: "WRITTEN_OFF" }))).toBeNull();
  });
});

describe("summariseRegister", () => {
  function row(overrides: Partial<RegisterRow> = {}): RegisterRow {
    return {
      loanId: "l1",
      staffName: "Abdullahi Nuhu",
      kind: "LOAN",
      reference: "LN-0001",
      issuedOn: new Date("2026-01-15T00:00:00Z"),
      principalCents: 100_000_00,
      repaidCents: 40_000_00,
      outstandingCents: 60_000_00,
      monthlyDeductionCents: 20_000_00,
      status: "ACTIVE",
      ...overrides,
    };
  }

  it("totals the register", () => {
    const totals = summariseRegister([row(), row({ loanId: "l2" })]);
    expect(totals.count).toBe(2);
    expect(totals.principalCents).toBe(200_000_00);
    expect(totals.repaidCents).toBe(80_000_00);
    expect(totals.outstandingCents).toBe(120_000_00);
  });

  it("says what this month's payroll will actually recover", () => {
    // Not the sum of the instalments: the loan with 5,000 left contributes
    // 5,000, not its 20,000 instalment.
    const totals = summariseRegister([
      row(),
      row({ loanId: "l2", repaidCents: 95_000_00, outstandingCents: 5_000_00 }),
    ]);
    expect(totals.dueThisMonthCents).toBe(20_000_00 + 5_000_00);
  });

  it("excludes written-off loans from what will be recovered", () => {
    const totals = summariseRegister([row({ status: "WRITTEN_OFF" })]);
    expect(totals.dueThisMonthCents).toBe(0);
    // Still counted as outstanding, because the money is genuinely gone and
    // hiding it would flatter the school's books.
    expect(totals.outstandingCents).toBe(60_000_00);
  });

  it("is all zeroes for a school that has lent nothing", () => {
    expect(summariseRegister([])).toEqual({
      count: 0,
      principalCents: 0,
      repaidCents: 0,
      outstandingCents: 0,
      dueThisMonthCents: 0,
    });
  });
});
