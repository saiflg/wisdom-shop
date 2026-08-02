"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export type SchemeOfWorkStatus = "DRAFT" | "PUBLISHED";
export type ContentSource = "MANUAL" | "AI_GENERATED";

export interface SchemeOfWorkWeek {
  weekNumber: number;
  topic: string;
  objectives: string[];
  activities: string[];
}

export interface SchemeOfWorkContent {
  weeks: SchemeOfWorkWeek[];
}

export interface SchemeOfWork {
  id: string;
  subjectId: string;
  subject?: { id: string; name: string; gradeLevel: string | null };
  academicYear: string;
  term: string;
  status: SchemeOfWorkStatus;
  source: ContentSource;
  content: SchemeOfWorkContent;
  generatedAt: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSchemeOfWorkInput {
  subjectId: string;
  academicYear: string;
  term: string;
  content: SchemeOfWorkContent;
}

export interface GenerateSchemeOfWorkInput {
  subjectId: string;
  academicYear: string;
  term: string;
  weekCount?: number;
}

const SCHEMES_OF_WORK_KEY = ["schemes-of-work"];

export function useSchemesOfWork(subjectId?: string) {
  const { accessToken, enabled } = useAuthQueryState();
  const search = subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : "";
  return useQuery({
    queryKey: [...SCHEMES_OF_WORK_KEY, { subjectId }],
    enabled,
    queryFn: () => apiFetch<SchemeOfWork[]>(`/v1/schemes-of-work${search}`, { headers: authHeaders(accessToken) }),
  });
}

export function useSchemeOfWork(id: string | null) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: ["schemes-of-work", id],
    enabled: enabled && Boolean(id),
    queryFn: () => apiFetch<SchemeOfWork>(`/v1/schemes-of-work/${id}`, { headers: authHeaders(accessToken) }),
  });
}

export function useCreateSchemeOfWork() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSchemeOfWorkInput) =>
      apiFetch<SchemeOfWork>("/v1/schemes-of-work", { method: "POST", headers: authHeaders(accessToken), body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SCHEMES_OF_WORK_KEY }),
  });
}

export function useGenerateSchemeOfWork() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: GenerateSchemeOfWorkInput) =>
      apiFetch<SchemeOfWork>("/v1/schemes-of-work/generate", {
        method: "POST",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SCHEMES_OF_WORK_KEY }),
  });
}

export function useUpdateSchemeOfWork(id: string) {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: SchemeOfWorkContent) =>
      apiFetch<SchemeOfWork>(`/v1/schemes-of-work/${id}`, {
        method: "PATCH",
        headers: authHeaders(accessToken),
        body: { content },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SCHEMES_OF_WORK_KEY });
      queryClient.invalidateQueries({ queryKey: ["schemes-of-work", id] });
    },
  });
}

export function usePublishSchemeOfWork(id: string) {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<SchemeOfWork>(`/v1/schemes-of-work/${id}/publish`, { method: "PATCH", headers: authHeaders(accessToken) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SCHEMES_OF_WORK_KEY });
      queryClient.invalidateQueries({ queryKey: ["schemes-of-work", id] });
    },
  });
}
