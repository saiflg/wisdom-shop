/**
 * Teaching load, and the honest gaps around it.
 *
 * Same principle as the student dashboard: a figure the school has no basis
 * for is absent rather than zero. The difference here is that some of these
 * numbers feed conversations about somebody's job, so the cost of inventing
 * one is higher, not lower.
 */

export interface TeachingAssignmentLike {
  classId: string;
  subjectId: string;
}

export interface TimetableEntryLike {
  /** Minutes from midnight. */
  startMinute: number;
  endMinute: number;
}

export interface NoteCounts {
  draft: number;
  submitted: number;
  returned: number;
  approved: number;
}

export interface TeachingLoad {
  classes: number;
  subjects: number;
  periods: number;
  /** Minutes timetabled per week. Null when nothing is timetabled at all. */
  minutesPerWeek: number | null;
}

/**
 * What somebody actually teaches.
 *
 * Classes and subjects are counted distinctly rather than as assignment rows.
 * A teacher taking three subjects with one class has three assignments, one
 * class and three subjects — reporting "3 classes" would double their
 * apparent load in the one place somebody looks before adding more.
 */
export function teachingLoad(
  assignments: TeachingAssignmentLike[],
  timetable: TimetableEntryLike[],
): TeachingLoad {
  const classes = new Set(assignments.map((a) => a.classId));
  const subjects = new Set(assignments.map((a) => a.subjectId));

  const minutes = timetable.reduce(
    (sum, entry) => sum + Math.max(0, entry.endMinute - entry.startMinute),
    0,
  );

  return {
    classes: classes.size,
    subjects: subjects.size,
    periods: timetable.length,
    // Null, not zero: a teacher whose timetable has not been entered is not a
    // teacher with nothing to do, and this is the figure somebody would use
    // to justify giving them more.
    minutesPerWeek: timetable.length === 0 ? null : minutes,
  };
}

/**
 * What is waiting on this person, and what they are waiting on.
 *
 * Kept apart because they are different obligations. A note sent back to a
 * teacher is theirs to fix; a note they submitted is somebody else's to read.
 * Collapsing them into "3 outstanding" would tell them to chase themselves.
 */
export function noteObligations(counts: NoteCounts): { mine: number; theirs: number } {
  return { mine: counts.draft + counts.returned, theirs: counts.submitted };
}

export interface StaffFlagInput {
  attendanceRate: number | null;
  notes: NoteCounts;
  leaveUntracked: boolean;
  remainingLeaveDays: number;
}

/**
 * Things worth an adult's attention on this person's page.
 *
 * Deliberately not a performance score. These are prompts to do something —
 * write up a returned note, look at an attendance figure — and a number
 * combining them would become a rating attached to somebody's employment
 * without anybody deciding it should be.
 */
export function staffFlags(input: StaffFlagInput): string[] {
  const flags: string[] = [];

  if (input.notes.returned > 0) {
    flags.push(
      input.notes.returned === 1
        ? "1 lesson note sent back to be fixed"
        : `${input.notes.returned} lesson notes sent back to be fixed`,
    );
  }

  if (input.attendanceRate !== null && input.attendanceRate < 90) {
    flags.push(`Attendance is ${input.attendanceRate}%`);
  }

  // Only when an allowance is actually being tracked. "0 days left" against a
  // school that never set an entitlement is not a fact about this person.
  if (!input.leaveUntracked && input.remainingLeaveDays < 0) {
    flags.push(`${Math.abs(input.remainingLeaveDays)} days of leave over the allowance`);
  }

  return flags;
}
