/**
 * The two schedules a school files with somebody else: PAYE to the tax
 * authority, and pension contributions to the PFA.
 *
 * Both are derived from a payroll run that has already been approved. Nothing
 * here recomputes anybody's pay — a register that disagreed with the voucher
 * it came from would be worse than no register, because two documents about
 * the same month would both look authoritative.
 *
 * Pure, so the arithmetic can be proven rather than reconciled by hand
 * against a spreadsheet.
 */

export interface RegisterPayslip {
  staffProfileId: string;
  staffName: string;
  /** Null when nobody has recorded one. Kept, not skipped — see below. */
  pensionPin: string | null;
  lines: { label: string; kind: "EARNING" | "DEDUCTION"; amountCents: number }[];
}

/** Sum of every deduction line matching a label, ignoring case and padding. */
export function componentCents(payslip: RegisterPayslip, label: string): number {
  const wanted = label.trim().toLowerCase();
  return payslip.lines
    .filter((line) => line.label.trim().toLowerCase() === wanted)
    .reduce((total, line) => total + line.amountCents, 0);
}

export interface TaxRow {
  serial: number;
  staffProfileId: string;
  staffName: string;
  taxCents: number;
}

export interface TaxRegister {
  rows: TaxRow[];
  totalCents: number;
  /** Everybody on the payroll, including those who paid no tax. */
  staffConsidered: number;
}

/**
 * Who paid PAYE this month, and how much.
 *
 * Only people with tax to report appear. A schedule listing forty staff with
 * a zero against thirty of them invites the tax office to ask about the
 * thirty, and the school has nothing to say about them.
 *
 * Serial numbers restart at 1 rather than carrying over from the voucher: this
 * is its own document, and a schedule beginning at 55 looks like the first 54
 * rows were lost.
 */
export function buildTaxRegister(
  payslips: RegisterPayslip[],
  taxLabel = "Tax",
): TaxRegister {
  const rows: TaxRow[] = [];

  for (const payslip of payslips) {
    const taxCents = componentCents(payslip, taxLabel);
    if (taxCents <= 0) continue;
    rows.push({
      serial: rows.length + 1,
      staffProfileId: payslip.staffProfileId,
      staffName: payslip.staffName,
      taxCents,
    });
  }

  return {
    rows,
    totalCents: rows.reduce((total, row) => total + row.taxCents, 0),
    staffConsidered: payslips.length,
  };
}

export interface PensionSettingsLike {
  providerName: string | null;
  remittanceBankName: string | null;
  remittanceAccountNumber: string | null;
  /**
   * The employer's share, as a percentage OF THE EMPLOYEE'S contribution.
   *
   * Expressed this way because it covers both arrangements seen in the wild
   * with one number: a school matching its staff pound for pound is 100, and
   * Nigeria's statutory 10% employer against 8% employee is 125. A percentage
   * of salary would need the salary definition too, and schools disagree about
   * what counts.
   */
  employerMatchPercent: number;
}

export interface PensionRow {
  serial: number;
  staffProfileId: string;
  staffName: string;
  pensionPin: string | null;
  employerCents: number;
  employeeCents: number;
  totalCents: number;
}

export interface PensionRegister {
  rows: PensionRow[];
  employerTotalCents: number;
  employeeTotalCents: number;
  totalCents: number;
  /** Rows the PFA will reject: a contribution with no PIN to credit it to. */
  missingPin: PensionRow[];
}

/**
 * Half-up rounding on a positive amount.
 *
 * Math.round already does this for positives, and contributions are never
 * negative — but naming it says the choice was made rather than inherited.
 */
function roundCents(value: number): number {
  return Math.round(value);
}

/**
 * The schedule sent to the pension administrator.
 *
 * The employer's share is computed rather than stored, because it is not a
 * deduction from anybody's pay — it never appears on a payslip, and inventing
 * a payslip line for it would make gross pay wrong.
 *
 * Somebody with no PIN is INCLUDED and flagged. Dropping them would silently
 * under-remit and leave a member of staff with a gap in their record that
 * nobody notices for years; the school needs to see the problem, not have it
 * tidied away.
 */
export function buildPensionRegister(
  payslips: RegisterPayslip[],
  settings: PensionSettingsLike,
  pensionLabel = "Pension",
): PensionRegister {
  const rows: PensionRow[] = [];

  for (const payslip of payslips) {
    const employeeCents = componentCents(payslip, pensionLabel);
    if (employeeCents <= 0) continue;

    const employerCents = roundCents((employeeCents * settings.employerMatchPercent) / 100);

    rows.push({
      serial: rows.length + 1,
      staffProfileId: payslip.staffProfileId,
      staffName: payslip.staffName,
      pensionPin: payslip.pensionPin?.trim() || null,
      employerCents,
      employeeCents,
      totalCents: employerCents + employeeCents,
    });
  }

  return {
    rows,
    employerTotalCents: rows.reduce((t, r) => t + r.employerCents, 0),
    employeeTotalCents: rows.reduce((t, r) => t + r.employeeCents, 0),
    totalCents: rows.reduce((t, r) => t + r.totalCents, 0),
    missingPin: rows.filter((row) => !row.pensionPin),
  };
}

/** "PAYE DEDUCTION FOR THE MONTH OF JULY, 2026" */
export function payeHeading(year: number, month: number): string {
  return `PAYE DEDUCTION FOR THE MONTH OF ${monthName(month)}, ${year}`;
}

/** "SCHEDULE OF CONTRIBUTION FOR THE MONTH OF JULY, 2026" */
export function pensionHeading(year: number, month: number): string {
  return `SCHEDULE OF CONTRIBUTION FOR THE MONTH OF ${monthName(month)}, ${year}`;
}

const MONTHS = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
];

export function monthName(month: number): string {
  return MONTHS[month - 1] ?? "UNKNOWN";
}

/**
 * The two lines above a pension schedule naming where the money goes.
 *
 * Returned as text the caller prints verbatim. A school that has not recorded
 * its PFA gets a visible gap rather than a confident-looking blank, because a
 * schedule with no administrator named cannot be filed.
 */
export function pensionRemittanceLines(settings: PensionSettingsLike): string[] {
  const provider = settings.providerName?.trim();
  const bank = settings.remittanceBankName?.trim();
  const account = settings.remittanceAccountNumber?.trim();

  return [
    `NAME OF THE PFA; ${provider || "(not set)"}`,
    bank || account
      ? `BANK NAME; ${bank || "(not set)"}, ACCOUNT; ${account || "(not set)"}`
      : "BANK NAME; (not set)",
  ];
}
