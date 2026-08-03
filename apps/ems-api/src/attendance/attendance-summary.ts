import type { AttendanceStatus } from "ems-tenant-client";

/**
 * Attendance counts and rates.
 *
 * The trap here is an empty set: `0 / 0` is `NaN`, and a NaN attendance
 * rate rendered to a parent or used in a report is worse than showing
 * nothing. `presentRate` is therefore `null` — not 0 — when there is
 * nothing to measure, because "no data" and "attended none of it" are
 * very different claims about a child.
 */

export interface AttendanceCounts {
  PRESENT: number;
  ABSENT: number;
  LATE: number;
  EXCUSED: number;
}

export interface AttendanceSummary {
  counts: AttendanceCounts;
  total: number;
  /** Percentage to one decimal place, or null when there are no records. */
  presentRate: number | null;
}

const EMPTY_COUNTS: AttendanceCounts = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 };

/**
 * LATE counts as attending: the child was in the room. EXCUSED does not
 * count as present, but is reported separately so an authorised absence
 * isn't conflated with truancy.
 */
const ATTENDED: AttendanceStatus[] = ["PRESENT", "LATE"];

export function summariseAttendance(statuses: AttendanceStatus[]): AttendanceSummary {
  const counts: AttendanceCounts = { ...EMPTY_COUNTS };
  for (const status of statuses) {
    counts[status] += 1;
  }

  const total = statuses.length;
  if (total === 0) return { counts, total: 0, presentRate: null };

  const attended = ATTENDED.reduce((sum, status) => sum + counts[status], 0);
  // Rounded to one decimal via integer maths so 1/3 is a stable 33.3
  // rather than a long binary fraction.
  const presentRate = Math.round((attended / total) * 1000) / 10;

  return { counts, total, presentRate };
}
