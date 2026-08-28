export type AppraisalStatus = "DRAFT" | "SHARED" | "ACKNOWLEDGED";

export interface Actor {
  isAdmin: boolean;
  /** The person who wrote it. */
  isReviewer: boolean;
  /** The person it is about. */
  isSubject: boolean;
}

export interface RatingLike {
  area: string;
  /** 1 to 5. */
  score: number;
}

/**
 * Whether an appraisal may move from one state to another, and why not.
 *
 * Two rules carry this module.
 *
 * Nobody appraises themselves — checked when the appraisal is created rather
 * than here, because it is a fact about the row and not about a transition.
 *
 * And **only the person being appraised can acknowledge it.** Not their
 * reviewer, not an administrator, not "on their behalf". An acknowledgement
 * is a statement that somebody has seen what was written about them, and one
 * entered by anybody else is a record of a conversation that may never have
 * happened — which is exactly what it would later be produced as evidence of.
 */
export function checkTransition(from: AppraisalStatus, to: AppraisalStatus, actor: Actor): string | null {
  if (from === to) return "This appraisal is already in that state";

  switch (to) {
    case "SHARED":
      if (from !== "DRAFT") return "Only a draft can be shared";
      if (!actor.isReviewer && !actor.isAdmin) return "Only the reviewer can share this appraisal";
      return null;

    case "ACKNOWLEDGED":
      if (from !== "SHARED") return "This has to be shared before it can be acknowledged";
      // The rule this module exists for.
      if (!actor.isSubject) {
        return "Only the person being appraised can acknowledge it";
      }
      return null;

    case "DRAFT":
      if (from !== "SHARED") return "Only a shared appraisal can be taken back to draft";
      if (!actor.isReviewer && !actor.isAdmin) return "Only the reviewer can take this back to draft";
      return null;

    default:
      return "That is not a state an appraisal can be in";
  }
}

/** The moves this person can make, derived from the rule that decides. */
export function availableTransitions(from: AppraisalStatus, actor: Actor): AppraisalStatus[] {
  const all: AppraisalStatus[] = ["DRAFT", "SHARED", "ACKNOWLEDGED"];
  return all.filter((to) => checkTransition(from, to, actor) === null);
}

/**
 * Why an appraisal cannot be written, or null.
 *
 * The subject and the reviewer being the same person is refused here and by
 * a CHECK in the database. An appraisal somebody wrote about themselves is
 * not a lenient appraisal, it is not an appraisal — and it is the kind of row
 * that only turns up years later when somebody is looking for a reason.
 */
export function appraisalProblem(input: {
  subjectUserId: string;
  reviewerUserId: string;
  periodLabel: string;
}): string | null {
  if (!input.periodLabel.trim()) return "Say which period this covers";
  if (input.subjectUserId === input.reviewerUserId) {
    return "Somebody cannot write their own appraisal";
  }
  return null;
}

/**
 * Why these ratings cannot be saved, or null.
 *
 * A partly-rated appraisal is fine — a reviewer filling it in over a week is
 * the ordinary case. What is refused is a score outside the scale, and two
 * ratings for the same area, which would make the average depend on which
 * one happened to be read last.
 */
export function validateRatings(ratings: RatingLike[]): string | null {
  const seen = new Set<string>();
  for (const rating of ratings) {
    const area = rating.area.trim();
    if (!area) return "Every rating needs an area";
    const key = area.toLowerCase();
    if (seen.has(key)) return `There are two ratings for "${area}"`;
    seen.add(key);

    if (!Number.isInteger(rating.score)) return `"${area}" needs a whole score`;
    if (rating.score < 1 || rating.score > 5) return `"${area}" must be scored from 1 to 5`;
  }
  return null;
}

/**
 * The overall score, or null when nothing has been rated.
 *
 * Null rather than zero, and rather than a default of 3. Zero is off the
 * scale entirely and would read as the worst possible appraisal; a middling
 * default would put a rating on somebody that no reviewer gave them. An
 * unrated appraisal has no overall score, and the screen says so.
 *
 * Rounded to one decimal: an average of 3.6666 presented as 3.7 is honest,
 * and presented as 4 is a promotion nobody awarded.
 */
export function overallScore(ratings: RatingLike[]): number | null {
  if (ratings.length === 0) return null;
  const total = ratings.reduce((sum, rating) => sum + rating.score, 0);
  return Math.round((total / ratings.length) * 10) / 10;
}

/** Whether the person being appraised is allowed to see it yet. */
export function isVisibleToSubject(status: AppraisalStatus): boolean {
  return status !== "DRAFT";
}
