import {
  computePayslip,
  findBasicCents,
  formatPayPeriod,
  formatPayslipNumber,
  isOverDeducted,
  percentOf,
  summarisePayroll,
  type SalaryComponentInput,
} from "./payroll-math";

const basic = (amount: number): SalaryComponentInput => ({
  label: "Basic",
  kind: "EARNING",
  basis: "FIXED",
  amount,
  isBasic: true,
});

describe("percentOf", () => {
  it("takes a percentage of basic pay", () => {
    // 10% of 200,000 kobo
    expect(percentOf(200_000, 1000)).toBe(20_000);
  });

  it("handles fractional percentages", () => {
    // 12.5% of 200,000
    expect(percentOf(200_000, 1250)).toBe(25_000);
  });

  it("rounds half up, consistently", () => {
    // 1% of 50 = 0.5 of a minor unit
    expect(percentOf(50, 100)).toBe(1);
    expect(percentOf(150, 100)).toBe(2);
  });

  it("is zero for a zero rate or zero basic", () => {
    expect(percentOf(200_000, 0)).toBe(0);
    expect(percentOf(0, 1000)).toBe(0);
  });

  it("handles 100 percent", () => {
    expect(percentOf(200_000, 10_000)).toBe(200_000);
  });

  it("rejects floats rather than rounding them", () => {
    expect(() => percentOf(200_000.5, 1000)).toThrow(/whole number/);
    expect(() => percentOf(200_000, 12.5)).toThrow(/whole number/);
  });

  it("rejects negatives", () => {
    expect(() => percentOf(-1, 1000)).toThrow(/negative/);
    expect(() => percentOf(200_000, -100)).toThrow(/negative/);
  });
});

describe("findBasicCents", () => {
  it("finds the component flagged as basic", () => {
    expect(
      findBasicCents([
        { label: "Housing", kind: "EARNING", basis: "FIXED", amount: 50_000 },
        basic(200_000),
      ]),
    ).toBe(200_000);
  });

  it("is zero when nothing is flagged, so percentages come to nothing rather than guessing", () => {
    expect(findBasicCents([{ label: "Housing", kind: "EARNING", basis: "FIXED", amount: 50_000 }])).toBe(0);
    expect(findBasicCents([])).toBe(0);
  });

  it("ignores a deduction that claims to be basic", () => {
    expect(
      findBasicCents([{ label: "Odd", kind: "DEDUCTION", basis: "FIXED", amount: 100, isBasic: true }]),
    ).toBe(0);
  });

  it("refuses a basic that is itself a percentage, which has no fixed point", () => {
    expect(() =>
      findBasicCents([
        { label: "Basic", kind: "EARNING", basis: "PERCENT_OF_BASIC", amount: 5000, isBasic: true },
      ]),
    ).toThrow(/fixed amount/);
  });
});

describe("computePayslip", () => {
  it("sums a simple fixed salary", () => {
    const result = computePayslip([
      basic(200_000),
      { label: "Housing", kind: "EARNING", basis: "FIXED", amount: 50_000 },
      { label: "Tax", kind: "DEDUCTION", basis: "FIXED", amount: 30_000 },
    ]);

    expect(result.grossCents).toBe(250_000);
    expect(result.deductionsCents).toBe(30_000);
    expect(result.netCents).toBe(220_000);
  });

  it("computes percentage components against basic, not gross", () => {
    // Pension at 8% is 8% of 200,000 = 16,000 — not 8% of the 250,000 gross.
    const result = computePayslip([
      basic(200_000),
      { label: "Housing", kind: "EARNING", basis: "FIXED", amount: 50_000 },
      { label: "Pension", kind: "DEDUCTION", basis: "PERCENT_OF_BASIC", amount: 800 },
    ]);

    expect(result.deductionsCents).toBe(16_000);
    expect(result.netCents).toBe(234_000);
  });

  it("resolves every component to an amount on the payslip", () => {
    const result = computePayslip([
      basic(200_000),
      { label: "Pension", kind: "DEDUCTION", basis: "PERCENT_OF_BASIC", amount: 800 },
    ]);

    // A payslip showing "8%" instead of an amount is not a payslip.
    expect(result.lines).toEqual([
      { label: "Basic", kind: "EARNING", amountCents: 200_000 },
      { label: "Pension", kind: "DEDUCTION", amountCents: 16_000 },
    ]);
  });

  it("keeps the parts summing to the whole", () => {
    const result = computePayslip([
      basic(123_457),
      { label: "A", kind: "EARNING", basis: "PERCENT_OF_BASIC", amount: 333 },
      { label: "B", kind: "DEDUCTION", basis: "PERCENT_OF_BASIC", amount: 777 },
    ]);

    const earnings = result.lines.filter((l) => l.kind === "EARNING").reduce((s, l) => s + l.amountCents, 0);
    const deductions = result.lines.filter((l) => l.kind === "DEDUCTION").reduce((s, l) => s + l.amountCents, 0);

    expect(earnings).toBe(result.grossCents);
    expect(deductions).toBe(result.deductionsCents);
    expect(result.netCents).toBe(result.grossCents - result.deductionsCents);
  });

  it("never returns a negative net", () => {
    // A data-entry mistake, not a debt owed to the school.
    const result = computePayslip([
      basic(100_000),
      { label: "Loan", kind: "DEDUCTION", basis: "FIXED", amount: 150_000 },
    ]);
    expect(result.netCents).toBe(0);
  });

  it("flags an over-deducted salary rather than hiding it behind the clamp", () => {
    const overdrawn = computePayslip([
      basic(100_000),
      { label: "Loan", kind: "DEDUCTION", basis: "FIXED", amount: 150_000 },
    ]);
    expect(isOverDeducted(overdrawn)).toBe(true);

    const normal = computePayslip([basic(100_000)]);
    expect(isOverDeducted(normal)).toBe(false);
  });

  it("handles a salary with no components at all", () => {
    expect(computePayslip([])).toEqual({ lines: [], grossCents: 0, deductionsCents: 0, netCents: 0 });
  });

  it("treats percentages as zero when no basic is set, rather than guessing a base", () => {
    const result = computePayslip([
      { label: "Housing", kind: "EARNING", basis: "FIXED", amount: 50_000 },
      { label: "Pension", kind: "DEDUCTION", basis: "PERCENT_OF_BASIC", amount: 800 },
    ]);
    expect(result.deductionsCents).toBe(0);
    expect(result.netCents).toBe(50_000);
  });

  it("rejects a float amount rather than rounding somebody's salary", () => {
    expect(() =>
      computePayslip([{ label: "Basic", kind: "EARNING", basis: "FIXED", amount: 200_000.5, isBasic: true }]),
    ).toThrow(/whole number/);
  });

  it("rejects a negative component", () => {
    expect(() =>
      computePayslip([{ label: "Odd", kind: "EARNING", basis: "FIXED", amount: -100 }]),
    ).toThrow(/negative/);
  });
});

describe("summarisePayroll", () => {
  it("totals what the school is about to pay", () => {
    expect(
      summarisePayroll([
        { grossCents: 250_000, deductionsCents: 30_000, netCents: 220_000 },
        { grossCents: 150_000, deductionsCents: 10_000, netCents: 140_000 },
      ]),
    ).toEqual({ staffCount: 2, grossCents: 400_000, deductionsCents: 40_000, netCents: 360_000 });
  });

  it("is all zeroes for an empty run rather than NaN", () => {
    expect(summarisePayroll([])).toEqual({
      staffCount: 0,
      grossCents: 0,
      deductionsCents: 0,
      netCents: 0,
    });
  });
});

describe("formatPayPeriod", () => {
  it("names the month", () => {
    expect(formatPayPeriod(2027, 3)).toBe("March 2027");
    expect(formatPayPeriod(2027, 1)).toBe("January 2027");
    expect(formatPayPeriod(2027, 12)).toBe("December 2027");
  });

  it("rejects a month outside 1-12 rather than printing undefined", () => {
    expect(() => formatPayPeriod(2027, 0)).toThrow(/1-12/);
    expect(() => formatPayPeriod(2027, 13)).toThrow(/1-12/);
    expect(() => formatPayPeriod(2027, 1.5)).toThrow(/1-12/);
  });
});

describe("formatPayslipNumber", () => {
  it("pads so payslips sort in order", () => {
    expect(formatPayslipNumber(2027, 3, 4)).toBe("PS-2027-03-000004");
    expect(formatPayslipNumber(2027, 11, 1234)).toBe("PS-2027-11-001234");
  });

  it("sorts lexicographically in chronological order", () => {
    const numbers = [
      formatPayslipNumber(2027, 11, 2),
      formatPayslipNumber(2027, 3, 10),
      formatPayslipNumber(2026, 12, 1),
    ];
    expect([...numbers].sort()).toEqual([
      "PS-2026-12-000001",
      "PS-2027-03-000010",
      "PS-2027-11-000002",
    ]);
  });
});
