/**
 * Marking an exam answer.
 *
 * The whole phase turns on this file: a mark awarded here goes on a report
 * card and follows a child around. So it is pure, it is tested to death, and
 * every rule it applies is one a teacher could defend to a parent.
 *
 * The governing principle is **the machine never guesses**. Where the answer
 * is unambiguous — a chosen option, a short answer matching one the teacher
 * wrote down — it marks. Everywhere else it awards nothing *and says so*, by
 * returning `needsReview`, so a person looks at it before the paper is
 * finished. A zero that nobody reviews is indistinguishable from a zero the
 * student earned, and that is the failure mode worth engineering against.
 */

export type QuestionType =
  | "SINGLE_CHOICE"
  | "MULTI_CHOICE"
  | "TRUE_FALSE"
  | "SHORT_ANSWER"
  | "ESSAY";

export interface MarkableQuestion {
  type: QuestionType;
  /** Correct option keys, or accepted texts for SHORT_ANSWER. Empty for ESSAY. */
  answer: string[];
  marksHundredths: number;
}

export interface MarkedAnswer {
  /** Hundredths awarded. Null only when a human still has to decide. */
  awardedHundredths: number | null;
  /** False when a person must mark it — the caller must not treat it as final. */
  autoMarked: boolean;
  needsReview: boolean;
}

/**
 * Normalises a written answer before comparing it.
 *
 * Case, surrounding space and repeated inner space are noise: a child who
 * writes "  Photosynthesis " has not got it wrong. Nothing beyond that is
 * touched — no stemming, no fuzzy distance, no stripping of punctuation.
 * Every one of those would eventually mark a wrong answer right, and marking
 * a wrong answer right is worse than sending a right one to a teacher.
 */
export function normaliseText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Option keys as a comparable set — order and case never matter. */
function keySet(values: readonly string[]): Set<string> {
  return new Set(values.map((value) => value.trim().toUpperCase()).filter((value) => value.length > 0));
}

function sameKeys(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

const UNANSWERED: MarkedAnswer = { awardedHundredths: 0, autoMarked: true, needsReview: false };
const FOR_A_HUMAN: MarkedAnswer = { awardedHundredths: null, autoMarked: false, needsReview: true };

/**
 * Marks one answer.
 *
 * `response` is always an array, whatever the type: chosen keys for the
 * choice types, a single string for the written ones. One shape means the
 * caller has no special cases and cannot pass the wrong one for the type.
 */
export function markAnswer(question: MarkableQuestion, response: readonly string[]): MarkedAnswer {
  // An essay is never machine-marked, not even an empty one — "they wrote
  // nothing" is still a judgement a teacher makes, sometimes generously.
  if (question.type === "ESSAY") return FOR_A_HUMAN;

  const given = response.filter((value) => typeof value === "string" && value.trim().length > 0);
  // Blank is zero and needs nobody: there is nothing for a teacher to weigh.
  if (given.length === 0) return UNANSWERED;

  const full = question.marksHundredths;

  if (question.type === "SHORT_ANSWER") {
    // A teacher who wrote no accepted answers has, in effect, asked for this
    // to be marked by hand. Awarding zero would be inventing a policy.
    if (question.answer.length === 0) return FOR_A_HUMAN;

    const accepted = new Set(question.answer.map(normaliseText));
    if (accepted.has(normaliseText(given[0]))) {
      return { awardedHundredths: full, autoMarked: true, needsReview: false };
    }
    // Wrong by exact comparison — but "5cm" against an accepted "5 cm", or a
    // right answer spelt a way the teacher didn't list, both land here. Zero
    // is recorded so the total is honest, and it is flagged so somebody
    // confirms it rather than it quietly standing.
    return { awardedHundredths: 0, autoMarked: true, needsReview: true };
  }

  const correct = keySet(question.answer);
  // Same reasoning as an empty short-answer key: no key, no automatic mark.
  if (correct.size === 0) return FOR_A_HUMAN;

  const chosen = keySet(given);

  if (question.type === "SINGLE_CHOICE" || question.type === "TRUE_FALSE") {
    // More than one selection on a single-answer question is a client bug or
    // someone poking the API. Refusing to mark it beats picking one of them.
    if (chosen.size !== 1) return FOR_A_HUMAN;
    const right = correct.has([...chosen][0]);
    return { awardedHundredths: right ? full : 0, autoMarked: true, needsReview: false };
  }

  // MULTI_CHOICE is all-or-nothing.
  //
  // Partial credit needs a policy the teacher chose — how much for three of
  // four, what a wrong tick costs — and inventing one here would silently
  // apply it to every school using the product. All-or-nothing is the rule
  // most "select all that apply" papers already use, and it is the one a
  // student can be told in a sentence.
  return { awardedHundredths: sameKeys(chosen, correct) ? full : 0, autoMarked: true, needsReview: false };
}

export interface AttemptTally {
  /** Total from questions the machine marked. */
  autoScoreHundredths: number;
  /** Total from questions a person marked. */
  manualScoreHundredths: number;
  totalScoreHundredths: number;
  /** True while any answer is still waiting on a human. */
  needsReview: boolean;
}

export interface TalliedAnswer {
  awardedHundredths: number | null;
  autoMarked: boolean;
  needsReview: boolean;
}

/**
 * Adds up a whole attempt.
 *
 * An unmarked answer contributes nothing to the total *and* keeps
 * `needsReview` true, so a paper cannot be released with an essay nobody has
 * read. The two subtotals are kept apart because "the computer gave 14, the
 * teacher gave 6" is the answer to the first question anyone asks about an
 * auto-marked paper.
 */
export function tallyAttempt(answers: readonly TalliedAnswer[]): AttemptTally {
  let auto = 0;
  let manual = 0;
  let needsReview = false;

  for (const answer of answers) {
    if (answer.awardedHundredths === null) {
      needsReview = true;
      continue;
    }
    if (answer.needsReview) needsReview = true;
    if (answer.autoMarked) auto += answer.awardedHundredths;
    else manual += answer.awardedHundredths;
  }

  return {
    autoScoreHundredths: auto,
    manualScoreHundredths: manual,
    totalScoreHundredths: auto + manual,
    needsReview,
  };
}

/** What the paper is out of. Unanswered questions still count towards it. */
export function paperTotalHundredths(questions: readonly { marksHundredths: number }[]): number {
  return questions.reduce((sum, question) => sum + question.marksHundredths, 0);
}

/**
 * Scales a raw exam score onto a gradebook assessment's own total.
 *
 * Same rule as homework's write-through: 30/40 on the paper is 15/20 in a
 * gradebook out of 20, not 30 — which would be off the top of the scale.
 */
export function scaleToAssessment(
  scoreHundredths: number,
  paperTotal: number,
  assessmentMaxHundredths: number,
): number {
  if (paperTotal <= 0) return 0;
  return Math.round((scoreHundredths / paperTotal) * assessmentMaxHundredths);
}
