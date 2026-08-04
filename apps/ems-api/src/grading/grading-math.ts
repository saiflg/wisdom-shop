import type { MarkStatus } from "ems-tenant-client";

/**
 * Grading arithmetic.
 *
 * Scores are integers in hundredths (1750 is 17.50) and percentages are
 * integers in hundredths of a percent (8567 is 85.67%), for the same reason
 * money is held in minor units: teachers award half and quarter marks, and a
 * term average assembled out of floats drifts. A report card is a document a
 * family keeps, so the number on it has to be reproducible exactly.
 *
 * Every function here is pure. The rules that decide a child's grade should
 * be readable and testable without a database in the way.
 */

export interface BandInput {
  label: string;
  minPercent: number;
  maxPercent: number;
  remark?: string | null;
  gradePoint?: number | null;
}

export interface MarkInput {
  weightPercent: number;
  maxScoreHundredths: number;
  scoreHundredths: number | null;
  status: MarkStatus;
}

export interface SubjectScore {
  /** Hundredths of a percent. Null when every assessment was excused. */
  percentHundredths: number | null;
  /** Weight actually counted, after excusals are removed. */
  countedWeight: number;
}

/**
 * Checks that a scale's bands tile 0–100 exactly: no gap, no overlap.
 *
 * A gap is the dangerous one. Bands of 70–100, 60–69 and 0–59 are fine, but
 * 70–100, 61–69, 0–59 leaves 60 with no grade at all, and a report card with
 * a blank where a grade should be is discovered by a parent, not by us.
 * Returns a human-readable problem or null when the scale is sound.
 */
export function validateBands(bands: BandInput[]): string | null {
  if (bands.length === 0) return "A grade scale needs at least one band";

  for (const band of bands) {
    if (!Number.isInteger(band.minPercent) || !Number.isInteger(band.maxPercent)) {
      return `Band "${band.label}" needs whole percentage boundaries`;
    }
    if (band.minPercent < 0 || band.maxPercent > 100) {
      return `Band "${band.label}" falls outside 0–100`;
    }
    if (band.minPercent > band.maxPercent) {
      return `Band "${band.label}" starts above where it ends`;
    }
  }

  const sorted = [...bands].sort((a, b) => a.minPercent - b.minPercent);
  const first = sorted[0] as BandInput;
  if (first.minPercent !== 0) return "The lowest band must start at 0";

  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1] as BandInput;
    const current = sorted[i] as BandInput;
    if (current.minPercent <= previous.maxPercent) {
      return `Bands "${previous.label}" and "${current.label}" overlap`;
    }
    if (current.minPercent !== previous.maxPercent + 1) {
      return `Nothing covers ${previous.maxPercent + 1}–${current.minPercent - 1} percent`;
    }
  }

  const last = sorted[sorted.length - 1] as BandInput;
  if (last.maxPercent !== 100) return "The highest band must reach 100";

  return null;
}

/**
 * The band a percentage falls into.
 *
 * Takes hundredths of a percent and compares on whole points, rounding half
 * up — 69.5% becomes 70 and earns the higher grade. Rounding down at a
 * boundary is the kind of silent decision that costs a student a grade, so
 * it is stated here rather than left to whatever the caller happens to do.
 */
export function findBand(percentHundredths: number, bands: BandInput[]): BandInput | null {
  const whole = Math.round(percentHundredths / 100);
  return bands.find((band) => whole >= band.minPercent && whole <= band.maxPercent) ?? null;
}

/**
 * Checks that a subject's assessments carry exactly 100% of weight between
 * them. 90% would quietly deflate every student in the class, and 110% would
 * inflate them; either is invisible on an individual report card.
 */
export function validateWeights(weights: number[]): string | null {
  if (weights.length === 0) return "That subject has no assessments for this term";
  for (const weight of weights) {
    if (!Number.isInteger(weight) || weight <= 0) return "Every assessment needs a whole weight above zero";
  }
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total !== 100) return `The assessment weights add up to ${total}%, not 100%`;
  return null;
}

/**
 * A student's percentage for one subject.
 *
 * The two statuses that are not a score behave differently on purpose:
 *
 * - ABSENT counts as zero. The student was assessed and did not score.
 * - EXCUSED is removed, and the remaining weights are renormalised so the
 *   student is judged only on what they actually sat.
 *
 * Treating them the same would either punish a child with a documented
 * medical absence or hand a free pass to one who skipped, which is exactly
 * the sort of thing nobody notices until a parent asks.
 *
 * Every assessment excused returns null, not 0 — "no basis to judge" is not
 * the same as "scored nothing", the same distinction attendance draws
 * between a 0% rate and no data at all.
 */
export function computeSubjectScore(marks: MarkInput[]): SubjectScore {
  let weightedTotal = 0;
  let countedWeight = 0;

  for (const mark of marks) {
    if (mark.status === "EXCUSED") continue;

    countedWeight += mark.weightPercent;

    if (mark.status === "ABSENT" || mark.scoreHundredths === null) continue;
    if (mark.maxScoreHundredths <= 0) continue;

    // Scaled in hundredths of a percent throughout; the single division is
    // deferred to the end so intermediate steps stay integral.
    weightedTotal += (mark.scoreHundredths * mark.weightPercent * 10000) / mark.maxScoreHundredths;
  }

  if (countedWeight === 0) return { percentHundredths: null, countedWeight: 0 };

  return { percentHundredths: Math.round(weightedTotal / countedWeight), countedWeight };
}

/**
 * The overall percentage across subjects — a plain mean of subject
 * percentages, so every subject counts equally.
 *
 * Subjects with no basis (all excused) are left out rather than counted as
 * zero. A student with nothing to judge at all gets null, which the report
 * card renders as "—".
 */
export function computeOverallPercent(subjectPercents: (number | null)[]): number | null {
  const scored = subjectPercents.filter((percent): percent is number => percent !== null);
  if (scored.length === 0) return null;
  return Math.round(scored.reduce((sum, percent) => sum + percent, 0) / scored.length);
}

/** Display helper — hundredths of a percent to a human string. */
export function formatPercent(percentHundredths: number | null): string {
  if (percentHundredths === null) return "—";
  const whole = Math.trunc(percentHundredths / 100);
  const fraction = Math.abs(percentHundredths % 100);
  return `${whole}.${String(fraction).padStart(2, "0")}%`;
}

/** Display helper — hundredths of a mark to a human string. */
export function formatScore(scoreHundredths: number | null): string {
  if (scoreHundredths === null) return "—";
  const whole = Math.trunc(scoreHundredths / 100);
  const fraction = Math.abs(scoreHundredths % 100);
  return fraction === 0 ? String(whole) : `${whole}.${String(fraction).padStart(2, "0")}`;
}
