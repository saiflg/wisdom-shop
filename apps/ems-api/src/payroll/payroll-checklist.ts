/**
 * The month-end checks a bursar works through before a payroll is approved.
 *
 * Every item on the observed list is something that goes wrong SILENTLY:
 * a penalty column left over from last month quietly deducts twice, a loan
 * not updated recovers against a debt already settled, a year-of-service
 * increment missed underpays somebody by a little for a year. None of them
 * throw an error. They just produce a payslip that looks fine and is wrong.
 *
 * So the checklist is not decoration. It is the list of failures the system
 * cannot detect for itself, which is exactly why a person has to confirm them.
 *
 * Pure, so the progress arithmetic and the awkward parts — duplicate labels,
 * reordering, a school that renames everything — can be proven in tests.
 */

export interface ChecklistItemLike {
  id: string;
  label: string;
  position: number;
  doneAt: Date | null;
  doneByName: string | null;
  note: string | null;
}

/**
 * What a Nigerian school actually checks each month, taken from a real
 * voucher workbook rather than invented.
 *
 * A starting point, not a rule: a school adds, removes and renames these on
 * the run itself, and next month's checklist copies whatever they settled on.
 */
export const DEFAULT_CHECKLIST: readonly string[] = [
  "Year of service incremented",
  "Penalty column cleared",
  "Loan checked and updated",
  "Hospital and maternity checked and updated",
  "School fees checked and updated",
  "Teachers' confirmation checked",
];

export interface ChecklistProgress {
  total: number;
  done: number;
  /** Whole percent, so a progress bar never renders 99.7. */
  percent: number;
  complete: boolean;
  /** What is still outstanding, in the order it appears on the list. */
  outstanding: ChecklistItemLike[];
}

export function progressOf(items: ChecklistItemLike[]): ChecklistProgress {
  const ordered = [...items].sort(byPosition);
  const outstanding = ordered.filter((item) => item.doneAt === null);
  const done = ordered.length - outstanding.length;

  return {
    total: ordered.length,
    done,
    // An empty checklist is 100%, not 0%: a school that deleted every item has
    // nothing outstanding, and showing zero progress would nag forever.
    percent: ordered.length === 0 ? 100 : Math.round((done / ordered.length) * 100),
    complete: outstanding.length === 0,
    outstanding,
  };
}

export function byPosition(a: ChecklistItemLike, b: ChecklistItemLike): number {
  return a.position - b.position || a.label.localeCompare(b.label);
}

/**
 * Two items whose labels differ only in case or spacing are the same item.
 *
 * A checklist with "Loan checked" and "loan checked " on it is worse than
 * useless: somebody ticks one, believes the job is done, and the other sits
 * there accusing them.
 */
export function normaliseLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ");
}

export function isDuplicate(label: string, existing: readonly string[]): boolean {
  const wanted = normaliseLabel(label).toLowerCase();
  return existing.some((other) => normaliseLabel(other).toLowerCase() === wanted);
}

/** Appends to the end rather than renumbering everything. */
export function nextPosition(items: readonly { position: number }[]): number {
  return items.reduce((highest, item) => Math.max(highest, item.position), 0) + 1;
}

/**
 * Whether a run should be approved with items outstanding.
 *
 * Deliberately a warning and not a block. A school may legitimately have
 * nothing to do for an item this month, and a system that refuses to pay
 * anybody until a box is ticked teaches people to tick boxes. What it must
 * not do is let the outstanding items pass unmentioned.
 */
export function approvalWarning(progress: ChecklistProgress): string | null {
  if (progress.complete) return null;
  const count = progress.outstanding.length;
  const names = progress.outstanding.map((item) => item.label).join(", ");
  return `${count} month-end ${count === 1 ? "check has" : "checks have"} not been done: ${names}.`;
}

/**
 * Building next month's list from last month's.
 *
 * The labels carry over; the ticks never do. A checklist that arrived
 * pre-completed would be worse than having none, because it would look like
 * the work had been done.
 */
export function carryForward(previous: readonly ChecklistItemLike[]): { label: string; position: number }[] {
  return [...previous]
    .sort(byPosition)
    .map((item, index) => ({ label: item.label, position: index + 1 }));
}

export function seedFrom(previous: readonly ChecklistItemLike[]): { label: string; position: number }[] {
  if (previous.length > 0) return carryForward(previous);
  return DEFAULT_CHECKLIST.map((label, index) => ({ label, position: index + 1 }));
}
