/**
 * When a student may hand work in, and whether it counts as late.
 *
 * Pure and free of Prisma, because these are the rules a student will argue
 * about with a teacher and a teacher will argue about with a parent. They
 * deserve to be written down in one place and tested exhaustively rather than
 * scattered through a service.
 */

export type AssignmentStatus = "DRAFT" | "SET" | "CLOSED";
export type SubmissionStatus = "SUBMITTED" | "MARKED" | "RELEASED";

export type SubmitDecision = { allowed: true; isLate: boolean } | { allowed: false; reason: string };

/**
 * Whether work handed in at `now` is late.
 *
 * An assignment with no due date is never late — plenty of homework is "before
 * next lesson" rather than a timestamp, and inventing one would make work look
 * late that nobody considered late.
 *
 * The comparison is strictly greater-than, so a submission at exactly the due
 * moment is on time. A student who hands in as the clock strikes has met the
 * deadline, and the alternative is telling them otherwise.
 */
export function isLate(dueAt: Date | null | undefined, now: Date): boolean {
  if (!dueAt) return false;
  return now.getTime() > dueAt.getTime();
}

/**
 * Whether this student may hand in now.
 *
 * Late work is *accepted and flagged*, not refused: a teacher can see it was
 * late and decide what that is worth, whereas software that refuses it has
 * decided for them and lost the work. Only an explicitly CLOSED assignment
 * turns submissions away.
 */
export function canSubmit(
  assignment: { status: AssignmentStatus; dueAt: Date | null },
  existing: { status: SubmissionStatus } | null,
  now: Date,
): SubmitDecision {
  if (assignment.status === "DRAFT") {
    // Should be unreachable — a draft is not visible to students at all — but
    // stated rather than assumed.
    return { allowed: false, reason: "This work has not been set yet" };
  }

  if (assignment.status === "CLOSED") {
    return { allowed: false, reason: "This work is closed and no longer accepts submissions" };
  }

  if (existing && existing.status !== "SUBMITTED") {
    // Replacing work after it has been marked would silently invalidate the
    // mark, and a teacher would have no way of knowing.
    return { allowed: false, reason: "This has already been marked and can no longer be changed" };
  }

  return { allowed: true, isLate: isLate(assignment.dueAt, now) };
}

export type MarkDecision = { allowed: true } | { allowed: false; reason: string };

/** A mark has to fit the assignment it is for. */
export function canMark(
  scoreHundredths: number | null,
  maxScoreHundredths: number,
): MarkDecision {
  if (scoreHundredths === null) return { allowed: true };

  if (!Number.isInteger(scoreHundredths)) {
    return { allowed: false, reason: "A mark must be a whole number of hundredths" };
  }
  if (scoreHundredths < 0) {
    return { allowed: false, reason: "A mark cannot be negative" };
  }
  if (scoreHundredths > maxScoreHundredths) {
    return {
      allowed: false,
      reason: `That is more than the ${maxScoreHundredths / 100} this work is out of`,
    };
  }
  return { allowed: true };
}

/** Whether the student is allowed to see the mark yet. */
export function isMarkVisibleToStudent(status: SubmissionStatus): boolean {
  // MARKED deliberately is not: a teacher marking a class over an evening
  // should not be releasing marks one at a time as they go.
  return status === "RELEASED";
}

export interface AssignmentProgress {
  expected: number;
  submitted: number;
  marked: number;
  released: number;
  late: number;
  outstanding: number;
}

/**
 * What a teacher wants to know at a glance: who has handed in.
 *
 * `outstanding` counts students who have not submitted at all, which is the
 * number the teacher is actually chasing.
 */
export function summariseProgress(
  expected: number,
  submissions: Array<{ status: SubmissionStatus; isLate: boolean }>,
): AssignmentProgress {
  const submitted = submissions.length;
  return {
    expected,
    submitted,
    marked: submissions.filter((s) => s.status === "MARKED" || s.status === "RELEASED").length,
    released: submissions.filter((s) => s.status === "RELEASED").length,
    late: submissions.filter((s) => s.isLate).length,
    outstanding: Math.max(0, expected - submitted),
  };
}
