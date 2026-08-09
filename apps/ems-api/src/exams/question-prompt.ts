/**
 * Asking a model for exam questions, and refusing to believe the answer.
 *
 * A generated question carries an answer key, and an answer key that is
 * wrong marks a whole class wrong — silently, and in a way that reaches a
 * report card. So generated questions land in the bank for a teacher to read
 * and are never placed on a paper automatically, and `normaliseGenerated`
 * below throws away anything it cannot verify is internally consistent
 * rather than storing a question whose key points at an option that isn't
 * there.
 */

import type { CurriculumSettings, Subject } from "ems-tenant-client";

export const GENERATED_QUESTION_TYPES = ["SINGLE_CHOICE", "MULTI_CHOICE", "SHORT_ANSWER"] as const;

/**
 * OpenAPI 3.0 subset per the provider's structured-output constraints (no
 * $ref/oneOf), and `propertyOrdering` to pin field order — same shape as
 * QUIZ_RESPONSE_SCHEMA.
 *
 * ESSAY is deliberately not offered: an essay has no key to generate, and a
 * model asked for one invents a "model answer" that reads like a mark
 * scheme without being one.
 */
export const QUESTION_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: [...GENERATED_QUESTION_TYPES] },
          prompt: { type: "string" },
          options: {
            type: "array",
            items: {
              type: "object",
              properties: {
                key: { type: "string" },
                text: { type: "string" },
              },
              required: ["key", "text"],
              propertyOrdering: ["key", "text"],
            },
          },
          answer: { type: "array", items: { type: "string" } },
          marks: { type: "integer" },
        },
        required: ["type", "prompt", "options", "answer", "marks"],
        propertyOrdering: ["type", "prompt", "options", "answer", "marks"],
      },
    },
  },
  required: ["questions"],
  propertyOrdering: ["questions"],
};

export interface GeneratedQuestion {
  type: string;
  prompt: string;
  options: { key: string; text: string }[];
  answer: string[];
  marks: number;
}

export function buildQuestionPrompt(
  subject: Pick<Subject, "name" | "gradeLevel">,
  topic: string,
  settings: Pick<CurriculumSettings, "country" | "curriculumStandard">,
  count: number,
  gradeLevel?: string,
): string {
  const grade = gradeLevel ?? subject.gradeLevel;
  const gradeText = grade ? ` at grade level ${grade}` : "";
  const country = settings.country ? ` for schools in ${settings.country}` : "";
  const standard = settings.curriculumStandard
    ? `, following the ${settings.curriculumStandard} curriculum standard`
    : "";

  return (
    `Write ${count} exam questions on the topic "${topic}" for the subject "${subject.name}"${gradeText}` +
    `${country}${standard}.\n\n` +
    `Each question must be one of:\n` +
    `- SINGLE_CHOICE: 3 or 4 options, with exactly one key in "answer".\n` +
    `- MULTI_CHOICE: 4 or 5 options, with two or more keys in "answer".\n` +
    `- SHORT_ANSWER: an empty "options" array, and in "answer" every spelling a ` +
    `marker should accept, including obvious alternatives such as a numeral and its word.\n\n` +
    `Label options "A", "B", "C", ... and make every entry in "answer" exactly one of those labels ` +
    `for the choice types. Give each question a whole number of marks. ` +
    `Ask about the topic itself — do not write questions about the wording of these instructions.`
  );
}

export interface NormalisedQuestion {
  type: "SINGLE_CHOICE" | "MULTI_CHOICE" | "SHORT_ANSWER";
  prompt: string;
  options: { key: string; text: string }[];
  answer: string[];
  marksHundredths: number;
}

export interface NormaliseResult {
  questions: NormalisedQuestion[];
  /** Why each rejected question was dropped, so the teacher is told rather than left counting. */
  rejected: string[];
}

/**
 * Keeps only questions that are internally consistent, and says what it
 * dropped.
 *
 * The checks are the same ones the manual create path enforces — a key must
 * name an option that exists, a single-answer question must have exactly one
 * — because a question the bank would reject from a teacher is not one to
 * accept from a model. Silence about the rejects is the thing to avoid: a
 * teacher who asked for five questions and got three should know why.
 */
export function normaliseGenerated(raw: unknown): NormaliseResult {
  const questions = (raw as { questions?: unknown } | null)?.questions;
  if (!Array.isArray(questions)) return { questions: [], rejected: ["The model returned no questions"] };

  const kept: NormalisedQuestion[] = [];
  const rejected: string[] = [];

  questions.forEach((entry, index) => {
    const label = `Question ${index + 1}`;
    const question = entry as Partial<GeneratedQuestion> | null;

    const prompt = typeof question?.prompt === "string" ? question.prompt.trim() : "";
    if (!prompt) {
      rejected.push(`${label}: no question text`);
      return;
    }

    const type = String(question?.type ?? "").toUpperCase();
    if (!GENERATED_QUESTION_TYPES.includes(type as (typeof GENERATED_QUESTION_TYPES)[number])) {
      rejected.push(`${label}: unrecognised type "${question?.type}"`);
      return;
    }

    const answer = Array.isArray(question?.answer)
      ? question.answer.filter((value): value is string => typeof value === "string" && value.trim() !== "")
      : [];
    if (answer.length === 0) {
      rejected.push(`${label}: no answer key`);
      return;
    }

    // Marks arrive as whole marks and are stored in hundredths, like every
    // other mark in the system. A missing or silly value becomes 1 mark
    // rather than rejecting an otherwise good question.
    const marks = typeof question?.marks === "number" && question.marks > 0 ? Math.round(question.marks) : 1;

    if (type === "SHORT_ANSWER") {
      kept.push({
        type: "SHORT_ANSWER",
        prompt,
        options: [],
        answer: answer.map((value) => value.trim()),
        marksHundredths: marks * 100,
      });
      return;
    }

    // Widened to unknown[] deliberately: `GeneratedQuestion` describes what
    // was *asked* for, not what arrived, and treating the model's output as
    // already-typed is how an unchecked field reaches the database.
    const rawOptions: unknown[] = Array.isArray(question?.options) ? (question.options as unknown[]) : [];
    const options = rawOptions.length
      ? rawOptions
          .filter(
            (option): option is { key: unknown; text: unknown } =>
              typeof option === "object" && option !== null && "key" in option && "text" in option,
          )
          .map((option) => ({ key: String(option.key).trim(), text: String(option.text).trim() }))
          .filter((option) => option.key !== "" && option.text !== "")
      : [];

    if (options.length < 2) {
      rejected.push(`${label}: fewer than two options`);
      return;
    }

    const keys = new Set(options.map((option) => option.key.toUpperCase()));
    if (keys.size !== options.length) {
      rejected.push(`${label}: two options share a label`);
      return;
    }

    const normalisedAnswer = [...new Set(answer.map((value) => value.trim().toUpperCase()))];
    const dangling = normalisedAnswer.filter((key) => !keys.has(key));
    if (dangling.length > 0) {
      // The dangerous one: an answer key naming an option that isn't on the
      // paper would mark every student wrong, whatever they chose.
      rejected.push(`${label}: the answer names an option that is not there (${dangling.join(", ")})`);
      return;
    }

    if (type === "SINGLE_CHOICE" && normalisedAnswer.length !== 1) {
      rejected.push(`${label}: a single-answer question with ${normalisedAnswer.length} correct options`);
      return;
    }
    if (type === "MULTI_CHOICE" && normalisedAnswer.length < 2) {
      rejected.push(`${label}: a multiple-answer question with only one correct option`);
      return;
    }

    kept.push({
      type: type as "SINGLE_CHOICE" | "MULTI_CHOICE",
      prompt,
      options,
      answer: normalisedAnswer,
      marksHundredths: marks * 100,
    });
  });

  return { questions: kept, rejected };
}
