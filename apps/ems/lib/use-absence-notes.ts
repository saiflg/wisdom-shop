"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export const ABSENCE_REASONS = [
  { value: "ILLNESS", label: "Illness" },
  { value: "MEDICAL_APPOINTMENT", label: "Medical appointment" },
  { value: "BEREAVEMENT", label: "Bereavement" },
  { value: "RELIGIOUS_OBSERVANCE", label: "Religious observance" },
  { value: "FAMILY_TRAVEL", label: "Family travel" },
  { value: "OTHER", label: "Other" },
] as const;

export type AbsenceNoteState = "SUBMITTED" | "ACKNOWLEDGED" | "WITHDRAWN";

export interface AbsenceNote {
  id: string;
  studentProfileId: string;
  fromDate: string;
  toDate: string;
  /** "Mon 17 Aug" or "Mon 17 Aug – Wed 19 Aug", built server-side. */
  dates: string;
  duration: string;
  reason: string;
  reasonLabel: string;
  /** Health information. Null unless the viewer is staff or wrote it. */
  note: string | null;
  state: AbsenceNoteState;
  canWithdraw: boolean;
  sentByName: string | null;
  acknowledgedByName: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
}

/** Only on the staff list — a parent never sees another family's child. */
export interface PendingAbsenceNote extends AbsenceNote {
  studentName: string;
}

export interface CreateAbsenceNoteInput {
  studentProfileId: string;
  fromDate: string;
  toDate: string;
  reason: string;
  note?: string;
}

const KEY = ["absence-notes"];

export function useAbsenceNotes(studentProfileId: string | null) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...KEY, studentProfileId],
    enabled: enabled && Boolean(studentProfileId),
    queryFn: () =>
      apiFetch<AbsenceNote[]>(`/v1/absence-notes/${studentProfileId}`, { headers: authHeaders(accessToken) }),
  });
}

export function usePendingAbsenceNotes() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...KEY, "pending"],
    enabled,
    queryFn: () => apiFetch<PendingAbsenceNote[]>("/v1/absence-notes/pending", { headers: authHeaders(accessToken) }),
  });
}

export function useReportAbsence() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAbsenceNoteInput) =>
      apiFetch<AbsenceNote>("/v1/absence-notes", {
        method: "POST",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useWithdrawAbsenceNote() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<AbsenceNote>(`/v1/absence-notes/${id}/withdraw`, {
        method: "PATCH",
        headers: authHeaders(accessToken),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useAcknowledgeAbsenceNote() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<AbsenceNote>(`/v1/absence-notes/${id}/acknowledge`, {
        method: "PATCH",
        headers: authHeaders(accessToken),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
