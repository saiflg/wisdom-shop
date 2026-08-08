/**
 * What a staff member is actually paid.
 *
 * Every amount is an integer count of minor units (kobo/cents), and floats
 * are rejected rather than rounded — a salary is not a place to discover that
 * `0.1 + 0.2 !== 0.3`. Percentages are stored in hundredths of a percent so
 * that 12.5% is the integer 1250 and never a float either.
 *
 * Pure and free of Prisma, so the rules that decide what somebody takes home
 * can be tested exhaustively without a database.
 */

export type PayComponentKind = "EARNING" | "DEDUCTION";
export type PayComponentBasis = "FIXED" | "PERCENT_OF_BASIC";

export interface SalaryComponentInput {
  label: string;
  kind: PayComponentKind;
  basis: PayComponentBasis;
  /** Minor units when FIXED, hundredths of a percent when PERCENT_OF_BASIC. */
  amount: number;
  isBasic?: boolean;
}

export interface PayslipLine {
  label: string;
  kind: PayComponentKind;
  amountCents: number;
}

export interface PayslipTotals {
  lines: PayslipLine[];
  grossCents: number;
  deductionsCents: number;
  netCents: number;
}

/** 100% in hundredths of a percent. */
const PERCENT_SCALE = 10_000;

function assertInteger(value: number, what: string): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${what} must be a whole number, not ${value}`);
  }
  if (value < 0) {
    throw new Error(`${what} cannot be negative`);
  }
}

/**
 * The amount a percentage component comes to.
 *
 * Rounded half-up to the nearest minor unit. Left as a named function because
 * "which way does 0.5 of a kobo go" is the sort of question that should have
 * one answer written down, not several answers scattered across a codebase.
 */
export function percentOf(basicCents: number, hundredthsOfPercent: number): number {
  assertInteger(basicCents, "Basic pay");
  assertInteger(hundredthsOfPercent, "Percentage");
  return Math.round((basicCents * hundredthsOfPercent) / PERCENT_SCALE);
}

/**
 * The basic pay percentages are taken from.
 *
 * Explicitly flagged rather than inferred from the first earning or the
 * largest one: a school that renames "Basic" to "Consolidated" should not
 * silently start computing pension against something else.
 */
export function findBasicCents(components: SalaryComponentInput[]): number {
  const basic = components.find((component) => component.isBasic && component.kind === "EARNING");
  if (!basic) return 0;
  if (basic.basis !== "FIXED") {
    // A basic that is a percentage of itself has no fixed point.
    throw new Error("Basic pay must be a fixed amount, not a percentage");
  }
  assertInteger(basic.amount, `Component "${basic.label}"`);
  return basic.amount;
}

/**
 * Turns a salary into a payslip.
 *
 * Order matters and is fixed here: every component is resolved to an amount
 * against *basic*, earnings are summed into gross, deductions are summed
 * separately, and net is the difference. Deductions are never a percentage of
 * gross — gross depends on the deductions, so that has no fixed point either.
 */
export function computePayslip(components: SalaryComponentInput[]): PayslipTotals {
  const basicCents = findBasicCents(components);

  const lines: PayslipLine[] = components.map((component) => {
    if (component.basis === "FIXED") {
      assertInteger(component.amount, `Component "${component.label}"`);
      return { label: component.label, kind: component.kind, amountCents: component.amount };
    }
    return {
      label: component.label,
      kind: component.kind,
      amountCents: percentOf(basicCents, component.amount),
    };
  });

  let grossCents = 0;
  let deductionsCents = 0;
  for (const line of lines) {
    if (line.kind === "EARNING") grossCents += line.amountCents;
    else deductionsCents += line.amountCents;
  }

  return {
    lines,
    grossCents,
    deductionsCents,
    // Clamped at zero. Deductions exceeding pay is a data-entry mistake, and
    // the honest response is a zero payslip the bursar will query rather than
    // a negative one a bank would reject or, worse, act on.
    netCents: Math.max(0, grossCents - deductionsCents),
  };
}

/** Whether deductions swallowed the whole salary — worth surfacing, not hiding. */
export function isOverDeducted(totals: PayslipTotals): boolean {
  return totals.deductionsCents > totals.grossCents;
}

export interface PayrollSummary {
  staffCount: number;
  grossCents: number;
  deductionsCents: number;
  netCents: number;
}

/** What the school is about to pay out in total. */
export function summarisePayroll(payslips: Array<Pick<PayslipTotals, "grossCents" | "deductionsCents" | "netCents">>): PayrollSummary {
  return payslips.reduce<PayrollSummary>(
    (total, payslip) => ({
      staffCount: total.staffCount + 1,
      grossCents: total.grossCents + payslip.grossCents,
      deductionsCents: total.deductionsCents + payslip.deductionsCents,
      netCents: total.netCents + payslip.netCents,
    }),
    { staffCount: 0, grossCents: 0, deductionsCents: 0, netCents: 0 },
  );
}

/** "March 2027", for a payslip heading. */
export function formatPayPeriod(year: number, month: number): string {
  const names = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Month must be 1-12, not ${month}`);
  }
  return `${names[month - 1]} ${year}`;
}

/** `PS-2027-03-000004`, sortable and unambiguous. */
export function formatPayslipNumber(year: number, month: number, sequence: number): string {
  return `PS-${year}-${String(month).padStart(2, "0")}-${String(sequence).padStart(6, "0")}`;
}
