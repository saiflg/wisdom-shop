import type { CurriculumSettings, Subject } from "ems-tenant-client";
import type { SourceWeek } from "@/lesson-plans/lesson-plan-prompt";
import { QUIZ_QUESTION_TYPES } from "./dto/quiz-content.dto";

const DEFAULT_QUESTION_COUNT = 5;

/**
 * OpenAPI 3.0 subset per Gemini's structured-output constraints (no $ref/
 * oneOf) — see GeminiService's own doc comment. `propertyOrdering` pins
 * field order since JS object key order isn't guaranteed in the response.
 */
export const QUIZ_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          questionNumber: { type: "integer" },
          prompt: { type: "string" },
          type: { type: "string", enum: [...QUIZ_QUESTION_TYPES] },
          options: { type: "array", items: { type: "string" } },
          correctAnswer: { type: "string" },
          marks: { type: "integer" },
        },
        required: ["questionNumber", "prompt", "type", "options", "correctAnswer", "marks"],
        propertyOrdering: ["questionNumber", "prompt", "type", "options", "correctAnswer", "marks"],
      },
    },
  },
  required: ["questions"],
  propertyOrdering: ["questions"],
};

export function buildQuizPrompt(
  subject: Pick<Subject, "name" | "gradeLevel">,
  week: SourceWeek,
  settings: Pick<CurriculumSettings, "country" | "curriculumStandard">,
  questionCount = DEFAULT_QUESTION_COUNT,
): string {
  const gradeLevel = subject.gradeLevel ? ` (grade level: ${subject.gradeLevel})` : "";
  const country = settings.country ? ` for schools in ${settings.country}` : "";
  const standard = settings.curriculumStandard
    ? `, following the ${settings.curriculumStandard} curriculum standard`
    : "";

  return (
    `Write a ${questionCount}-question quiz for the subject "${subject.name}"${gradeLevel}${country}${standard}, ` +
    `assessing week ${week.weekNumber}'s topic "${week.topic}" from the scheme of work. ` +
    `That week's learning objectives were: ${week.objectives.join("; ")}. ` +
    `Number the questions sequentially starting at 1. Each question must be either ` +
    `MULTIPLE_CHOICE (with 3-4 entries in "options", and "correctAnswer" exactly matching one of them) ` +
    `or SHORT_ANSWER (with an empty "options" array and a concise expected answer). ` +
    `Give every question a whole-number mark value.`
  );
}
