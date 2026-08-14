/**
 * Turning a payroll run into the voucher a bursar signs.
 *
 * Schools do not agree on what a salary voucher looks like. One has "Internal
 * Scheme" and "Hospital & Maternity"; the next has "Housing" and "Transport".
 * So the columns are configuration, not code: a school describes its voucher
 * once and every month's document follows it. Hardcoding one school's columns
 * would mean a code change per customer.
 *
 * The one piece of real logic here is the running subtotal. A paper voucher is
 * signed page by page, and each page carries the total of the rows on it, so
 * the person signing can check that page without adding up the whole school.
 * Getting that wrong is worse than useless: a subtotal that does not match the
 * rows above it destroys trust in the entire document.
 *
 * Pure and free of Prisma, so the arithmetic can be proven in tests rather
 * than checked by eye against a spreadsheet.
 */

/** Where a column's value comes from. */
export type VoucherSource =
  /** A field on the person: "name", "bank", "accountNumber", "jobTitle", … */
  | { kind: "STAFF"; field: StaffField }
  /** One named pay component, matched by its label, e.g. "Pension". */
  | { kind: "COMPONENT"; label: string }
  /** A total the payslip already carries. */
  | { kind: "TOTAL"; of: "GROSS" | "DEDUCTIONS" | "NET" }
  /** The row number down the page. */
  | { kind: "SERIAL" }
  /** The page subtotal, repeated down the block — as spreadsheets merge it. */
  | { kind: "PAGE_TOTAL" };

export type StaffField =
  | "name"
  | "staffNumber"
  | "bankName"
  | "accountNumber"
  | "jobTitle"
  | "qualification"
  | "startDate"
  | "remark";

export interface VoucherColumn {
  /** Stable id, so a renamed heading does not orphan the configuration. */
  key: string;
  /** What the school prints at the top of the column. */
  label: string;
  source: VoucherSource;
  /** Money is right-aligned and formatted; text is not. */
  money?: boolean;
}

export interface VoucherPayslip {
  staffProfileId: string;
  staffName: string;
  staffNumber: string | null;
  bankName: string | null;
  /** Already masked or revealed by the caller — this module never decrypts. */
  accountNumber: string | null;
  jobTitle: string | null;
  qualification: string | null;
  startDate: string | null;
  remark: string | null;
  grossCents: number;
  deductionsCents: number;
  netCents: number;
  /** Every component as snapshotted on the payslip. */
  lines: { label: string; kind: "EARNING" | "DEDUCTION"; amountCents: number }[];
}

export type VoucherCell = { text: string; cents: number | null };

export interface VoucherRow {
  staffProfileId: string;
  serial: number;
  cells: VoucherCell[];
}

export interface VoucherPage {
  pageNumber: number;
  rows: VoucherRow[];
  /** Sum of net pay for the rows on THIS page. */
  subtotalCents: number;
}

export interface Voucher {
  pages: VoucherPage[];
  grandTotalCents: number;
  /** Column totals across the whole run, for the closing line. */
  columnTotals: (number | null)[];
  staffCount: number;
}

/**
 * A component the school asked for but nobody was paid.
 *
 * Zero rather than blank: a voucher column that silently disappears when no
 * one has that allowance changes shape month to month, and a bursar comparing
 * March to April would find the columns had moved.
 */
function componentCents(payslip: VoucherPayslip, label: string): number {
  const wanted = label.trim().toLowerCase();
  return payslip.lines
    .filter((line) => line.label.trim().toLowerCase() === wanted)
    .reduce((sum, line) => sum + line.amountCents, 0);
}

export function formatCents(cents: number): string {
  // No currency symbol: the school's currency is printed once in the header,
  // and repeating it in every cell of a fifty-row table is noise.
  return (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function staffValue(payslip: VoucherPayslip, field: StaffField): string {
  switch (field) {
    case "name":
      return payslip.staffName;
    case "staffNumber":
      return payslip.staffNumber ?? "";
    case "bankName":
      return payslip.bankName ?? "";
    case "accountNumber":
      return payslip.accountNumber ?? "";
    case "jobTitle":
      return payslip.jobTitle ?? "";
    case "qualification":
      return payslip.qualification ?? "";
    case "startDate":
      return payslip.startDate ?? "";
    case "remark":
      return payslip.remark ?? "";
  }
}

/**
 * Build the voucher.
 *
 * `rowsPerPage` decides where subtotals fall. It is a property of the paper
 * the school prints on, not of the data, so it is passed in rather than
 * guessed.
 */
export function buildVoucher(
  payslips: VoucherPayslip[],
  columns: VoucherColumn[],
  rowsPerPage: number,
): Voucher {
  if (rowsPerPage < 1) {
    throw new Error("rowsPerPage must be at least 1");
  }

  const pages: VoucherPage[] = [];
  let serial = 0;

  for (let start = 0; start < payslips.length; start += rowsPerPage) {
    const slice = payslips.slice(start, start + rowsPerPage);
    const subtotalCents = slice.reduce((sum, p) => sum + p.netCents, 0);

    const rows = slice.map((payslip) => {
      serial += 1;
      const cells = columns.map((column): VoucherCell => {
        switch (column.source.kind) {
          case "SERIAL":
            return { text: String(serial), cents: null };
          case "STAFF":
            return { text: staffValue(payslip, column.source.field), cents: null };
          case "COMPONENT": {
            const cents = componentCents(payslip, column.source.label);
            // Blank rather than "0.00" for a component this person does not
            // have. A column of zeroes hides the handful of rows that matter,
            // which is exactly what somebody scanning for deductions is
            // looking for.
            return { text: cents === 0 ? "" : formatCents(cents), cents };
          }
          case "TOTAL": {
            const cents =
              column.source.of === "GROSS"
                ? payslip.grossCents
                : column.source.of === "DEDUCTIONS"
                  ? payslip.deductionsCents
                  : payslip.netCents;
            return { text: cents === 0 ? "" : formatCents(cents), cents };
          }
          case "PAGE_TOTAL":
            return { text: formatCents(subtotalCents), cents: subtotalCents };
        }
      });

      return { staffProfileId: payslip.staffProfileId, serial, cells };
    });

    pages.push({ pageNumber: pages.length + 1, rows, subtotalCents });
  }

  // Column totals skip PAGE_TOTAL: adding up a repeated subtotal would count
  // every page once per row on it.
  const columnTotals = columns.map((column, index) => {
    if (column.source.kind === "PAGE_TOTAL") return null;
    if (!column.money && column.source.kind === "STAFF") return null;
    let total = 0;
    let sawMoney = false;
    for (const page of pages) {
      for (const row of page.rows) {
        const cell = row.cells[index];
        if (cell?.cents !== null && cell?.cents !== undefined) {
          total += cell.cents;
          sawMoney = true;
        }
      }
    }
    return sawMoney ? total : null;
  });

  return {
    pages,
    grandTotalCents: payslips.reduce((sum, p) => sum + p.netCents, 0),
    columnTotals,
    staffCount: payslips.length,
  };
}

/**
 * The default column set, modelled on what Nigerian schools actually print.
 *
 * A starting point a school edits, not a fixed format — every one of these can
 * be renamed, reordered or removed.
 */
export const DEFAULT_VOUCHER_COLUMNS: VoucherColumn[] = [
  { key: "sn", label: "S/N", source: { kind: "SERIAL" } },
  { key: "name", label: "Name", source: { kind: "STAFF", field: "name" } },
  { key: "bank", label: "Bank", source: { kind: "STAFF", field: "bankName" } },
  { key: "account", label: "Account Number", source: { kind: "STAFF", field: "accountNumber" } },
  { key: "net", label: "Net Salary", source: { kind: "TOTAL", of: "NET" }, money: true },
  { key: "qualification", label: "Qualification", source: { kind: "STAFF", field: "qualification" } },
  { key: "designation", label: "Designation", source: { kind: "STAFF", field: "jobTitle" } },
  { key: "employed", label: "Date Of Employment", source: { kind: "STAFF", field: "startDate" } },
  { key: "salary", label: "Salary", source: { kind: "COMPONENT", label: "Salary" }, money: true },
  { key: "service", label: "Year Of Service", source: { kind: "COMPONENT", label: "Year Of Service" }, money: true },
  // Gross comes from the payslip's own total, so removing an allowance column
  // changes what is shown and never what is paid.
  { key: "gross", label: "Gross Salary", source: { kind: "TOTAL", of: "GROSS" }, money: true },
  { key: "others", label: "Others", source: { kind: "COMPONENT", label: "Others" }, money: true },
  { key: "hospital", label: "Hospital & Maternity", source: { kind: "COMPONENT", label: "Hospital & Maternity" }, money: true },
  { key: "loan", label: "Loan", source: { kind: "COMPONENT", label: "Loan" }, money: true },
  { key: "pension", label: "Pension", source: { kind: "COMPONENT", label: "Pension" }, money: true },
  { key: "fees", label: "School Fees", source: { kind: "COMPONENT", label: "School Fees" }, money: true },
  { key: "tax", label: "Tax", source: { kind: "COMPONENT", label: "Tax" }, money: true },
  { key: "penalty", label: "Penalty", source: { kind: "COMPONENT", label: "Penalty" }, money: true },
  { key: "deductions", label: "Total Deduction", source: { kind: "TOTAL", of: "DEDUCTIONS" }, money: true },
  { key: "remark", label: "Remark", source: { kind: "STAFF", field: "remark" } },
  { key: "pageTotal", label: "Total", source: { kind: "PAGE_TOTAL" }, money: true },
];
