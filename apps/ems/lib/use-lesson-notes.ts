"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export type LessonNoteStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "RETURNED";

export const STATUS_LABEL: Record<LessonNoteStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Waiting to be vetted",
  APPROVED: "Approved",
  RETURNED: "Sent back",
};

export const STATUS_STYLE: Record<LessonNoteStatus, string> = {
  DRAFT: "bg-slate-500 text-white",
  SUBMITTED: "bg-blue-600 text-white",
  APPROVED: "bg-emerald-600 text-white",
  // Amber, not red: a returned note is a normal step, not a failure.
  RETURNED: "bg-amber-500 text-white",
};

/** What each move is called on a button, from the mover's point of view. */
export const TRANSITION_LABEL: Record<LessonNoteStatus, string> = {
  SUBMITTED: "Send for vetting",
  APPROVED: "Approve",
  RETURNED: "Send back",
  DRAFT: "Back to draft",
};

export interface LessonNote {
  id: string;
  subjectId: string;
  classId: string;
  academicYear: string;
  term: string;
  weekNumber: number;
  title: string;
  body: string;
  status: LessonNoteStatus;
  authorName: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
  reviewComment: string | null;
  subject?: { id: string; name: string };
  class?: { id: string; name: string };
  /** Only the moves this viewer can actually make; empty for a family. */
  availableTransitions?: LessonNoteStatus[];
}

export interface CreateLessonNoteInput {
  subjectId: string;
  classId: string;
  academicYear: string;
  term: string;
  weekNumber: number;
  title: string;
  body: string;
}

const KEY = ["lesson-notes"];

export function useLessonNotes(filter: { classId?: string; subjectId?: string } = {}) {
  const { accessToken, enabled } = useAuthQueryState();
  const query = new URLSearchParams();
  if (filter.classId) query.set("classId", filter.classId);
  if (filter.subjectId) query.set("subjectId", filter.subjectId);
  const suffix = query.toString() ? `?${query}` : "";

  return useQuery({
    queryKey: [...KEY, suffix],
    enabled,
    queryFn: () => apiFetch<LessonNote[]>(`/v1/lesson-notes${suffix}`, { headers: authHeaders(accessToken) }),
  });
}

export function useLessonNote(id: string | null) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...KEY, "one", id],
    enabled: enabled && Boolean(id),
    queryFn: () => apiFetch<LessonNote>(`/v1/lesson-notes/${id}`, { headers: authHeaders(accessToken) }),
  });
}

export function useCreateLessonNote() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLessonNoteInput) =>
      apiFetch<LessonNote>("/v1/lesson-notes", {
        method: "POST",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateLessonNote(id: string) {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { title?: string; body?: string }) =>
      apiFetch<LessonNote>(`/v1/lesson-notes/${id}`, {
        method: "PATCH",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useTransitionLessonNote(id: string) {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { to: LessonNoteStatus; comment?: string }) =>
      apiFetch<LessonNote>(`/v1/lesson-notes/${id}/status`, {
        method: "PATCH",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
