/**
 * Who has left the school, and what it costs to replace them.
 *
 * A turnover register looks like a list of departures and is really a
 * staffing plan: the questions it answers are "which section is short",
 * "what will the replacement cost", and "are we losing people faster than we
 * did last year". So it is grouped by section rather than listed
 * chronologically, and it carries the salary each leaver was actually last
 * paid rather than a current figure that no longer exists.
 *
 * Pure, so the tenure arithmetic — the part that is fiddly and easy to get
 * quietly wrong — can be proven in a test.
 */

export interface Leaver {
  staffProfileId: string;
  name: string;
  /** "Primary", "Security", "Islamiyyah". Null when nobody recorded one. */
  section: string | null;
  jobTitle: string | null;
  startDate: Date | null;
  endDate: Date;
  /**
   * What they were last actually paid, from their final payslip.
   *
   * Taken from the payslip rather than from their salary components, because
   * components are edited and deleted after somebody leaves; a payslip is a
   * snapshot of what really happened.
   */
  lastMonthlyCents: number | null;
  currency: string | null;
}

/**
 * How long somebody was here, in whole months.
 *
 * Whole months, not days: nobody asks how many days a teacher stayed, and a
 * day count invites a false precision that start dates recorded as "June
 * 2024" cannot support.
 */
export function tenureMonths(startDate: Date | null, endDate: Date): number | null {
  if (!startDate) return null;
  const months =
    (endDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12 +
    (endDate.getUTCMonth() - startDate.getUTCMonth());
  // A leaver whose end date precedes their start date is a data entry error,
  // not somebody who worked negative time. Zero says "we do not know" without
  // pretending.
  return Math.max(0, months);
}

/** "3 years 2 months", "7 months", "Less than a month". */
export function describeTenure(months: number | null): string {
  if (months === null) return "Start date not recorded";
  if (months === 0) return "Less than a month";

  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} ${years === 1 ? "year" : "years"}`);
  if (rest > 0) parts.push(`${rest} ${rest === 1 ? "month" : "months"}`);
  return parts.join(" ");
}

export interface TurnoverRow extends Leaver {
  serial: number;
  tenureMonths: number | null;
  tenureLabel: string;
}

export interface SectionGroup {
  section: string;
  rows: TurnoverRow[];
  /** What this section's departures were costing, per month. */
  monthlyCents: number;
}

export interface TurnoverReport {
  groups: SectionGroup[];
  total: number;
  /** Combined monthly salary of everyone who left — the replacement bill. */
  monthlyCents: number;
  /** Leavers whose last pay is unknown, so the figure above understates. */
  withoutSalary: number;
  averageTenureMonths: number | null;
}

/** Staff with no section recorded still have to appear somewhere. */
export const UNSECTIONED = "Not recorded";

/**
 * Most recent departure first within each section.
 *
 * Recency is what a head teacher is looking for — last month's resignations
 * are the vacancies still open.
 */
function newestFirst(a: Leaver, b: Leaver): number {
  return b.endDate.getTime() - a.endDate.getTime() || a.name.localeCompare(b.name);
}

export function buildTurnover(leavers: Leaver[]): TurnoverReport {
  const bySection = new Map<string, Leaver[]>();
  for (const leaver of leavers) {
    const key = leaver.section?.trim() || UNSECTIONED;
    bySection.set(key, [...(bySection.get(key) ?? []), leaver]);
  }

  let serial = 0;
  const groups: SectionGroup[] = [...bySection.entries()]
    .sort(([a], [b]) => {
      // Unsectioned last: it is a gap in the records rather than a part of
      // the school, and sorting it alphabetically would bury a real section.
      if (a === UNSECTIONED) return 1;
      if (b === UNSECTIONED) return -1;
      return a.localeCompare(b);
    })
    .map(([section, list]) => {
      const rows = [...list].sort(newestFirst).map((leaver) => {
        serial += 1;
        const months = tenureMonths(leaver.startDate, leaver.endDate);
        return { ...leaver, serial, tenureMonths: months, tenureLabel: describeTenure(months) };
      });
      return {
        section,
        rows,
        monthlyCents: rows.reduce((total, row) => total + (row.lastMonthlyCents ?? 0), 0),
      };
    });

  const known = leavers
    .map((leaver) => tenureMonths(leaver.startDate, leaver.endDate))
    .filter((months): months is number => months !== null);

  return {
    groups,
    total: leavers.length,
    monthlyCents: groups.reduce((total, group) => total + group.monthlyCents, 0),
    withoutSalary: leavers.filter((leaver) => leaver.lastMonthlyCents === null).length,
    averageTenureMonths:
      known.length > 0 ? Math.round(known.reduce((a, b) => a + b, 0) / known.length) : null,
  };
}

/**
 * Whether somebody counts as having left by a given date.
 *
 * An end date in the future is a resignation already handed in — the person
 * is still working. Counting them as gone would show a vacancy that is not
 * open yet and a salary the school is still paying.
 */
export function hasLeft(endDate: Date | null, asAt: Date): boolean {
  return endDate !== null && endDate.getTime() <= asAt.getTime();
}
