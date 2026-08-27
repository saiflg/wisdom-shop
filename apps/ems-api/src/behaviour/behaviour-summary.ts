export type BehaviourKind = "MERIT" | "CONCERN";

export interface BehaviourRecordLike {
  kind: BehaviourKind;
  points: number;
  category: string;
  occurredAt: Date | string;
}

export interface BehaviourSummary {
  merits: number;
  concerns: number;
  meritPoints: number;
  concernPoints: number;
  /** Merit points less concern points. Can be negative; that is the point. */
  netPoints: number;
  /** The categories that came up most, commonest first. */
  topCategories: { category: string; count: number }[];
}

/**
 * What a set of behaviour records adds up to for one child.
 *
 * Counts and points are kept apart on purpose. Ten merits worth one point
 * each and one merit worth ten are the same number of points and a very
 * different term, and a summary that collapsed them would hide which one
 * happened.
 *
 * There is deliberately no function here that ranks children against each
 * other. This data would make a "best and worst behaved" list trivial to
 * produce, and producing it is how a record meant to help a child becomes
 * something used against them.
 */
export function summariseBehaviour(records: BehaviourRecordLike[]): BehaviourSummary {
  let merits = 0;
  let concerns = 0;
  let meritPoints = 0;
  let concernPoints = 0;
  const categories = new Map<string, number>();

  for (const record of records) {
    // Points are stored non-negative and the kind carries the direction, but
    // a stray negative arriving from anywhere must not quietly turn a concern
    // into a credit, so it is clamped rather than trusted.
    const points = Math.max(0, record.points);

    if (record.kind === "MERIT") {
      merits += 1;
      meritPoints += points;
    } else {
      concerns += 1;
      concernPoints += points;
    }

    const key = record.category.trim();
    if (key) categories.set(key, (categories.get(key) ?? 0) + 1);
  }

  const topCategories = [...categories.entries()]
    .map(([category, count]) => ({ category, count }))
    // Ties broken by name so the same records always produce the same order;
    // a summary that reshuffles between page loads reads as data changing.
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category))
    .slice(0, 5);

  return {
    merits,
    concerns,
    meritPoints,
    concernPoints,
    netPoints: meritPoints - concernPoints,
    topCategories,
  };
}

/**
 * Why these points cannot be recorded, or null when they can.
 *
 * The ceiling is low on purpose. Points here are a nudge, not a currency, and
 * a single record worth five hundred is a typo every time.
 */
export function validatePoints(points: number): string | null {
  if (!Number.isInteger(points)) return "Points must be a whole number";
  if (points < 0) return "Points cannot be negative — the kind decides which way they count";
  if (points > 100) return "That is more points than a single record should carry";
  return null;
}
