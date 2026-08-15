/**
 * A parent telling the school their child will be away.
 *
 * The school marks a child absent, the office gets an alert, and somebody
 * telephones the family — when the parent knew at seven o'clock that morning.
 * This is the message that was missing.
 *
 * **A note never changes a mark.** It informs; the school decides. Letting a
 * family set their own child's attendance to EXCUSED would make truancy
 * self-service, and attendance is routinely used to justify decisions about a
 * child. So a note is evidence put in front of whoever takes the register,
 * exactly like the "Recorded, never performed" rule the payroll module
 * follows for money.
 *
 * Pure, so the rules can be argued with in a test rather than clicked at in a
 * browser.
 */

export type AbsenceReason =
  | "ILLNESS"
  | "MEDICAL_APPOINTMENT"
  | "BEREAVEMENT"
  | "RELIGIOUS_OBSERVANCE"
  | "FAMILY_TRAVEL"
  | "OTHER";

export const ABSENCE_REASONS: readonly AbsenceReason[] = [
  "ILLNESS",
  "MEDICAL_APPOINTMENT",
  "BEREAVEMENT",
  "RELIGIOUS_OBSERVANCE",
  "FAMILY_TRAVEL",
  "OTHER",
];

const REASON_LABELS: Record<AbsenceReason, string> = {
  ILLNESS: "Illness",
  MEDICAL_APPOINTMENT: "Medical appointment",
  BEREAVEMENT: "Bereavement",
  RELIGIOUS_OBSERVANCE: "Religious observance",
  FAMILY_TRAVEL: "Family travel",
  OTHER: "Other",
};

export function reasonLabel(reason: string): string {
  return REASON_LABELS[reason as AbsenceReason] ?? "Other";
}

/**
 * How far back a parent may report.
 *
 * Backdating is legitimate and common — a child is ill on Monday and the
 * parent gets round to saying so on Tuesday. Two weeks is generous enough to
 * cover a bout of flu and short enough that nobody is quietly rewriting last
 * term.
 */
export const MAX_BACKDATE_DAYS = 14;

/** A term's worth of notice for a planned trip, and no more. */
export const MAX_FUTURE_DAYS = 180;

/** Nobody is away for a year. A range this long is a typo in the end date. */
export const MAX_SPAN_DAYS = 30;

/** Midnight UTC, matching how AttendanceRegister normalises its dates. */
export function dayOf(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((dayOf(to).getTime() - dayOf(from).getTime()) / 86_400_000);
}

export interface DateRange {
  fromDate: Date;
  toDate: Date;
}

/**
 * Why a proposed note must be refused, or null.
 *
 * Every message names what to do instead. "Invalid date range" tells a
 * worried parent nothing.
 */
export function rangeProblem(range: DateRange, now: Date): string | null {
  const from = dayOf(range.fromDate);
  const to = dayOf(range.toDate);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return "Please choose the days your child will be away.";
  }

  if (to.getTime() < from.getTime()) {
    return "The last day cannot be before the first day.";
  }

  const span = daysBetween(from, to) + 1;
  if (span > MAX_SPAN_DAYS) {
    return `That is more than ${MAX_SPAN_DAYS} days. For a longer absence, please speak to the school office.`;
  }

  const backdated = daysBetween(from, now);
  if (backdated > MAX_BACKDATE_DAYS) {
    return `That is more than ${MAX_BACKDATE_DAYS} days ago. Please tell the school office instead.`;
  }

  const ahead = daysBetween(now, to);
  if (ahead > MAX_FUTURE_DAYS) {
    return "That is too far ahead. Please tell the school office instead.";
  }

  return null;
}

/** OTHER without a word of explanation tells the school nothing at all. */
export function reasonProblem(reason: string, note: string | null | undefined): string | null {
  if (!ABSENCE_REASONS.includes(reason as AbsenceReason)) {
    return "Please choose a reason.";
  }
  if (reason === "OTHER" && !note?.trim()) {
    return "Please say briefly why your child will be away.";
  }
  return null;
}

export interface NoteLike extends DateRange {
  withdrawnAt: Date | null;
  acknowledgedAt: Date | null;
}

export type NoteState = "WITHDRAWN" | "ACKNOWLEDGED" | "SUBMITTED";

export function noteState(note: NoteLike): NoteState {
  if (note.withdrawnAt) return "WITHDRAWN";
  if (note.acknowledgedAt) return "ACKNOWLEDGED";
  return "SUBMITTED";
}

/**
 * Does this note speak for a particular school day?
 *
 * Inclusive of both ends — a parent saying "Monday to Wednesday" means
 * Wednesday too. Withdrawn notes speak for nothing.
 */
export function coversDate(note: NoteLike, date: Date): boolean {
  if (note.withdrawnAt) return false;
  const day = dayOf(date).getTime();
  return day >= dayOf(note.fromDate).getTime() && day <= dayOf(note.toDate).getTime();
}

/**
 * A parent may take back a note until the school has acted on it.
 *
 * After acknowledgement it stays: the school made a decision on the strength
 * of it, and a record that can be removed after the fact is not a record.
 * Withdrawing is not deleting — see the service.
 */
export function canWithdraw(note: NoteLike): boolean {
  return noteState(note) === "SUBMITTED";
}

/** "Thursday only", "Mon 3 – Wed 5 March" — words, for a register screen. */
export function describeRange(range: DateRange): string {
  const from = dayOf(range.fromDate);
  const to = dayOf(range.toDate);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

  return from.getTime() === to.getTime() ? fmt(from) : `${fmt(from)} – ${fmt(to)}`;
}

export function describeDuration(range: DateRange): string {
  const days = daysBetween(range.fromDate, range.toDate) + 1;
  return days === 1 ? "1 day" : `${days} days`;
}

/**
 * A note is health information about a child.
 *
 * "He has chickenpox" is a medical fact about a named minor. It belongs to
 * the people who need it to run the school — whoever takes the register, and
 * the office — and to nobody else. In particular it must never be included
 * in anything sent to an AI provider, which is the same rule this codebase
 * already applies to a student's accessibility notes.
 *
 * Stated as a function so the boundary is testable rather than a comment
 * somebody has to remember.
 */
export function canReadNoteDetail(viewer: { id: string; roles: string[] }, note: { createdByUserId: string }): boolean {
  if (viewer.roles.includes("SCHOOL_ADMIN") || viewer.roles.includes("TEACHER")) return true;
  // The parent who wrote it. Not the other parent of a different child, and
  // never the student themselves.
  return note.createdByUserId === viewer.id;
}

/**
 * What a register screen shows about a child with a note.
 *
 * The reason, never the free text. A teacher marking a register needs to know
 * this absence is explained and roughly why; the sentence a parent wrote
 * about their child's stomach is not something to put on a screen in front of
 * a classroom.
 */
export function registerHint(note: { reason: string }): string {
  return `Parent reported: ${reasonLabel(note.reason).toLowerCase()}`;
}
