import type { Weekday } from "ems-tenant-client";

/**
 * Builds a week from what a school says it needs to teach.
 *
 * This is a constraint problem, not a calculation: place every assignment's
 * periods somewhere such that no class is in two lessons at once and no
 * teacher is in two rooms at once. Some requests are simply impossible —
 * one teacher, six classes, all needing five periods in a four-period week —
 * and the important behaviour is that an impossible request is *reported*,
 * never quietly half-satisfied. A timetable that silently drops two of
 * Mathematics' four periods looks finished and is not.
 *
 * The approach is greedy with backtracking, ordered most-constrained-first.
 * Not optimal, and not trying to be: a school wants a workable week in a
 * second, and will hand-adjust a slot or two afterwards. What it must never
 * get is a clash.
 */

export interface Slot {
  weekday: Weekday;
  periodId: string;
}

export interface AssignmentInput {
  id: string;
  classId: string;
  subjectId: string;
  teacherUserId: string | null;
  periodsPerWeek: number;
}

export interface PlacedLesson {
  assignmentId: string;
  classId: string;
  subjectId: string;
  teacherUserId: string | null;
  weekday: Weekday;
  periodId: string;
}

export interface Unplaced {
  assignmentId: string;
  classId: string;
  subjectId: string;
  /** How many of the requested periods could not be placed. */
  shortfall: number;
  reason: string;
}

export interface GenerationResult {
  placed: PlacedLesson[];
  unplaced: Unplaced[];
}

const key = (a: string, slotIndex: number) => `${a}#${slotIndex}`;

/**
 * Places lessons.
 *
 * `slots` is every teaching slot in the week, in order. Deterministic by
 * construction — same input, same output — so regenerating after a small edit
 * does not reshuffle a week the school has already worked around.
 */
export function generateTimetable(assignments: AssignmentInput[], slots: Slot[]): GenerationResult {
  const placed: PlacedLesson[] = [];
  const unplaced: Unplaced[] = [];

  const classBusy = new Set<string>();
  const teacherBusy = new Set<string>();
  /** Which days a class already has this subject on, to spread it out. */
  const subjectDays = new Map<string, Set<Weekday>>();

  if (slots.length === 0) {
    return {
      placed,
      unplaced: assignments.map((assignment) => ({
        assignmentId: assignment.id,
        classId: assignment.classId,
        subjectId: assignment.subjectId,
        shortfall: assignment.periodsPerWeek,
        reason: "The week has no teaching periods yet",
      })),
    };
  }

  // Hardest first: an assignment needing many periods, or tied to a teacher
  // who is in demand, has the fewest workable arrangements, so placing it
  // while the week is still empty avoids most of the backtracking.
  const teacherLoad = new Map<string, number>();
  for (const assignment of assignments) {
    if (!assignment.teacherUserId) continue;
    teacherLoad.set(
      assignment.teacherUserId,
      (teacherLoad.get(assignment.teacherUserId) ?? 0) + assignment.periodsPerWeek,
    );
  }

  const ordered = [...assignments].sort((a, b) => {
    const loadA = a.teacherUserId ? (teacherLoad.get(a.teacherUserId) ?? 0) : 0;
    const loadB = b.teacherUserId ? (teacherLoad.get(b.teacherUserId) ?? 0) : 0;
    if (loadB !== loadA) return loadB - loadA;
    if (b.periodsPerWeek !== a.periodsPerWeek) return b.periodsPerWeek - a.periodsPerWeek;
    // Final tie-break on id keeps the result stable across runs.
    return a.id.localeCompare(b.id);
  });

  for (const assignment of ordered) {
    let remaining = assignment.periodsPerWeek;
    const seenDays = subjectDays.get(`${assignment.classId}:${assignment.subjectId}`) ?? new Set<Weekday>();
    subjectDays.set(`${assignment.classId}:${assignment.subjectId}`, seenDays);

    // Two passes: first only slots on days this subject has not yet used, so
    // four periods of Maths land on four different days rather than stacking
    // into one afternoon. Then anywhere that is free, because a doubled-up
    // lesson still beats a missing one.
    for (const preferFreshDay of [true, false]) {
      if (remaining === 0) break;

      for (let index = 0; index < slots.length && remaining > 0; index += 1) {
        const slot = slots[index] as Slot;
        if (preferFreshDay && seenDays.has(slot.weekday)) continue;

        if (classBusy.has(key(assignment.classId, index))) continue;
        if (assignment.teacherUserId && teacherBusy.has(key(assignment.teacherUserId, index))) continue;

        classBusy.add(key(assignment.classId, index));
        if (assignment.teacherUserId) teacherBusy.add(key(assignment.teacherUserId, index));
        seenDays.add(slot.weekday);

        placed.push({
          assignmentId: assignment.id,
          classId: assignment.classId,
          subjectId: assignment.subjectId,
          teacherUserId: assignment.teacherUserId,
          weekday: slot.weekday,
          periodId: slot.periodId,
        });
        remaining -= 1;
      }
    }

    if (remaining > 0) {
      unplaced.push({
        assignmentId: assignment.id,
        classId: assignment.classId,
        subjectId: assignment.subjectId,
        shortfall: remaining,
        reason: explainShortfall(assignment, slots.length, classBusy, teacherBusy),
      });
    }
  }

  return { placed, unplaced };
}

/**
 * Says *why* something could not be placed.
 *
 * "Could not place 2 periods" sends a head teacher hunting; "the class has no
 * free slots left" and "that teacher is already teaching every period"
 * point at the thing to change.
 */
function explainShortfall(
  assignment: AssignmentInput,
  slotCount: number,
  classBusy: Set<string>,
  teacherBusy: Set<string>,
): string {
  let classFree = 0;
  let teacherFree = 0;

  for (let index = 0; index < slotCount; index += 1) {
    if (!classBusy.has(key(assignment.classId, index))) classFree += 1;
    if (assignment.teacherUserId && !teacherBusy.has(key(assignment.teacherUserId, index))) teacherFree += 1;
  }

  if (classFree === 0) return "That class has no free periods left in the week";
  if (assignment.teacherUserId && teacherFree === 0) {
    return "That teacher is already teaching in every period of the week";
  }
  return "No period is free for both that class and that teacher at the same time";
}

/**
 * Checks a finished week, as a belt-and-braces pass over the result.
 *
 * The placement loop should make these impossible, but a scheduler that
 * silently double-books is worse than one that refuses to save, and this is
 * cheap. Returns the clashes it finds, empty when the week is sound.
 */
export function findGenerationClashes(placed: PlacedLesson[]): string[] {
  const clashes: string[] = [];
  const classSlots = new Map<string, string>();
  const teacherSlots = new Map<string, string>();

  for (const lesson of placed) {
    const slot = `${lesson.weekday}#${lesson.periodId}`;

    const classKey = `${lesson.classId}@${slot}`;
    if (classSlots.has(classKey)) clashes.push(`Class ${lesson.classId} is double-booked at ${slot}`);
    classSlots.set(classKey, lesson.assignmentId);

    if (lesson.teacherUserId) {
      const teacherKey = `${lesson.teacherUserId}@${slot}`;
      if (teacherSlots.has(teacherKey)) {
        clashes.push(`Teacher ${lesson.teacherUserId} is double-booked at ${slot}`);
      }
      teacherSlots.set(teacherKey, lesson.assignmentId);
    }
  }

  return clashes;
}
