"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";
import type { SchemeOfWorkStatus, ContentSource } from "./use-schemes-of-work";

export interface LessonPlanContent {
  objectives: string[];
  materials: string[];
  introduction: string;
  developmentSteps: string[];
  conclusion: string;
  assessment: string;
  homework: string;
}

export interface LessonPlan {
  id: string;
  schemeOfWorkId: string;
  schemeOfWork?: {
    id: string;
    academicYear: string;
    term: string;
    subject?: { id: string; name: string; gradeLevel: string | null };
  };
  weekNumber: number;
  status: SchemeOfWorkStatus;
  source: ContentSource;
  content: LessonPlanContent;
  generatedAt: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLessonPlanInput {
  schemeOfWorkId: string;
  weekNumber: number;
  content: LessonPlanContent;
}

export interface GenerateLessonPlanInput {
  schemeOfWorkId: string;
  weekNumber: number;
}

const LESSON_PLANS_KEY = ["lesson-plans"];

export function useLessonPlans(schemeOfWorkId?: string) {
  const { accessToken, enabled } = useAuthQueryState();
  const search = schemeOfWorkId ? `?schemeOfWorkId=${encodeURIComponent(schemeOfWorkId)}` : "";
  return useQuery({
    queryKey: [...LESSON_PLANS_KEY, { schemeOfWorkId }],
    enabled,
    queryFn: () => apiFetch<LessonPlan[]>(`/v1/lesson-plans${search}`, { headers: authHeaders(accessToken) }),
  });
}

export function useLessonPlan(id: string | null) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: ["lesson-plans", id],
    enabled: enabled && Boolean(id),
    queryFn: () => apiFetch<LessonPlan>(`/v1/lesson-plans/${id}`, { headers: authHeaders(accessToken) }),
  });
}

export function useCreateLessonPlan() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLessonPlanInput) =>
      apiFetch<LessonPlan>("/v1/lesson-plans", { method: "POST", headers: authHeaders(accessToken), body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LESSON_PLANS_KEY }),
  });
}

export function useGenerateLessonPlan() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: GenerateLessonPlanInput) =>
      apiFetch<LessonPlan>("/v1/lesson-plans/generate", {
        method: "POST",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LESSON_PLANS_KEY }),
  });
}

export function useUpdateLessonPlan(id: string) {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: LessonPlanContent) =>
      apiFetch<LessonPlan>(`/v1/lesson-plans/${id}`, {
        method: "PATCH",
        headers: authHeaders(accessToken),
        body: { content },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LESSON_PLANS_KEY });
      queryClient.invalidateQueries({ queryKey: ["lesson-plans", id] });
    },
  });
}

export function usePublishLessonPlan(id: string) {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<LessonPlan>(`/v1/lesson-plans/${id}/publish`, { method: "PATCH", headers: authHeaders(accessToken) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LESSON_PLANS_KEY });
      queryClient.invalidateQueries({ queryKey: ["lesson-plans", id] });
    },
  });
}
