/**
 * Staff loans and salary advances, and what comes off a salary this month.
 *
 * A school lends a teacher money and recovers it a little at a time from pay.
 * Two things must never happen, and both are easy to cause by accident:
 *
 *   1. Recovering more than is owed. The last instalment is almost always
 *      smaller than the others, and a fixed monthly deduction applied one
 *      month too long takes money the school is not owed. That is a wage
 *      theft, not a rounding error.
 *
 *   2. Recovering the same month twice. Payroll gets re-run — a correction, a
 *      late starter, somebody clicking twice — and a second deduction against
 *      the same run would silently double a repayment.
 *
 * The first is arithmetic and lives here. The second is a database constraint
 * (one repayment per loan per payroll run), because an invariant enforced by
 * the database cannot be bypassed by a caller that forgot to check.
 *
 * Pure, so the arithmetic can be argued with in a test rather than found in a
 * payslip.
 */

export type StaffLoanKind = "LOAN" | "SALARY_ADVANCE";
export type StaffLoanStatus = "ACTIVE" | "SETTLED" | "WRITTEN_OFF" | "CANCELLED";

export interface LoanLike {
  principalCents: number;
  repaidCents: number;
  monthlyDeductionCents: number;
  status: StaffLoanStatus;
}

/** What is still owed. Never negative, whatever the stored figures say. */
export function outstandingCents(loan: Pick<LoanLike, "principalCents" | "repaidCents">): number {
  return Math.max(0, loan.principalCents - loan.repaidCents);
}

/**
 * What to take off this month's salary.
 *
 * Capped at the outstanding balance, so the final instalment is whatever is
 * left rather than the usual amount. A loan that is settled, cancelled or
 * written off contributes nothing — a written-off loan is forgiven, and
 * continuing to deduct from somebody's pay after forgiving their debt is the
 * worst possible outcome of a status field being ignored.
 */
export function deductionThisMonth(loan: LoanLike): number {
  if (loan.status !== "ACTIVE") return 0;
  const owed = outstandingCents(loan);
  if (owed === 0) return 0;
  // A missing or nonsensical instalment recovers the whole balance rather
  // than nothing: a loan that silently never repays is harder to notice than
  // one that clears too fast, and the cap below still protects the borrower.
  const instalment = loan.monthlyDeductionCents > 0 ? loan.monthlyDeductionCents : owed;
  return Math.min(instalment, owed);
}

/** A loan is settled the moment nothing is left, not when somebody says so. */
export function isSettled(loan: Pick<LoanLike, "principalCents" | "repaidCents">): boolean {
  return outstandingCents(loan) === 0;
}

export interface RepaymentCheck {
  ok: boolean;
  /** What may actually be applied — capped, never negative. */
  amountCents: number;
  reason?: string;
}

/**
 * Validate one repayment before it is recorded.
 *
 * Returns a decision rather than throwing, because the payroll run applies
 * many of these at once and one impossible repayment should not abandon the
 * others.
 */
export function checkRepayment(loan: LoanLike, requestedCents: number): RepaymentCheck {
  if (!Number.isInteger(requestedCents)) {
    return { ok: false, amountCents: 0, reason: "A repayment must be a whole number of minor units" };
  }
  if (requestedCents <= 0) {
    return { ok: false, amountCents: 0, reason: "A repayment must be more than zero" };
  }
  if (loan.status === "CANCELLED" || loan.status === "WRITTEN_OFF") {
    return { ok: false, amountCents: 0, reason: `This loan is ${loan.status.toLowerCase().replace("_", " ")}` };
  }

  const owed = outstandingCents(loan);
  if (owed === 0) {
    return { ok: false, amountCents: 0, reason: "This loan is already repaid in full" };
  }

  // Capped rather than refused: somebody entering the usual instalment on the
  // final month is doing the right thing, and the system should take what is
  // owed instead of making them work out the remainder by hand.
  return { ok: true, amountCents: Math.min(requestedCents, owed) };
}

export interface RegisterRow {
  loanId: string;
  staffName: string;
  kind: StaffLoanKind;
  reference: string;
  issuedOn: Date;
  principalCents: number;
  repaidCents: number;
  outstandingCents: number;
  monthlyDeductionCents: number;
  status: StaffLoanStatus;
}

export interface RegisterTotals {
  count: number;
  principalCents: number;
  repaidCents: number;
  outstandingCents: number;
  /** What this month's payroll will recover if it runs today. */
  dueThisMonthCents: number;
}

export function summariseRegister(rows: RegisterRow[]): RegisterTotals {
  return rows.reduce<RegisterTotals>(
    (totals, row) => ({
      count: totals.count + 1,
      principalCents: totals.principalCents + row.principalCents,
      repaidCents: totals.repaidCents + row.repaidCents,
      outstandingCents: totals.outstandingCents + row.outstandingCents,
      dueThisMonthCents:
        totals.dueThisMonthCents +
        deductionThisMonth({
          principalCents: row.principalCents,
          repaidCents: row.repaidCents,
          monthlyDeductionCents: row.monthlyDeductionCents,
          status: row.status,
        }),
    }),
    { count: 0, principalCents: 0, repaidCents: 0, outstandingCents: 0, dueThisMonthCents: 0 },
  );
}

/**
 * How many more months until this is cleared, at the current instalment.
 *
 * Null when it will never clear — a zero instalment on a live balance is a
 * standing arrangement somebody should look at, not a number to display as
 * infinity.
 */
export function monthsRemaining(loan: LoanLike): number | null {
  const owed = outstandingCents(loan);
  if (owed === 0) return 0;
  if (loan.status !== "ACTIVE") return null;
  if (loan.monthlyDeductionCents <= 0) return null;
  return Math.ceil(owed / loan.monthlyDeductionCents);
}
