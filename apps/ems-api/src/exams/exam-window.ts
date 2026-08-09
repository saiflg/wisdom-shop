/**
 * When a student may start a paper, and how long they have once they do.
 *
 * Two clocks, deliberately separate:
 *
 *  - the **window** (`opensAt`/`closesAt`) is the school's — when the paper
 *    may be attempted at all;
 *  - the **duration** is the student's — how long *they* get, counted from
 *    the moment they start.
 *
 * A student who starts five minutes before the window closes gets five
 * minutes, not their full hour. Any other reading lets a class start late
 * and sit past the end of the school day.
 */

export interface ExamTiming {
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  durationMinutes: number;
  opensAt: Date | null;
  closesAt: Date | null;
}

export type StartDecision = { allowed: true } | { allowed: false; reason: string };

const MINUTE_MS = 60_000;

/** Whether this student may begin, and if not, why — in words they can read. */
export function canStart(exam: ExamTiming, hasAttempt: boolean, now: Date): StartDecision {
  // Checked before the window: "you have already sat this" is the true and
  // more useful message even for a paper that has since closed.
  if (hasAttempt) {
    return { allowed: false, reason: "You have already started this exam" };
  }
  if (exam.status !== "PUBLISHED") {
    return { allowed: false, reason: "This exam is not open" };
  }
  if (exam.opensAt && now.getTime() < exam.opensAt.getTime()) {
    return { allowed: false, reason: "This exam has not opened yet" };
  }
  // Not `>=`: starting on the closing instant is starting inside the window,
  // the same reasoning as handing homework in exactly on the deadline.
  if (exam.closesAt && now.getTime() > exam.closesAt.getTime()) {
    return { allowed: false, reason: "This exam has closed" };
  }
  return { allowed: true };
}

/**
 * This student's own deadline, fixed at the moment they start.
 *
 * The earlier of "their full duration" and "when the paper closes" — and it
 * is stored on the attempt rather than recomputed, so an administrator
 * editing the duration mid-morning cannot shorten a clock already running.
 */
export function deadlineFor(exam: ExamTiming, startedAt: Date): Date {
  const byDuration = startedAt.getTime() + exam.durationMinutes * MINUTE_MS;
  const bound = exam.closesAt ? Math.min(byDuration, exam.closesAt.getTime()) : byDuration;
  return new Date(bound);
}

/** Past the deadline. Exactly on it is not yet expired. */
export function isExpired(expiresAt: Date, now: Date): boolean {
  return now.getTime() > expiresAt.getTime();
}

/**
 * Whole seconds left, never negative.
 *
 * Rounded **down** so the number a student sees never overstates what they
 * have: showing "1 second" for 400ms and then cutting them off reads as the
 * software stealing time.
 */
export function remainingSeconds(expiresAt: Date, now: Date): number {
  return Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
}

/**
 * A small deterministic shuffle, seeded per attempt.
 *
 * Two requirements pull against each other: neighbours should not see the
 * same order, and one student refreshing must see the paper they were
 * already looking at. Storing a seed on the attempt and regenerating the
 * order from it satisfies both without persisting the whole ordering.
 *
 * `Math.random` is deliberately not used — this is not security, it is
 * reproducibility, and a seeded mulberry32 is enough for both.
 */
export function seededOrder(length: number, seed: number): number[] {
  const indices = Array.from({ length }, (_, index) => index);
  let state = seed >>> 0;

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // Fisher–Yates, so every permutation is equally likely and no element can
  // stay put more often than any other.
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}
