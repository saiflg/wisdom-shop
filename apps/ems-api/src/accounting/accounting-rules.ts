/**
 * A money summary for a period.
 *
 * This is NOT double-entry bookkeeping and does not pretend to be. There is
 * no chart of accounts, no journal, no trial balance. It reads what the
 * school has already recorded — fees received, expenses paid, payroll paid,
 * welfare paid — and adds it up over a period.
 *
 * Saying so matters, because a screen called "Accounting" that quietly
 * omitted a category would produce a figure somebody puts in front of a
 * board. Every line here names what it counts, and anything not counted is
 * listed rather than left out.
 */

export interface MoneyLine {
  label: string;
  amountCents: number;
  /** How many records made up this line. */
  count: number;
}

export interface AccountingStatement {
  from: Date;
  to: Date;
  income: MoneyLine[];
  outgoings: MoneyLine[];
  incomeCents: number;
  outgoingsCents: number;
  /** Income less outgoings. Negative is real and is not hidden. */
  netCents: number;
  /**
   * Money the school is committed to but has not paid, and money it is owed.
   * Kept out of the totals: this is a record of what moved, not a forecast.
   */
  committedNotPaidCents: number;
  owedToSchoolCents: number;
  /** What this statement does not include, in words. */
  excludes: string[];
}

export interface StatementInput {
  from: Date;
  to: Date;
  feesReceived: { amountCents: number; count: number };
  expensesPaid: { amountCents: number; count: number };
  payrollPaid: { amountCents: number; count: number };
  welfarePaid: { amountCents: number; count: number };
  expensesApprovedUnpaid: number;
  welfareApprovedUnpaid: number;
  feesOutstanding: number;
}

/**
 * Lines with nothing in them are dropped.
 *
 * A statement listing "Payroll 0.00 (0)" reads as a school that paid nobody,
 * which is a different claim from a school that has not run payroll through
 * this system. What is absent is covered by `excludes` instead.
 */
function present(lines: MoneyLine[]): MoneyLine[] {
  return lines.filter((line) => line.count > 0 || line.amountCents !== 0);
}

export function buildStatement(input: StatementInput): AccountingStatement {
  const income = present([
    { label: "Fees received", amountCents: input.feesReceived.amountCents, count: input.feesReceived.count },
  ]);

  const outgoings = present([
    { label: "Expenses paid", amountCents: input.expensesPaid.amountCents, count: input.expensesPaid.count },
    { label: "Payroll paid", amountCents: input.payrollPaid.amountCents, count: input.payrollPaid.count },
    { label: "Welfare paid", amountCents: input.welfarePaid.amountCents, count: input.welfarePaid.count },
  ]);

  const incomeCents = income.reduce((sum, line) => sum + line.amountCents, 0);
  const outgoingsCents = outgoings.reduce((sum, line) => sum + line.amountCents, 0);

  return {
    from: input.from,
    to: input.to,
    income,
    outgoings,
    incomeCents,
    outgoingsCents,
    netCents: incomeCents - outgoingsCents,
    committedNotPaidCents: input.expensesApprovedUnpaid + input.welfareApprovedUnpaid,
    owedToSchoolCents: input.feesOutstanding,
    excludes: describeExclusions(income, outgoings),
  };
}

/**
 * What this statement does not account for.
 *
 * Written out rather than implied. A head teacher reading a net figure needs
 * to know what is not in it before they act on it — and the honest list is
 * short and specific rather than a disclaimer nobody reads.
 */
export function describeExclusions(income: MoneyLine[], outgoings: MoneyLine[]): string[] {
  const excludes = [
    "Anything the school has not recorded here — cash handled outside the system, and any bank account this does not see.",
    "Money committed but not yet paid, and fees not yet collected. Both are shown separately, and neither is in the net figure.",
  ];

  if (!outgoings.some((line) => line.label === "Payroll paid")) {
    excludes.push("Payroll: no run was marked as paid in this period.");
  }
  if (income.length === 0) {
    excludes.push("Fees: nothing was received in this period.");
  }

  return excludes;
}

/** Whether a statement is worth showing at all, or the period is simply empty. */
export function isEmpty(statement: AccountingStatement): boolean {
  return statement.income.length === 0 && statement.outgoings.length === 0;
}
