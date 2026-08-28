import { formatMinute } from "@/timetable/timetable-rules";

export type TransportDirection = "MORNING" | "AFTERNOON" | "BOTH";

export interface AssignmentLike {
  direction: TransportDirection;
}

export interface StopLike {
  name: string;
  position: number;
  /** Minutes from midnight, like the timetable. Null when a school has not set one. */
  pickupMinute: number | null;
}

/**
 * How many seats a run actually uses.
 *
 * The rule that is easy to get wrong: a bus with thirty seats doing a morning
 * run and an afternoon run carries thirty children in the morning and thirty
 * in the afternoon — not thirty in total. Counting every assignment against
 * one capacity would refuse half a school's children a seat that exists.
 *
 * A child riding BOTH ways occupies a seat on each run, so BOTH counts once
 * towards each direction and never twice towards one.
 */
export function seatsTaken(assignments: AssignmentLike[], direction: "MORNING" | "AFTERNOON"): number {
  return assignments.filter(
    (assignment) => assignment.direction === direction || assignment.direction === "BOTH",
  ).length;
}

/** The two runs, so a screen can show both without recomputing the rule. */
export function seatsByDirection(assignments: AssignmentLike[]): { morning: number; afternoon: number } {
  return {
    morning: seatsTaken(assignments, "MORNING"),
    afternoon: seatsTaken(assignments, "AFTERNOON"),
  };
}

export interface AssignCheck {
  seats: number;
  existing: AssignmentLike[];
  direction: TransportDirection;
  /** Whether this child is already on this route. */
  alreadyOnThisRoute: boolean;
  /** The name of another route this child is already on for the same run, if any. */
  clashingRoute: string | null;
}

/**
 * Why this child cannot be put on this run, or null when they can.
 *
 * The clash check matters more than the capacity one: a child on two routes
 * at the same time is not a full bus, it is a child nobody is waiting for at
 * one of two gates.
 */
export function assignProblem(check: AssignCheck): string | null {
  if (check.alreadyOnThisRoute) return "They are already on this route";

  if (check.clashingRoute) {
    return `They are already on ${check.clashingRoute} for that run`;
  }

  if (check.seats <= 0) return "That route has no vehicle with seats on it yet";

  const wanted: ("MORNING" | "AFTERNOON")[] =
    check.direction === "BOTH" ? ["MORNING", "AFTERNOON"] : [check.direction];

  for (const run of wanted) {
    if (seatsTaken(check.existing, run) >= check.seats) {
      return run === "MORNING" ? "The morning run is full" : "The afternoon run is full";
    }
  }

  return null;
}

/**
 * Stops in the order the bus visits them.
 *
 * Position decides; the name breaks ties so the same data always produces the
 * same order. A route that reshuffled between page loads would have a parent
 * reading a different pickup time each time they checked.
 */
export function orderStops<T extends StopLike>(stops: T[]): T[] {
  return [...stops].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
}

/**
 * Stops whose pickup time goes backwards along the route.
 *
 * A bus cannot reach the fourth stop before the third. This is almost always
 * a typo — 07:50 entered as 06:50 — and the consequence is a family standing
 * outside an hour early. Reported rather than corrected: only the school
 * knows whether the time is wrong or the order is.
 */
export function stopsOutOfOrder(stops: StopLike[]): string[] {
  const ordered = orderStops(stops);
  const problems: string[] = [];
  let previous: { name: string; minute: number } | null = null;

  for (const stop of ordered) {
    if (stop.pickupMinute === null) continue;
    if (previous && stop.pickupMinute < previous.minute) {
      problems.push(
        `${stop.name} (${formatMinute(stop.pickupMinute)}) comes after ${previous.name} ` +
          `(${formatMinute(previous.minute)}) on the route but is earlier in the day`,
      );
    }
    previous = { name: stop.name, minute: stop.pickupMinute };
  }

  return problems;
}

/** Why this pickup time is not a time, or null. */
export function validatePickupMinute(minute: number | null | undefined): string | null {
  if (minute === null || minute === undefined) return null;
  if (!Number.isInteger(minute)) return "A pickup time has to be a whole number of minutes";
  if (minute < 0 || minute > 24 * 60 - 1) return "That is not a time of day";
  return null;
}
