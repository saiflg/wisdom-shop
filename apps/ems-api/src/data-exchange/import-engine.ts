/**
 * The rules that decide what a spreadsheet would do to a school's records.
 *
 * Import is the dangerous half of import/export. A file that creates four
 * hundred students, or silently overwrites the ones already there, is not
 * undoable in any way a school would recognise — there is no "undo" for a
 * parent being told their child's record vanished. So nothing here writes
 * anything: this module turns rows into a *plan*, and the caller decides
 * whether to carry it out.
 *
 * Every problem is reported against the row number as it appears in the
 * spreadsheet, because the person fixing it is looking at the spreadsheet,
 * not at our data model.
 */

export type ColumnKind = "text" | "number" | "date" | "choice";

export interface ColumnSpec {
  /** The field this column maps to. */
  field: string;
  /** Accepted header spellings, matched case- and space-insensitively. */
  headers: string[];
  kind?: ColumnKind;
  required?: boolean;
  /** For `choice` columns; matched case-insensitively. */
  choices?: readonly string[];
  /** Extra rule, returning a problem or null. */
  validate?: (value: string) => string | null;
}

export interface ImportSpec {
  /**
   * The column whose value identifies an existing record. A row whose key
   * matches something already stored is an update, not a second copy of the
   * same person — which is what makes re-uploading a corrected file safe.
   */
  keyField: string;
  /**
   * Extra columns that, together with `keyField`, identify a record.
   *
   * A person has one identifying column; a *slot* rarely does. A timetable
   * entry is identified by class **and** day **and** period, a mark by
   * student **and** subject **and** assessment. Without this, re-uploading a
   * corrected timetable would read every row after the first as a duplicate
   * of it.
   */
  additionalKeyFields?: string[];
  columns: ColumnSpec[];
}

/**
 * The separator inside a composite key.
 *
 * A NUL, written as an escape so it is visible in the source, because it is
 * the one character that cannot appear in a spreadsheet cell. A space would
 * let "Grade 5" + "A Monday" collide with "Grade 5A" + "Monday" — two
 * different lessons sharing one key.
 */
const KEY_SEPARATOR = "\u0000";

/**
 * The identity of a row, as one string.
 *
 * Exported because `loadExistingKeys` has to build exactly the same string
 * from the database side; if the two ever disagree, every row looks new and
 * an import that should update silently duplicates instead.
 */
export function compositeKey(parts: Array<string | null | undefined>): string {
  return parts.map((part) => (part ?? "").trim().toLowerCase()).join(KEY_SEPARATOR);
}

/** The fields that make up a spec's key, in order. */
export function keyFieldsOf(spec: ImportSpec): string[] {
  return [spec.keyField, ...(spec.additionalKeyFields ?? [])];
}

export type RowAction = "create" | "update" | "error";

export interface RowPlan {
  /** 1-based, counting the header, so it matches what the user sees. */
  rowNumber: number;
  action: RowAction;
  key: string | null;
  values: Record<string, string>;
  problems: string[];
}

export interface ImportPlan {
  rows: RowPlan[];
  toCreate: number;
  toUpdate: number;
  withErrors: number;
  /** Headers in the file that no column claimed — usually a typo. */
  unrecognisedHeaders: string[];
  /** Required columns the file is missing entirely. */
  missingColumns: string[];
}

const normaliseHeader = (header: string) => header.trim().toLowerCase().replace(/[\s_-]+/g, "");

/** Maps a file's headers onto the spec's fields. */
export function mapHeaders(
  headers: string[],
  spec: ImportSpec,
): { byIndex: Map<number, ColumnSpec>; unrecognised: string[]; missing: string[] } {
  const byIndex = new Map<number, ColumnSpec>();
  const unrecognised: string[] = [];

  headers.forEach((header, index) => {
    if (!header.trim()) return;
    const wanted = normaliseHeader(header);
    const column = spec.columns.find((candidate) => candidate.headers.some((h) => normaliseHeader(h) === wanted));
    if (column) byIndex.set(index, column);
    else unrecognised.push(header.trim());
  });

  const claimed = new Set([...byIndex.values()].map((column) => column.field));
  const missing = spec.columns
    .filter((column) => column.required && !claimed.has(column.field))
    .map((column) => column.headers[0] as string);

  return { byIndex, unrecognised, missing };
}

/**
 * Whether an ISO date names a day that exists.
 *
 * `Date.parse("2026-02-31")` does not fail — it rolls over to 3 March and
 * returns a perfectly good timestamp. Accepting that would move a child's
 * date of birth by two days without anyone seeing an error, so the parts are
 * compared back against what the Date actually became.
 */
function isRealDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function checkValue(column: ColumnSpec, raw: string): string | null {
  const value = raw.trim();

  if (!value) {
    return column.required ? `${column.headers[0]} is required` : null;
  }

  switch (column.kind) {
    case "number":
      if (!/^-?\d+(\.\d+)?$/.test(value)) return `${column.headers[0]} should be a number`;
      break;
    case "date":
      // Deliberately ISO-only. A spreadsheet full of "03/04/2026" is
      // ambiguous between March and April depending on who typed it, and
      // guessing wrong silently moves a child's date of birth.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return `${column.headers[0]} should be a date like 2026-03-04`;
      }
      if (!isRealDate(value)) return `${column.headers[0]} is not a real date`;
      break;
    case "choice":
      if (!column.choices?.some((choice) => choice.toLowerCase() === value.toLowerCase())) {
        return `${column.headers[0]} should be one of: ${column.choices?.join(", ")}`;
      }
      break;
    default:
      break;
  }

  return column.validate?.(value) ?? null;
}

/**
 * Turns rows into a plan.
 *
 * `existingKeys` is what the school already has. A row matching one is an
 * update; anything else is a create. Rows that repeat a key *within the same
 * file* are errors rather than silent last-one-wins: two rows claiming the
 * same admission number means the file is wrong, and picking one of them
 * quietly is how a school ends up with the wrong child's data.
 */
export function buildImportPlan(
  headers: string[],
  rows: string[][],
  spec: ImportSpec,
  existingKeys: Set<string>,
): ImportPlan {
  const { byIndex, unrecognised, missing } = mapHeaders(headers, spec);

  // Both sides go through the same normalisation, which also makes matching
  // case- and whitespace-insensitive: "stu-001" in a hand-typed file is the
  // same child as "STU-001" on file, and treating them as two would create a
  // duplicate record for a real student. Idempotent, so a key that was
  // already built with `compositeKey` passes through unchanged.
  const knownKeys = new Set([...existingKeys].map((key) => compositeKey([key])));

  const plan: RowPlan[] = [];
  const seenKeys = new Map<string, number>();

  rows.forEach((cells, index) => {
    // +2: one for the header row, one because spreadsheets count from 1.
    const rowNumber = index + 2;

    // A trailing blank row is what a spreadsheet leaves behind, not something
    // the user meant. Skipping it silently is right; reporting it as an error
    // would train people to ignore the error list.
    if (cells.every((cell) => !cell?.trim())) return;

    const values: Record<string, string> = {};
    const problems: string[] = [];

    for (const [columnIndex, column] of byIndex) {
      const raw = cells[columnIndex] ?? "";
      const problem = checkValue(column, raw);
      if (problem) problems.push(problem);
      if (raw.trim()) values[column.field] = raw.trim();
    }

    for (const column of spec.columns) {
      if (column.required && !(column.field in values)) {
        const message = `${column.headers[0]} is required`;
        if (!problems.includes(message)) problems.push(message);
      }
    }

    const fields = keyFieldsOf(spec);
    // Every part must be present, or the row does not identify anything and
    // treating it as a create would be a guess.
    const hasWholeKey = fields.every((field) => (values[field] ?? "").trim().length > 0);
    const key = hasWholeKey ? compositeKey(fields.map((field) => values[field])) : null;

    if (key) {
      const firstSeen = seenKeys.get(key);
      if (firstSeen !== undefined) {
        // Named in the user's terms — "Class, Day, Period" rather than a
        // field name they have never seen.
        const label = fields
          .map((field) => spec.columns.find((column) => column.field === field)?.headers[0] ?? field)
          .join(" + ");
        problems.push(`Same ${label} as row ${firstSeen} — the file has it twice`);
      } else {
        seenKeys.set(key, rowNumber);
      }
    }

    const action: RowAction =
      problems.length > 0 ? "error" : key && knownKeys.has(key) ? "update" : "create";

    plan.push({ rowNumber, action, key, values, problems });
  });

  return {
    rows: plan,
    toCreate: plan.filter((row) => row.action === "create").length,
    toUpdate: plan.filter((row) => row.action === "update").length,
    withErrors: plan.filter((row) => row.action === "error").length,
    unrecognisedHeaders: unrecognised,
    missingColumns: missing,
  };
}

/**
 * Whether a plan may be carried out.
 *
 * All-or-nothing on structural faults — a missing required column means the
 * file is the wrong file, and importing the readable half of the wrong file
 * is worse than importing none of it. Individual bad rows are different: they
 * are skipped and reported, so one typo does not block a correct roster of
 * four hundred.
 */
export function canCommit(plan: ImportPlan): string | null {
  if (plan.missingColumns.length > 0) {
    return `This file has no ${plan.missingColumns.join(" or ")} column`;
  }
  if (plan.rows.length === 0) return "That file has no rows in it";
  if (plan.toCreate === 0 && plan.toUpdate === 0) return "Every row in that file has a problem";
  return null;
}
