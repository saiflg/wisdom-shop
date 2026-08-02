import type { CurriculumSettings, Subject } from "ems-tenant-client";

/**
 * OpenAPI 3.0 subset per Gemini's structured-output constraints (no $ref/
 * oneOf) — see GeminiService's own doc comment. `propertyOrdering` pins
 * field order since JS object key order in the response isn't guaranteed.
 */
export const LESSON_PLAN_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    objectives: { type: "array", items: { type: "string" } },
    materials: { type: "array", items: { type: "string" } },
    introduction: { type: "string" },
    developmentSteps: { type: "array", items: { type: "string" } },
    conclusion: { type: "string" },
    assessment: { type: "string" },
    homework: { type: "string" },
  },
  required: ["objectives", "materials", "introduction", "developmentSteps", "conclusion", "assessment", "homework"],
  propertyOrdering: ["objectives", "materials", "introduction", "developmentSteps", "conclusion", "assessment", "homework"],
};

export interface SourceWeek {
  weekNumber: number;
  topic: string;
  objectives: string[];
  activities: string[];
}

export function buildLessonPlanPrompt(
  subject: Pick<Subject, "name" | "gradeLevel">,
  week: SourceWeek,
  settings: Pick<CurriculumSettings, "country" | "curriculumStandard">,
): string {
  const gradeLevel = subject.gradeLevel ? ` (grade level: ${subject.gradeLevel})` : "";
  const country = settings.country ? ` for schools in ${settings.country}` : "";
  const standard = settings.curriculumStandard
    ? `, following the ${settings.curriculumStandard} curriculum standard`
    : "";

  return (
    `Generate a full daily lesson plan for the subject "${subject.name}"${gradeLevel}${country}${standard}, ` +
    `expanding week ${week.weekNumber}'s topic "${week.topic}" from the scheme of work. ` +
    `That week's objectives were: ${week.objectives.join("; ")}. ` +
    `That week's planned activities were: ${week.activities.join("; ")}. ` +
    `Produce: a list of specific lesson objectives, a list of materials needed, an introduction/hook, ` +
    `a list of step-by-step development activities, a conclusion, an assessment method, and a homework assignment.`
  );
}
