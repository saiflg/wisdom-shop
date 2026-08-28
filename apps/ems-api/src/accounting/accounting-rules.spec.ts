import { buildStatement, describeExclusions, isEmpty, type StatementInput } from "./accounting-rules";

const FROM = new Date("2026-09-01T00:00:00Z");
const TO = new Date("2026-12-15T00:00:00Z");

const input = (over: Partial<StatementInput> = {}): StatementInput => ({
  from: FROM,
  to: TO,
  feesReceived: { amountCents: 5_000_000_00, count: 120 },
  expensesPaid: { amountCents: 800_000_00, count: 30 },
  payrollPaid: { amountCents: 3_000_000_00, count: 3 },
  welfarePaid: { amountCents: 200_000_00, count: 4 },
  expensesApprovedUnpaid: 150_000_00,
  welfareApprovedUnpaid: 50_000_00,
  feesOutstanding: 900_000_00,
  ...over,
});

describe("buildStatement", () => {
  it("adds up income and outgoings", () => {
    const statement = buildStatement(input());
    expect(statement.incomeCents).toBe(5_000_000_00);
    expect(statement.outgoingsCents).toBe(4_000_000_00);
    expect(statement.netCents).toBe(1_000_000_00);
  });

  it("does not hide a period that lost money", () => {
    // A negative net is a real fact about a term, and rounding it away or
    // clamping it at zero is how a school finds out too late.
    const statement = buildStatement(input({ feesReceived: { amountCents: 1_000_00, count: 1 } }));
    expect(statement.netCents).toBeLessThan(0);
  });

  // The line that keeps the total honest.
  it("keeps committed-but-unpaid out of the net", () => {
    // This is a record of what moved, not a forecast. Folding in money the
    // school has promised but not paid would make the net figure describe a
    // month that has not happened.
    const statement = buildStatement(input());
    expect(statement.committedNotPaidCents).toBe(200_000_00);
    expect(statement.netCents).toBe(1_000_000_00);
  });

  it("reports what the school is owed without counting it as income", () => {
    const statement = buildStatement(input());
    expect(statement.owedToSchoolCents).toBe(900_000_00);
    expect(statement.incomeCents).toBe(5_000_000_00);
  });

  // Empty lines are dropped, not shown as zero.
  it("omits a line nothing happened on", () => {
    // "Payroll 0.00 (0)" reads as a school that paid nobody, which is a
    // different claim from a school that has not run payroll through this
    // system at all.
    const statement = buildStatement(input({ payrollPaid: { amountCents: 0, count: 0 } }));
    expect(statement.outgoings.map((l) => l.label)).not.toContain("Payroll paid");
    expect(statement.excludes.some((e) => e.startsWith("Payroll"))).toBe(true);
  });

  it("carries the counts, not just the amounts", () => {
    const statement = buildStatement(input());
    expect(statement.outgoings.find((l) => l.label === "Payroll paid")?.count).toBe(3);
  });

  it("copes with a period in which nothing happened", () => {
    const statement = buildStatement(
      input({
        feesReceived: { amountCents: 0, count: 0 },
        expensesPaid: { amountCents: 0, count: 0 },
        payrollPaid: { amountCents: 0, count: 0 },
        welfarePaid: { amountCents: 0, count: 0 },
      }),
    );
    expect(statement.netCents).toBe(0);
    expect(isEmpty(statement)).toBe(true);
  });
});

describe("describeExclusions", () => {
  // The point of the whole module.
  it("always says what is not counted", () => {
    // A head teacher reading a net figure needs to know what is not in it
    // before acting on it, and a screen called "Accounting" that quietly
    // omitted a category would produce a number somebody puts to a board.
    const excludes = describeExclusions([{ label: "Fees received", amountCents: 1, count: 1 }], []);
    expect(excludes.length).toBeGreaterThanOrEqual(2);
    expect(excludes.some((e) => e.includes("has not recorded here"))).toBe(true);
    expect(excludes.some((e) => e.includes("not yet paid"))).toBe(true);
  });

  it("names payroll specifically when no run was paid", () => {
    const excludes = describeExclusions([], []);
    expect(excludes.some((e) => e.startsWith("Payroll"))).toBe(true);
  });

  it("names fees specifically when nothing came in", () => {
    const excludes = describeExclusions([], [{ label: "Expenses paid", amountCents: 1, count: 1 }]);
    expect(excludes.some((e) => e.startsWith("Fees"))).toBe(true);
  });
});

describe("isEmpty", () => {
  it("knows a period with nothing in it from one with something", () => {
    expect(isEmpty(buildStatement(input()))).toBe(false);
  });
});
