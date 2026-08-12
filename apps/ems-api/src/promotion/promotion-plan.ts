/**
 * Moving a whole school up a year.
 *
 * This is the operation a school performs once annually, under time pressure,
 * on every child at once — and the one where a mistake is hardest to see and
 * worst to live with. So it is planned before it is applied: the office reads
 * a list of exactly what will happen to every named child, and only then
 * commits.
 *
 * Two properties matter more than anything else here:
 *
 *   1. Running it twice must change nothing the second time. Somebody WILL
 *      click it twice — the page is slow, the tab is stale, two secretaries
 *      do it on the same afternoon. A child enrolled in two classes at once
 *      corrupts attendance, results and fees simultaneously.
 *
 *   2. A child with nowhere to go must be reported, never guessed at. Silently
 *      leaving a class unmapped would strand a whole cohort with no enrolment,
 *      and nobody would notice until a teacher found an empty register.
 *
 * Pure, so both can be proven in tests rather than discovered in September.
 */

export type PromotionOutcome =
  | "PROMOTE"
  | "REPEAT"
  | "GRADUATE"
  | "ALREADY_DONE"
  | "NO_TARGET_CLASS"
  | "CANNOT_REPEAT";

export interface PromotionStudent {
  studentProfileId: string;
  studentName: string;
  enrollmentId: string;
  fromClassId: string;
  fromClassName: string;
}

/** What the office chose for one source class. */
export interface ClassMapping {
  /** Where this class's children go next year. Null means they are leaving. */
  promoteToClassId: string | null;
  promoteToClassName: string | null;
  /** Next year's equivalent of this same class, for anyone repeating. */
  repeatClassId: string | null;
  repeatClassName: string | null;
  /** The whole class is finishing school rather than moving up. */
  graduating: boolean;
}

export interface PromotionInput {
  students: PromotionStudent[];
  /** Keyed by source class id. A class absent from this map is unconfigured. */
  mappings: Record<string, ClassMapping>;
  /** Per-child departures from the class decision, keyed by student profile. */
  overrides: Record<string, "PROMOTE" | "REPEAT" | "GRADUATE">;
  /**
   * Students who already hold an enrolment in the destination academic year.
   *
   * This is the idempotency key, and it is deliberately derived from the
   * database rather than from a "promotion already ran" flag: a flag can be
   * wrong, whereas a child who is already in next year's class is a fact.
   */
  alreadyEnrolledNextYear: ReadonlySet<string>;
}

export interface PromotionDecision {
  studentProfileId: string;
  studentName: string;
  enrollmentId: string;
  fromClassId: string;
  fromClassName: string;
  outcome: PromotionOutcome;
  /** Where they will be enrolled. Null for graduates and for problems. */
  toClassId: string | null;
  toClassName: string | null;
  /** Plain words for the office, not an error code. */
  reason: string;
}

export function planPromotion(input: PromotionInput): PromotionDecision[] {
  return input.students.map((student) => {
    const base = {
      studentProfileId: student.studentProfileId,
      studentName: student.studentName,
      enrollmentId: student.enrollmentId,
      fromClassId: student.fromClassId,
      fromClassName: student.fromClassName,
    };

    // Checked before anything else. A child already in next year's class has
    // been promoted, whatever the mapping now says, and touching them again
    // is the one outcome with no safe recovery.
    if (input.alreadyEnrolledNextYear.has(student.studentProfileId)) {
      return {
        ...base,
        outcome: "ALREADY_DONE" as const,
        toClassId: null,
        toClassName: null,
        reason: "Already enrolled for next year — will be left alone",
      };
    }

    const mapping = input.mappings[student.fromClassId];
    if (!mapping) {
      return {
        ...base,
        outcome: "NO_TARGET_CLASS" as const,
        toClassId: null,
        toClassName: null,
        reason: `No destination chosen for ${student.fromClassName}`,
      };
    }

    const choice = input.overrides[student.studentProfileId] ?? (mapping.graduating ? "GRADUATE" : "PROMOTE");

    if (choice === "GRADUATE") {
      return {
        ...base,
        outcome: "GRADUATE" as const,
        toClassId: null,
        toClassName: null,
        reason: "Leaving the school",
      };
    }

    if (choice === "REPEAT") {
      if (!mapping.repeatClassId) {
        return {
          ...base,
          outcome: "CANNOT_REPEAT" as const,
          toClassId: null,
          toClassName: null,
          reason: `No ${student.fromClassName} exists next year to repeat in`,
        };
      }
      return {
        ...base,
        outcome: "REPEAT" as const,
        toClassId: mapping.repeatClassId,
        toClassName: mapping.repeatClassName,
        reason: `Repeating ${mapping.repeatClassName}`,
      };
    }

    if (!mapping.promoteToClassId) {
      return {
        ...base,
        outcome: "NO_TARGET_CLASS" as const,
        toClassId: null,
        toClassName: null,
        reason: `No destination chosen for ${student.fromClassName}`,
      };
    }

    return {
      ...base,
      outcome: "PROMOTE" as const,
      toClassId: mapping.promoteToClassId,
      toClassName: mapping.promoteToClassName,
      reason: `Moving to ${mapping.promoteToClassName}`,
    };
  });
}

export interface PromotionSummary {
  promote: number;
  repeat: number;
  graduate: number;
  alreadyDone: number;
  problems: number;
  total: number;
}

export function summarise(decisions: PromotionDecision[]): PromotionSummary {
  const count = (outcome: PromotionOutcome) => decisions.filter((d) => d.outcome === outcome).length;
  return {
    promote: count("PROMOTE"),
    repeat: count("REPEAT"),
    graduate: count("GRADUATE"),
    alreadyDone: count("ALREADY_DONE"),
    problems: count("NO_TARGET_CLASS") + count("CANNOT_REPEAT"),
    total: decisions.length,
  };
}

/** Only these change anything; the rest are reports, not instructions. */
export function actionable(decisions: PromotionDecision[]): PromotionDecision[] {
  return decisions.filter(
    (d) => d.outcome === "PROMOTE" || d.outcome === "REPEAT" || d.outcome === "GRADUATE",
  );
}

/**
 * Whether the office should be stopped before committing.
 *
 * A blocked child is not a warning to be scrolled past: their class has no
 * destination, and running anyway leaves them enrolled nowhere while everyone
 * around them moves on. Better to refuse and make somebody choose.
 */
export function blockers(decisions: PromotionDecision[]): PromotionDecision[] {
  return decisions.filter((d) => d.outcome === "NO_TARGET_CLASS" || d.outcome === "CANNOT_REPEAT");
}
