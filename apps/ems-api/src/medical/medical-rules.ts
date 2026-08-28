export type MedicalKind = "ALLERGY" | "CONDITION" | "MEDICATION" | "NOTE";
export type Severity = "LIFE_THREATENING" | "SIGNIFICANT" | "MINOR";

export interface MedicalEntryLike {
  kind: MedicalKind;
  severity: Severity | null;
  title: string;
  archivedAt: Date | null;
}

/**
 * Health information about a child.
 *
 * The single most sensitive thing this system holds, and the rules here are
 * about who sees it and what gets shown first — not about clinical judgement,
 * which is not this software's business and is not attempted.
 *
 * None of this is ever sent to the AI provider. That is enforced where the
 * tutor prompt is built, not here, but it is the reason there is no
 * "summarise this child's health" anything in this module.
 */

const SEVERITY_ORDER: Record<Severity, number> = {
  LIFE_THREATENING: 0,
  SIGNIFICANT: 1,
  MINOR: 2,
};

const KIND_ORDER: Record<MedicalKind, number> = {
  ALLERGY: 0,
  CONDITION: 1,
  MEDICATION: 2,
  NOTE: 3,
};

/**
 * Entries in the order somebody needs them in an emergency.
 *
 * Life-threatening first, always, whatever kind it is. Somebody reaching for
 * this record is usually doing so quickly, and an anaphylactic allergy sorted
 * below a note about travel sickness because the note was added later is the
 * failure this ordering exists to prevent.
 *
 * Archived entries sink to the bottom rather than disappearing: a condition a
 * child has grown out of is still part of their history, and deleting it
 * would leave the next person to read the record unable to tell the
 * difference between "resolved" and "never happened".
 */
export function forEmergency<T extends MedicalEntryLike>(entries: T[]): T[] {
  return [...entries].sort((a, b) => {
    if (Boolean(a.archivedAt) !== Boolean(b.archivedAt)) return a.archivedAt ? 1 : -1;

    const aSeverity = a.severity ? SEVERITY_ORDER[a.severity] : 3;
    const bSeverity = b.severity ? SEVERITY_ORDER[b.severity] : 3;
    if (aSeverity !== bSeverity) return aSeverity - bSeverity;

    if (KIND_ORDER[a.kind] !== KIND_ORDER[b.kind]) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    return a.title.localeCompare(b.title);
  });
}

/**
 * The entries somebody must be told about before taking a child anywhere.
 *
 * Only live, life-threatening ones. A short list that is always read beats a
 * complete list that is skimmed — and the moment this includes minor notes is
 * the moment a teacher stops reading it before a school trip.
 */
export function criticalOnly<T extends MedicalEntryLike>(entries: T[]): T[] {
  return forEmergency(entries).filter(
    (entry) => entry.archivedAt === null && entry.severity === "LIFE_THREATENING",
  );
}

/** Why this entry cannot be recorded, or null. */
export function validateEntry(input: {
  kind: MedicalKind;
  severity: Severity | null;
  title: string;
}): string | null {
  if (!input.title.trim()) return "Say what it is";

  // An allergy or condition without a severity is the one somebody most needs
  // to know the severity of, so it is asked for rather than defaulted. A
  // default of "minor" would be a clinical claim this software has no basis
  // for making.
  if ((input.kind === "ALLERGY" || input.kind === "CONDITION") && input.severity === null) {
    return "Say how serious it is — nobody can judge that from the name alone";
  }

  // A plain note carries no severity: giving one a rating would turn a
  // sentence like "dislikes swimming" into a medical grading.
  if (input.kind === "NOTE" && input.severity !== null) {
    return "A note does not carry a severity";
  }

  return null;
}

export interface MedicalSummary {
  critical: number;
  allergies: number;
  conditions: number;
  medications: number;
  archived: number;
  /** True when there is nothing at all — different from nothing serious. */
  empty: boolean;
}

/**
 * What a record contains, as counts.
 *
 * `empty` is distinguished from "nothing serious" deliberately. A child with
 * no medical record at all and a child assessed as having nothing of concern
 * are different, and a screen that showed both as a reassuring green tick
 * would be inventing the second one.
 */
export function summarise(entries: MedicalEntryLike[]): MedicalSummary {
  const live = entries.filter((entry) => entry.archivedAt === null);

  return {
    critical: live.filter((entry) => entry.severity === "LIFE_THREATENING").length,
    allergies: live.filter((entry) => entry.kind === "ALLERGY").length,
    conditions: live.filter((entry) => entry.kind === "CONDITION").length,
    medications: live.filter((entry) => entry.kind === "MEDICATION").length,
    archived: entries.length - live.length,
    empty: entries.length === 0,
  };
}
