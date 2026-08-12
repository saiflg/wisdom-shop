"use client";

import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export type PromotionOutcome =
  | "PROMOTE"
  | "REPEAT"
  | "GRADUATE"
  | "ALREADY_DONE"
  | "NO_TARGET_CLASS"
  | "CANNOT_REPEAT";

export type PromotionChoice = "PROMOTE" | "REPEAT" | "GRADUATE";

export interface PromotionDecision {
  studentProfileId: string;
  studentName: string;
  fromClassId: string;
  fromClassName: string;
  outcome: PromotionOutcome;
  toClassId: string | null;
  toClassName: string | null;
  reason: string;
}

export interface PromotionPreview {
  fromAcademicYear: string;
  toAcademicYear: string;
  classes: { id: string; name: string; gradeLevel: string | null; studentCount: number }[];
  availableTargets: { id: string; name: string; gradeLevel: string | null }[];
  decisions: PromotionDecision[];
  summary: {
    promote: number;
    repeat: number;
    graduate: number;
    alreadyDone: number;
    problems: number;
    total: number;
  };
  blockers: PromotionDecision[];
}

export interface PromotionRequest {
  fromAcademicYear: string;
  toAcademicYear: string;
  classMappings: Record<string, string | null>;
  overrides?: Record<string, PromotionChoice>;
}

/**
 * Both are mutations, including the preview.
 *
 * Preview is a POST carrying the whole mapping, and deliberately not cached:
 * a stale plan is the one thing nobody should be able to approve, and a
 * cached "what will happen" is exactly that.
 */
export function usePromotionPreview() {
  const { accessToken } = useAuthQueryState();
  return useMutation({
    mutationFn: (request: PromotionRequest) =>
      apiFetch<PromotionPreview>("/v1/promotion/preview", {
        method: "POST",
        headers: authHeaders(accessToken),
        body: request,
      }),
  });
}

export interface PromotionResult {
  applied: number;
  summary: PromotionPreview["summary"];
  decisions: { studentName: string; from: string; to: string | null; outcome: PromotionOutcome }[];
}

export function useApplyPromotion() {
  const { accessToken } = useAuthQueryState();
  return useMutation({
    mutationFn: (request: PromotionRequest) =>
      apiFetch<PromotionResult>("/v1/promotion/apply", {
        method: "POST",
        headers: authHeaders(accessToken),
        body: request,
      }),
  });
}
