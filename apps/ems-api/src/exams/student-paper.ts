/**
 * The paper as a student sees it.
 *
 * This is the leak-critical function of the phase. Every route that puts an
 * exam question in front of a student goes through it — starting a paper,
 * resuming one, reviewing a released result — so there is exactly one place
 * that decides what a student may see, and one place to test.
 *
 * It **rebuilds** each question from named fields rather than deleting the
 * answer from the stored object. A `delete` would mutate a Prisma row a
 * staff-facing caller might still be holding, and, worse, a field added to
 * the model later would be copied straight through to the student by a
 * spread that nobody remembered to update. Naming what goes out means a new
 * field is invisible until somebody decides it should not be — the safe
 * direction to fail in.
 */

import { seededOrder } from "./exam-window";

export interface StoredExamQuestion {
  id: string;
  orderIndex: number;
  type: string;
  prompt: string;
  options: unknown;
  answer: unknown;
  marksHundredths: number;
}

export interface StudentExamQuestion {
  id: string;
  type: string;
  prompt: string;
  options: { key: string; text: string }[];
  marksHundredths: number;
}

/**
 * Options with anything that isn't a `{ key, text }` pair dropped.
 *
 * Returning `[]` for unrecognisable data is failing closed: a question with
 * no options renders as unanswerable and someone reports it, whereas passing
 * an unparsed object through could carry the key inside it.
 */
export function studentOptions(options: unknown): { key: string; text: string }[] {
  if (!Array.isArray(options)) return [];
  return options
    .filter(
      (option): option is { key: unknown; text: unknown } =>
        typeof option === "object" && option !== null && "key" in option && "text" in option,
    )
    .map((option) => ({ key: String(option.key), text: String(option.text) }));
}

/** One question, with the answer key gone. */
export function toStudentQuestion(question: StoredExamQuestion): StudentExamQuestion {
  return {
    id: question.id,
    type: question.type,
    prompt: question.prompt,
    options: studentOptions(question.options),
    marksHundredths: question.marksHundredths,
  };
}

/**
 * The whole paper for one attempt, in this student's own order.
 *
 * Shuffling is per-attempt and reproducible from the stored seed, so a
 * refresh shows the same paper while a neighbour's differs. Answers are
 * keyed by question id rather than position, so an order that did somehow
 * differ between two requests could still never misfile an answer.
 */
export function toStudentPaper(
  questions: readonly StoredExamQuestion[],
  options: { shuffle: boolean; seed: number },
): StudentExamQuestion[] {
  const inOrder = [...questions].sort((a, b) => a.orderIndex - b.orderIndex);
  if (!options.shuffle) return inOrder.map(toStudentQuestion);

  return seededOrder(inOrder.length, options.seed).map((index) => toStudentQuestion(inOrder[index]));
}
