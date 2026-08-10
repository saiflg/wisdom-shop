/**
 * Reading a staff roster: searching it, splitting it, and saying where
 * somebody stands in their employment.
 *
 * Pure and free of React so the rules can be argued with in a test rather than
 * clicked at in a browser. Nothing here talks to the API — it only ever shapes
 * what the API already returned, which matters most for the one thing this
 * module must never do: turn a masked account number back into a lookup key.
 */

import type { EmploymentType, StaffMember } from "./use-staff";

export const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  FULL_TIME: "Full time",
  PART_TIME: "Part time",
  CONTRACT: "Contract",
  VOLUNTEER: "Volunteer",
};

export type StaffGroup = "all" | "teaching" | "non-teaching";

/**
 * Teaching staff are the ones who teach.
 *
 * A head of school holding both roles counts as teaching, because the question
 * this filter answers is "who is in front of a class", and they are. Everyone
 * else with a staff record — bursar, registrar, secretary — is non-teaching.
 */
export function isTeaching(member: Pick<StaffMember, "roles">): boolean {
  return member.roles.includes("TEACHER");
}

/**
 * Does this staff member match what was typed?
 *
 * Searches name, staff number, job title and email — the things printed on a
 * lanyard or written on a form. Emphatically *not* the masked account number:
 * matching on it would let anyone with the list confirm the last four digits
 * of a colleague's account by typing guesses, which is precisely the disclosure
 * the mask exists to prevent. The mask is a reassurance that the right record
 * is on screen, not a searchable field.
 */
export function matchesStaffQuery(member: StaffMember, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  const haystack = [
    member.firstName,
    member.lastName,
    `${member.firstName} ${member.lastName}`,
    member.staffNumber,
    member.jobTitle,
    member.email,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());

  return haystack.some((value) => value.includes(needle));
}

export function filterStaff(
  members: StaffMember[],
  options: { query?: string; group?: StaffGroup } = {},
): StaffMember[] {
  const { query = "", group = "all" } = options;
  return members.filter((member) => {
    if (group === "teaching" && !isTeaching(member)) return false;
    if (group === "non-teaching" && isTeaching(member)) return false;
    return matchesStaffQuery(member, query);
  });
}

export type EmploymentState = "FUTURE" | "CURRENT" | "ENDED";

/** The calendar day of an ISO timestamp, ignoring the clock entirely. */
function isoDay(value: string | Date): string {
  return (typeof value === "string" ? value : value.toISOString()).slice(0, 10);
}

/**
 * Where someone stands today: not yet started, employed, or gone.
 *
 * Compared as calendar days rather than instants. A contract that ends on the
 * 31st is still a contract at nine in the morning on the 31st, and an
 * end-of-day timestamp comparison would say otherwise depending on the reader's
 * timezone.
 *
 * Someone with no dates on file is CURRENT. Most schools fill these in late,
 * and treating a blank field as "left" would drop real staff off the roster.
 */
export function employmentState(
  member: Pick<StaffMember, "startDate" | "endDate">,
  today: Date,
): EmploymentState {
  const now = isoDay(today);
  if (member.endDate && isoDay(member.endDate) < now) return "ENDED";
  if (member.startDate && isoDay(member.startDate) > now) return "FUTURE";
  return "CURRENT";
}

/** One line describing the job, for a list row. */
export function employmentSummary(member: StaffMember): string {
  const parts = [
    member.jobTitle,
    member.employmentType ? EMPLOYMENT_LABELS[member.employmentType] : null,
    member.staffNumber,
  ].filter((value): value is string => Boolean(value));

  // Roles rather than nothing at all: a record with no employment details yet
  // still has to say what the person is.
  if (parts.length === 0) return isTeaching(member) ? "Teacher" : "Administrator";
  return parts.join(" · ");
}

/**
 * What the directory says about someone's bank details.
 *
 * Never the number, masked or otherwise — only whether payroll will be able to
 * pay them. Somebody scanning this list before a payroll run is asking "who
 * will be missed", and that is the answer.
 */
export function bankSummary(member: StaffMember): string {
  if (!member.bank.hasAccountNumber) return "No account on file";
  return member.bank.bankName ? `${member.bank.bankName} on file` : "Account on file";
}

/** Staff payroll would skip, in the order somebody would want to fix them. */
export function missingBankDetails(members: StaffMember[], today: Date): StaffMember[] {
  return members.filter(
    (member) => !member.bank.hasAccountNumber && employmentState(member, today) !== "ENDED",
  );
}
