"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export type AppraisalStatus = "DRAFT" | "SHARED" | "ACKNOWLEDGED";

export const STATUS_LABEL: Record<AppraisalStatus, string> = {
  DRAFT: "Draft — not shared",
  SHARED: "Shared, waiting to be acknowledged",
  ACKNOWLEDGED: "Acknowledged",
};

export const STATUS_STYLE: Record<AppraisalStatus, string> = {
  DRAFT: "bg-slate-500 text-white",
  SHARED: "bg-blue-600 text-white",
  ACKNOWLEDGED: "bg-emerald-600 text-white",
};

export const TRANSITION_LABEL: Record<AppraisalStatus, string> = {
  SHARED: "Share with them",
  ACKNOWLEDGED: "I have seen this",
  DRAFT: "Take back to draft",
};

export interface AppraisalRating {
  id?: string;
  area: string;
  score: number;
  comment?: string | null;
}

export interface Appraisal {
  id: string;
  subjectUserId: string;
  reviewerUserId: string;
  reviewerName: string;
  periodLabel: string;
  status: AppraisalStatus;
  strengths: string | null;
  development: string | null;
  comment: string | null;
  sharedAt: string | null;
  acknowledgedAt: string | null;
  acknowledgementNote: string | null;
  ratings: AppraisalRating[];
  /** Null when nothing has been rated — not zero, which is off the scale. */
  overall: number | null;
  availableTransitions: AppraisalStatus[];
  subject?: { id: string; firstName: string; lastName: string };
}

const KEY = ["appraisals"];

export function useAppraisals(subjectUserId?: string) {
  const { accessToken, enabled } = useAuthQueryState();
  const suffix = subjectUserId ? `?subjectUserId=${subjectUserId}` : "";
  return useQuery({
    queryKey: [...KEY, suffix],
    enabled,
    queryFn: () => apiFetch<Appraisal[]>(`/v1/appraisals${suffix}`, { headers: authHeaders(accessToken) }),
  });
}

export function useCreateAppraisal() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { subjectUserId: string; periodLabel: string }) =>
      apiFetch<Appraisal>("/v1/appraisals", {
        method: "POST",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateAppraisal(id: string) {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      strengths?: string;
      development?: string;
      comment?: string;
      ratings?: AppraisalRating[];
    }) =>
      apiFetch<Appraisal>(`/v1/appraisals/${id}`, {
        method: "PATCH",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useTransitionAppraisal(id: string) {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { to: AppraisalStatus; note?: string }) =>
      apiFetch<Appraisal>(`/v1/appraisals/${id}/status`, {
        method: "PATCH",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

/** The areas most schools start from. Free text, so a school can use its own. */
export const SUGGESTED_AREAS = [
  "Planning and preparation",
  "Classroom management",
  "Subject knowledge",
  "Marking and feedback",
  "Working with colleagues",
];
