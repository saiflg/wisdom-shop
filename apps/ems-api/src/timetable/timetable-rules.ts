import type { Weekday } from "ems-tenant-client";

/**
 * The rules that make a timetable possible rather than merely stored.
 *
 * Two people cannot be in two places at once, and a school day cannot have
 * two periods running over the same minutes. Both are obvious and both are
 * easy to violate through a form, so they are checked here — pure, so the
 * reasoning is testable — and again by unique indexes in the database, which
 * is what actually holds when two schedulers save at the same moment.
 *
 * Times are minutes since midnight throughout. A period is a time-of-day that
 * recurs, not an instant; storing it as a DateTime would drag in a date
 * nobody means and a timezone nobody set.
 */

export interface PeriodInput {
  id?: string;
  label: string;
  startMinute: number;
  endMinute: number;
}

export interface EntryInput {
  id?: string;
  classId: string;
  teacherUserId?: string | null;
  weekday: Weekday;
  periodId: string;
}

export interface Clash {
  kind: "CLASS_BUSY" | "TEACHER_BUSY";
  message: string;
  conflictingEntryId?: string;
}

const MINUTES_IN_DAY = 24 * 60;

/** "08:30" from 510. */
export function formatMinute(minute: number): string {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** 510 from "08:30", or null if it isn't a time. */
export function parseMinute(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Validates one period in isolation.
 *
 * A period that ends before it starts is the kind of thing a scheduler types
 * at the end of a long afternoon; refusing it here means the timetable grid
 * never has to render a negative-length slot.
 */
export function validatePeriod(period: PeriodInput): string | null {
  if (!Number.isInteger(period.startMinute) || !Number.isInteger(period.endMinute)) {
    return `"${period.label}" needs whole-minute start and end times`;
  }
  if (period.startMinute < 0 || period.endMinute > MINUTES_IN_DAY) {
    return `"${period.label}" falls outside a single day`;
  }
  if (period.endMinute <= period.startMinute) {
    return `"${period.label}" ends at or before it starts`;
  }
  return null;
}

/**
 * Validates a school's whole period structure.
 *
 * Periods must not overlap: a day where Period 2 starts before Period 1 ends
 * makes "which lesson is this class in right now" unanswerable, and the
 * timetable's per-slot uniqueness stops meaning anything.
 *
 * Touching periods are fine and normal — 09:00–09:40 followed by 09:40–10:20
 * is a school day, not a conflict. The comparison is strict for exactly that
 * reason.
 */
export function validatePeriodStructure(periods: PeriodInput[]): string | null {
  for (const period of periods) {
    const problem = validatePeriod(period);
    if (problem) return problem;
  }

  const labels = new Set<string>();
  for (const period of periods) {
    const key = period.label.trim().toLowerCase();
    if (!key) return "Every period needs a name";
    if (labels.has(key)) return `There are two periods called "${period.label}"`;
    labels.add(key);
  }

  const sorted = [...periods].sort((a, b) => a.startMinute - b.startMinute);
  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1] as PeriodInput;
    const current = sorted[i] as PeriodInput;
    if (current.startMinute < previous.endMinute) {
      return (
        `"${previous.label}" (${formatMinute(previous.startMinute)}–${formatMinute(previous.endMinute)}) and ` +
        `"${current.label}" (${formatMinute(current.startMinute)}–${formatMinute(current.endMinute)}) overlap`
      );
    }
  }

  return null;
}

/**
 * Finds what a proposed lesson would collide with.
 *
 * Returns every clash rather than the first, so a scheduler moving a lesson
 * sees the whole problem at once instead of fixing one and being told about
 * the next. `existing` may safely be the school's entire timetable — the slot
 * comparison narrows it.
 *
 * An entry being *edited* does not clash with itself: `proposed.id` is
 * excluded, otherwise saving a lesson without moving it would be refused.
 */
export function findClashes(
  proposed: EntryInput,
  existing: EntryInput[],
  describe: (entry: EntryInput) => string = () => "another lesson",
): Clash[] {
  const clashes: Clash[] = [];

  for (const entry of existing) {
    if (proposed.id && entry.id === proposed.id) continue;
    if (entry.weekday !== proposed.weekday || entry.periodId !== proposed.periodId) continue;

    if (entry.classId === proposed.classId) {
      clashes.push({
        kind: "CLASS_BUSY",
        message: `This class already has ${describe(entry)} in that slot`,
        conflictingEntryId: entry.id,
      });
    }

    // Only a real teacher clashes. Two unstaffed lessons in the same slot are
    // not a conflict — they are a timetable that has not been staffed yet,
    // which is the normal state halfway through planning a term.
    if (proposed.teacherUserId && entry.teacherUserId === proposed.teacherUserId) {
      clashes.push({
        kind: "TEACHER_BUSY",
        message: `That teacher is already taking ${describe(entry)} in that slot`,
        conflictingEntryId: entry.id,
      });
    }
  }

  return clashes;
}
