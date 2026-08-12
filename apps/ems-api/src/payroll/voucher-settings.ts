/**
 * Reading back a voucher layout a school admin saved.
 *
 * The configuration comes out of a JSON column, which means it is whatever
 * was written there — by this release, by an older one, or by somebody
 * editing the database. A voucher decides what a payroll document says, so a
 * malformed column is not something to render approximately: it is dropped,
 * and if nothing survives the school gets the default layout rather than a
 * blank page.
 *
 * Pure, so the parsing can be tested against the garbage it exists to
 * survive.
 */

import {
  DEFAULT_VOUCHER_COLUMNS,
  type StaffField,
  type VoucherColumn,
  type VoucherSource,
} from "./voucher-layout";

const STAFF_FIELDS: StaffField[] = [
  "name",
  "staffNumber",
  "bankName",
  "accountNumber",
  "jobTitle",
  "qualification",
  "startDate",
  "remark",
];

function parseSource(raw: unknown): VoucherSource | null {
  if (typeof raw !== "object" || raw === null) return null;
  const source = raw as Record<string, unknown>;

  switch (source.kind) {
    case "SERIAL":
      return { kind: "SERIAL" };
    case "PAGE_TOTAL":
      return { kind: "PAGE_TOTAL" };
    case "STAFF":
      return STAFF_FIELDS.includes(source.field as StaffField)
        ? { kind: "STAFF", field: source.field as StaffField }
        : null;
    case "TOTAL":
      return source.of === "GROSS" || source.of === "DEDUCTIONS" || source.of === "NET"
        ? { kind: "TOTAL", of: source.of }
        : null;
    case "COMPONENT":
      return typeof source.label === "string" && source.label.trim()
        ? { kind: "COMPONENT", label: source.label.trim() }
        : null;
    default:
      return null;
  }
}

export function parseVoucherColumns(raw: unknown): VoucherColumn[] {
  if (!Array.isArray(raw)) return [...DEFAULT_VOUCHER_COLUMNS];

  const seen = new Set<string>();
  const columns: VoucherColumn[] = [];

  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const candidate = entry as Record<string, unknown>;

    const key = typeof candidate.key === "string" ? candidate.key.trim() : "";
    const label = typeof candidate.label === "string" ? candidate.label.trim() : "";
    const source = parseSource(candidate.source);

    // A duplicate key would make two columns indistinguishable to the editor,
    // so the later one loses rather than silently shadowing the first.
    if (!key || !label || !source || seen.has(key)) continue;

    seen.add(key);
    columns.push({ key, label, source, money: candidate.money === true });
  }

  // An empty or wholly unreadable configuration falls back rather than
  // producing a voucher with no columns, which would look like data loss.
  return columns.length > 0 ? columns : [...DEFAULT_VOUCHER_COLUMNS];
}

export const MIN_ROWS_PER_PAGE = 1;
export const MAX_ROWS_PER_PAGE = 500;

export function parseRowsPerPage(raw: unknown): number {
  const value = typeof raw === "number" ? Math.trunc(raw) : Number.NaN;
  if (!Number.isFinite(value)) return 16;
  return Math.min(MAX_ROWS_PER_PAGE, Math.max(MIN_ROWS_PER_PAGE, value));
}

/**
 * What a school may not do to its own voucher.
 *
 * Returned as messages rather than thrown, because an admin editing columns
 * wants to see everything wrong at once, not fix one thing per save.
 */
export function validateColumns(columns: VoucherColumn[]): string[] {
  const problems: string[] = [];

  if (columns.length === 0) {
    problems.push("A voucher needs at least one column.");
  }

  const keys = columns.map((c) => c.key);
  const duplicates = keys.filter((key, i) => keys.indexOf(key) !== i);
  if (duplicates.length > 0) {
    problems.push(`Two columns share the same id: ${[...new Set(duplicates)].join(", ")}`);
  }

  // Losing the net pay column is the one mistake that turns a voucher into a
  // document nobody can pay from, and it is easy to make while tidying up.
  const hasNet = columns.some((c) => c.source.kind === "TOTAL" && c.source.of === "NET");
  if (!hasNet) {
    problems.push("The voucher must include a Net Salary column — it is the amount actually paid.");
  }

  const hasName = columns.some((c) => c.source.kind === "STAFF" && c.source.field === "name");
  if (!hasName) {
    problems.push("The voucher must include the staff member's name.");
  }

  if (columns.filter((c) => c.source.kind === "PAGE_TOTAL").length > 1) {
    problems.push("Only one page-total column is allowed.");
  }

  return problems;
}
