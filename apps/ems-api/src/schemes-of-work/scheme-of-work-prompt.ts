import type { CurriculumSettings, Subject } from "ems-tenant-client";
import type { GenerateSchemeOfWorkDto } from "./dto/generate-scheme-of-work.dto";

const DEFAULT_WEEK_COUNT = 12;

/**
 * OpenAPI 3.0 subset per Gemini's structured-output constraints (no $ref/oneOf).
 * `propertyOrdering` pins field order since JS object key order in the
 * response isn't guaranteed — see GeminiService's own doc comment.
 */
export const SCHEME_OF_WORK_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    weeks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          weekNumber: { type: "integer" },
          topic: { type: "string" },
          objectives: { type: "array", items: { type: "string" } },
          activities: { type: "array", items: { type: "string" } },
        },
        required: ["weekNumber", "topic", "objectives", "activities"],
        propertyOrdering: ["weekNumber", "topic", "objectives", "activities"],
      },
    },
  },
  required: ["weeks"],
  propertyOrdering: ["weeks"],
};

export function buildSchemeOfWorkPrompt(
  subject: Pick<Subject, "name" | "gradeLevel">,
  dto: GenerateSchemeOfWorkDto,
  settings: Pick<CurriculumSettings, "country" | "curriculumStandard">,
): string {
  const weekCount = dto.weekCount ?? DEFAULT_WEEK_COUNT;
  const gradeLevel = subject.gradeLevel ? ` (grade level: ${subject.gradeLevel})` : "";
  const country = settings.country ? ` for schools in ${settings.country}` : "";
  const standard = settings.curriculumStandard
    ? `, following the ${settings.curriculumStandard} curriculum standard`
    : "";

  return (
    `Generate a ${weekCount}-week scheme of work for the subject "${subject.name}"${gradeLevel}, ` +
    `academic year ${dto.academicYear}, term "${dto.term}"${country}${standard}. ` +
    `For each week provide: a topic, 2-4 learning objectives, and 2-4 classroom activities. ` +
    `Return exactly ${weekCount} weeks, numbered sequentially starting at 1.`
  );
}
