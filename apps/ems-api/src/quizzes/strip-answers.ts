/**
 * Removes the answer key from quiz content before it reaches a STUDENT or
 * GUARDIAN. This is the one piece of the curriculum engine where getting it
 * wrong is a real correctness bug rather than a cosmetic one, so it lives as
 * a pure function with its own tests instead of inline `delete` calls in the
 * service.
 *
 * Deliberately rebuilds each question rather than mutating or `delete`-ing:
 * the input is a Prisma `Json` value that may be shared, and a mutating
 * version would corrupt the object a staff-facing caller is holding.
 * Anything that isn't a recognisable question list is returned as an empty
 * question set — failing closed, since the alternative on malformed data is
 * leaking a field we couldn't parse.
 */

export interface QuizQuestion {
  questionNumber: number;
  prompt: string;
  type: string;
  options: string[];
  correctAnswer: string;
  marks: number;
}

export interface QuizContent {
  questions: QuizQuestion[];
}

/** A question as a student sees it — same shape minus `correctAnswer`. */
export type StudentQuizQuestion = Omit<QuizQuestion, "correctAnswer">;

export interface StudentQuizContent {
  questions: StudentQuizQuestion[];
}

export function stripAnswers(content: unknown): StudentQuizContent {
  const questions = (content as QuizContent | null)?.questions;
  if (!Array.isArray(questions)) return { questions: [] };

  return {
    questions: questions.map((question) => {
      // Destructuring the answer out is what does the work here; naming it
      // with a void reference keeps lint happy without an eslint-disable.
      const { correctAnswer, ...rest } = question ?? ({} as QuizQuestion);
      void correctAnswer;
      return rest as StudentQuizQuestion;
    }),
  };
}
