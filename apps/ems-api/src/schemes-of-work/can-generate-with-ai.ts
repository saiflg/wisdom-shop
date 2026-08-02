import type { CurriculumMode } from "ems-tenant-client";

/** AI generation is offered only in AI_AUTOMATIC or HYBRID mode — MANUAL schools never see it. */
export function canGenerateWithAi(mode: CurriculumMode): boolean {
  return mode === "AI_AUTOMATIC" || mode === "HYBRID";
}
