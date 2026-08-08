/**
 * "What is happening today" and "what is due", decided in one tested place.
 *
 * Pure, because a portal that shows a child the wrong day's lessons or tells
 * them homework is overdue when it is not is worse than one that shows
 * nothing — and both mistakes are one off-by-one away.
 */

export type Weekday =
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY"
  | "SUNDAY";

const WEEKDAYS: Weekday[] = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

/**
 * The weekday a date falls on, in the same spelling the timetable stores.
 *
 * Returns the weekend days too rather than null: a school running Saturday
 * classes is real, and deciding on this student's behalf that Saturday has
 * no lessons would hide them.
 */
export function weekdayOf(date: Date): Weekday {
  return WEEKDAYS[date.getDay()];
}

export function isWeekend(date: Date): boolean {
  const day = weekdayOf(date);
  return day === "SATURDAY" || day === "SUNDAY";
}

/** Midnight local, which is what "today" means to a school. */
export function startOfDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function endOfDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
}

export type DueBucket = "overdue" | "today" | "upcoming" | "no-deadline";

/**
 * Which pile a piece of homework belongs in.
 *
 * The deadline itself is *not* overdue — the same rule the submission logic
 * uses, and the two must agree or the portal will call something late that
 * the server would happily accept.
 */
export function dueBucket(dueAt: Date | null | undefined, now: Date): DueBucket {
  if (!dueAt) return "no-deadline";
  if (now.getTime() > dueAt.getTime()) return "overdue";
  return dueAt.getTime() <= endOfDay(now).getTime() ? "today" : "upcoming";
}

export interface DueItem {
  dueAt: Date | null;
}

export interface DueSummary<T> {
  overdue: T[];
  today: T[];
  upcoming: T[];
  noDeadline: T[];
}

/**
 * Sorts work into piles, each in the order a student would work through it.
 *
 * Overdue first and oldest-first within it, because the thing most overdue is
 * the thing to do next; upcoming soonest-first for the same reason.
 */
export function bucketByDue<T extends DueItem>(items: T[], now: Date): DueSummary<T> {
  const summary: DueSummary<T> = { overdue: [], today: [], upcoming: [], noDeadline: [] };

  for (const item of items) {
    switch (dueBucket(item.dueAt, now)) {
      case "overdue":
        summary.overdue.push(item);
        break;
      case "today":
        summary.today.push(item);
        break;
      case "upcoming":
        summary.upcoming.push(item);
        break;
      default:
        summary.noDeadline.push(item);
    }
  }

  const byDue = (a: T, b: T) => (a.dueAt?.getTime() ?? 0) - (b.dueAt?.getTime() ?? 0);
  summary.overdue.sort(byDue);
  summary.today.sort(byDue);
  summary.upcoming.sort(byDue);

  return summary;
}
