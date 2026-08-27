import { dayOf, type LeaveLike } from "@/staff/leave";

export type StaffAttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "ON_LEAVE";

export interface StaffAttendanceLike {
  status: StaffAttendanceStatus;
  minutesLate?: number | null;
}

export interface StaffAttendanceSummary {
  present: number;
  absent: number;
  late: number;
  onLeave: number;
  /** Days the person was expected and turned up, late or not. */
  attended: number;
  /** Days they were expected at all — leave is not an expectation. */
  expected: number;
  /** Minutes late across the period, for the days that were late. */
  minutesLate: number;
}

/**
 * Is this person on approved leave on this day?
 *
 * Only APPROVED counts. A request that is still REQUESTED is a person who
 * has asked and not yet been told, and they are expected at work until
 * somebody says otherwise — marking them on leave because they hoped to be
 * would hide a real absence.
 *
 * Both ends inclusive, on UTC midnight, matching how leave itself is stored.
 */
export function isOnApprovedLeave(leaves: LeaveLike[], date: Date): boolean {
  const day = dayOf(date).getTime();
  return leaves.some((leave) => {
    if (leave.status !== "APPROVED") return false;
    return dayOf(leave.fromDate).getTime() <= day && day <= dayOf(leave.toDate).getTime();
  });
}

export interface ResolvedStatus {
  status: StaffAttendanceStatus;
  /** Set when the rules changed what was asked for, so it can be said out loud. */
  note: string | null;
}

/**
 * What a mark should actually be, given the leave that was approved.
 *
 * The rule this exists for: **a person on approved leave is never absent.**
 * A head teacher running down a register on Monday morning does not have
 * everybody's leave in their head, and an absence recorded against somebody
 * the school itself signed off is the kind of error that surfaces months
 * later in a payroll dispute — by which time nobody remembers.
 *
 * Turning up anyway is left alone. Somebody who came in on their leave day
 * was present, and overwriting that with ON_LEAVE would erase work they
 * actually did.
 */
export function resolveStatus(requested: StaffAttendanceStatus, onApprovedLeave: boolean): ResolvedStatus {
  if (!onApprovedLeave) return { status: requested, note: null };

  if (requested === "ABSENT") {
    return {
      status: "ON_LEAVE",
      note: "Recorded as on leave: this absence falls inside approved leave.",
    };
  }

  // PRESENT and LATE on a leave day are real facts about a person who came
  // in regardless, and they stand.
  return { status: requested, note: null };
}

/**
 * Why this mark cannot be recorded, or null.
 *
 * `minutesLate` only means anything on a LATE mark. Carrying it on a PRESENT
 * row would make "how late was everybody" quietly wrong the first time
 * somebody changed a status without clearing the number.
 */
export function validateMark(status: StaffAttendanceStatus, minutesLate: number | null | undefined): string | null {
  if (minutesLate === null || minutesLate === undefined) {
    return status === "LATE" ? "Say how late they were" : null;
  }
  if (status !== "LATE") return "Minutes late only apply to a late mark";
  if (!Number.isInteger(minutesLate)) return "Minutes late must be a whole number";
  if (minutesLate <= 0) return "Minutes late must be above zero";
  if (minutesLate > 600) return "That is more than a working day late";
  return null;
}

/**
 * What a period of marks adds up to.
 *
 * `expected` deliberately excludes leave days. A teacher who took two weeks
 * of approved leave has not got worse attendance for it, and a percentage
 * computed against every calendar day would say they had.
 */
export function summariseStaffAttendance(days: StaffAttendanceLike[]): StaffAttendanceSummary {
  let present = 0;
  let absent = 0;
  let late = 0;
  let onLeave = 0;
  let minutesLate = 0;

  for (const day of days) {
    switch (day.status) {
      case "PRESENT":
        present += 1;
        break;
      case "ABSENT":
        absent += 1;
        break;
      case "LATE":
        late += 1;
        minutesLate += Math.max(0, day.minutesLate ?? 0);
        break;
      case "ON_LEAVE":
        onLeave += 1;
        break;
    }
  }

  return {
    present,
    absent,
    late,
    onLeave,
    attended: present + late,
    expected: present + late + absent,
    minutesLate,
  };
}

/**
 * Attendance as a percentage, or null when nobody was expected.
 *
 * Null rather than zero or a hundred: a month in which somebody was on leave
 * throughout has no attendance rate, and inventing one — either one — puts a
 * number in a payroll conversation that no fact supports.
 */
export function attendanceRate(summary: StaffAttendanceSummary): number | null {
  if (summary.expected === 0) return null;
  return Math.round((summary.attended / summary.expected) * 1000) / 10;
}
