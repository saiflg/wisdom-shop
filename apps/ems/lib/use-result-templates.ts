"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export interface ResultTemplateComponent {
  id?: string;
  name: string;
  /** Hundredths, same unit as an assessment: a 10-mark test is 1000. */
  maxScoreHundredths: number;
  weightPercent: number;
  position?: number;
}

export interface ResultTemplate {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  components: ResultTemplateComponent[];
}

export interface CreateResultTemplateInput {
  name: string;
  description?: string;
  isDefault?: boolean;
  components: ResultTemplateComponent[];
}

export interface ApplyResult {
  planned: number;
  created: number;
  /** Already there from a previous apply — not a failure. */
  alreadyPresent: number;
}

const KEY = ["result-templates"];

export function useResultTemplates() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: KEY,
    enabled,
    queryFn: () => apiFetch<ResultTemplate[]>("/v1/result-templates", { headers: authHeaders(accessToken) }),
  });
}

export function useCreateResultTemplate() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateResultTemplateInput) =>
      apiFetch<ResultTemplate>("/v1/result-templates", {
        method: "POST",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateResultTemplate(id: string) {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<CreateResultTemplateInput>) =>
      apiFetch<ResultTemplate>(`/v1/result-templates/${id}`, {
        method: "PATCH",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteResultTemplate() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/v1/result-templates/${id}`, { method: "DELETE", headers: authHeaders(accessToken) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useApplyResultTemplate(id: string) {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { classId: string; academicYear: string; term: string; subjectIds: string[] }) =>
      apiFetch<ApplyResult>(`/v1/result-templates/${id}/apply`, {
        method: "POST",
        headers: authHeaders(accessToken),
        body: input,
      }),
    // Applying writes assessments, which the grading screens read.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["assessments"] }),
  });
}

/** Whole marks for display; the API speaks hundredths. */
export function toMarks(hundredths: number): number {
  return hundredths / 100;
}

export function fromMarks(marks: number): number {
  return Math.round(marks * 100);
}
