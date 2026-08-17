/**
 * Staff leave: asking for time off, and the school answering.
 *
 * Shaped like a parent's absence note — a range, a reason, somebody deciding
 * — with two things that one did not need. Leave is *counted*, so a request
 * has to know what is left; and leave is *approved*, so somebody other than
 * the person asking has to say yes.
 *
 * Pure, so the counting and the refusals can be argued with in a test rather
 * than by booking a holiday.
 */

export type LeaveType =
  | "ANNUAL"
  | "SICK"
  | "MATERNITY"
  | "PATERNITY"
  | "COMPASSIONATE"
  | "STUDY"
  | "UNPAID";

export const LEAVE_TYPES: readonly LeaveType[] = [
  "ANNUAL",
  "SICK",
  "MATERNITY",
  "PATERNITY",
  "COMPASSIONATE",
  "STUDY",
  "UNPAID",
];

const LABELS: Record<LeaveType, string> = {
  ANNUAL: "Annual leave",
  SICK: "Sick leave",
  MATERNITY: "Maternity leave",
  PATERNITY: "Paternity leave",
  COMPASSIONATE: "Compassionate leave",
  STUDY: "Study leave",
  UNPAID: "Unpaid leave",
};

export function leaveLabel(type: string): string {
  return LABELS[type as LeaveType] ?? type;
}

/**
 * Which kinds come out of the annual allowance.
 *
 * Only annual leave does. Counting maternity or bereavement against a
 * teacher's holiday is a policy decision no software should make quietly on
 * a school's behalf — those are recorded and reported, but they do not
 * consume the allowance.
 */
export function consumesAllowance(type: string): boolean {
  return type === "ANNUAL";
}

export type LeaveStatus = "REQUESTED" | "APPROVED" | "DECLINED" | "CANCELLED";

export interface LeaveLike {
  fromDate: Date;
  toDate: Date;
  type: string;
  status: string;
}

/** Midnight UTC, so a request made at 11pm covers the day it names. */
export function dayOf(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

/**
 * Working days in a range, both ends inclusive.
 *
 * Weekends are not leave. A teacher asking for Friday to Monday is asking for
 * two days off, and charging them four would be wrong in a way they would
 * notice immediately and rightly complain about.
 *
 * Public holidays are deliberately NOT handled: they vary by country and by
 * year, this product has no holiday calendar, and quietly guessing would be
 * worse than counting honestly and letting a school adjust. Said out loud in
 * the UI rather than hidden here.
 */
export function workingDays(from: Date, to: Date): number {
  const start = dayOf(from);
  const end = dayOf(to);
  if (end.getTime() < start.getTime()) return 0;

  let count = 0;
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

/** Calendar days, both ends inclusive — what the request spans. */
export function calendarDays(from: Date, to: Date): number {
  const span = Math.round((dayOf(to).getTime() - dayOf(from).getTime()) / 86_400_000) + 1;
  return Math.max(0, span);
}

/** Two requests cannot cover the same day. Both ends inclusive. */
export function overlaps(a: { fromDate: Date; toDate: Date }, b: { fromDate: Date; toDate: Date }): boolean {
  return dayOf(a.fromDate).getTime() <= dayOf(b.toDate).getTime()
    && dayOf(b.fromDate).getTime() <= dayOf(a.toDate).getTime();
}

/** Only a live request blocks another; a declined one is not a booking. */
export function blocksAnother(status: string): boolean {
  return status === "REQUESTED" || status === "APPROVED";
}

export interface Balance {
  entitlementDays: number;
  takenDays: number;
  pendingDays: number;
  remainingDays: number;
  /** True when the school has not set an allowance and is not counting. */
  untracked: boolean;
  summary: string;
}

/**
 * What is left of somebody's allowance.
 *
 * Requested-but-undecided days are held separately from approved ones rather
 * than merged: an administrator deciding a request needs to know that
 * approving it would overdraw the balance, and a total that already includes
 * it cannot tell them.
 *
 * An entitlement of zero means the school is not tracking allowances, not
 * that the person has no holiday — reporting "0 days remaining" for a school
 * that never set one would be a lie that stops people asking.
 */
export function balanceOf(input: {
  entitlementDays: number;
  approved: readonly LeaveLike[];
  pending: readonly LeaveLike[];
}): Balance {
  const countable = (rows: readonly LeaveLike[]) =>
    rows
      .filter((row) => consumesAllowance(row.type))
      .reduce((sum, row) => sum + workingDays(row.fromDate, row.toDate), 0);

  const takenDays = countable(input.approved);
  const pendingDays = countable(input.pending);

  if (input.entitlementDays <= 0) {
    return {
      entitlementDays: 0,
      takenDays,
      pendingDays,
      remainingDays: 0,
      untracked: true,
      summary: `${takenDays} ${takenDays === 1 ? "day" : "days"} of annual leave taken — no allowance set`,
    };
  }

  const remainingDays = input.entitlementDays - takenDays;
  return {
    entitlementDays: input.entitlementDays,
    takenDays,
    pendingDays,
    remainingDays,
    untracked: false,
    summary:
      `${remainingDays} of ${input.entitlementDays} days left` +
      (pendingDays > 0 ? `, ${pendingDays} awaiting a decision` : ""),
  };
}

export const MAX_SPAN_DAYS = 120;
export const MAX_BACKDATE_DAYS = 30;

/** Why a request cannot be made, or null. Every message names the next step. */
export function requestProblem(input: {
  fromDate: Date;
  toDate: Date;
  type: string;
  reason?: string | null;
  now: Date;
  existing: readonly (LeaveLike & { id?: string })[];
}): string | null {
  const from = dayOf(input.fromDate);
  const to = dayOf(input.toDate);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return "Choose the days you will be away.";
  if (to.getTime() < from.getTime()) return "The last day cannot be before the first day.";

  if (!LEAVE_TYPES.includes(input.type as LeaveType)) return "Choose a kind of leave.";

  if (workingDays(from, to) === 0) {
    // Somebody has asked for a weekend. Better to say so than to record a
    // request worth nothing and leave them wondering why nothing changed.
    return "That range is only weekend days, which do not count as leave.";
  }

  if (calendarDays(from, to) > MAX_SPAN_DAYS) {
    return `That is more than ${MAX_SPAN_DAYS} days. For longer than that, speak to the school office.`;
  }

  const backdated = Math.round((dayOf(input.now).getTime() - from.getTime()) / 86_400_000);
  if (backdated > MAX_BACKDATE_DAYS) {
    return `That started more than ${MAX_BACKDATE_DAYS} days ago. Ask the office to record it instead.`;
  }

  const clash = input.existing.find(
    (row) => blocksAnother(row.status) && overlaps({ fromDate: from, toDate: to }, row),
  );
  if (clash) {
    return `You already have ${leaveLabel(clash.type).toLowerCase()} booked over those dates.`;
  }

  if (input.type === "UNPAID" && !input.reason?.trim()) {
    return "Please say why the leave is unpaid.";
  }

  return null;
}

/**
 * Why a decision cannot be made, or null.
 *
 * The rule this exists for: nobody approves their own leave. An
 * administrator asking for a fortnight is asking somebody else, and a system
 * that lets them tick it themselves is not an approval process.
 */
export function decisionProblem(input: {
  status: string;
  requestedByUserId: string;
  deciderUserId: string;
}): string | null {
  if (input.status !== "REQUESTED") {
    return `That request has already been ${input.status.toLowerCase()}.`;
  }
  if (input.requestedByUserId === input.deciderUserId) {
    return "You cannot decide your own leave request. Ask another administrator.";
  }
  return null;
}

/** A request can be taken back by the person who made it, before it starts. */
export function canCancel(request: LeaveLike & { requestedByUserId: string }, viewerId: string, now: Date): boolean {
  if (request.requestedByUserId !== viewerId) return false;
  if (request.status !== "REQUESTED" && request.status !== "APPROVED") return false;
  return dayOf(request.fromDate).getTime() > dayOf(now).getTime();
}

/** "Mon 3 – Fri 7 Mar (5 days)" — words for a list. */
export function describeLeave(from: Date, to: Date): string {
  const fmt = (date: Date) =>
    dayOf(date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const days = workingDays(from, to);
  const range = dayOf(from).getTime() === dayOf(to).getTime() ? fmt(from) : `${fmt(from)} – ${fmt(to)}`;
  return `${range} (${days} ${days === 1 ? "day" : "days"})`;
}
