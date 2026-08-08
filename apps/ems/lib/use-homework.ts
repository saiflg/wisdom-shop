"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export type AssignmentStatus = "DRAFT" | "SET" | "CLOSED";
export type SubmissionStatus = "SUBMITTED" | "MARKED" | "RELEASED";

export interface Submission {
  id: string;
  studentProfileId: string;
  content: string;
  status: SubmissionStatus;
  submittedAt: string;
  isLate: boolean;
  /** Absent, not null, until released — see the service's presentForStudent. */
  scoreHundredths?: number | null;
  feedback?: string | null;
  markedByName?: string | null;
  studentProfile?: { id: string; user?: { firstName: string; lastName: string } };
}

export interface AssignmentProgress {
  expected: number;
  submitted: number;
  marked: number;
  released: number;
  late: number;
  outstanding: number;
}

export interface Assignment {
  id: string;
  classId: string;
  subjectId: string;
  title: string;
  instructions: string;
  status: AssignmentStatus;
  dueAt: string | null;
  maxScoreHundredths: number;
  assessmentId: string | null;
  class?: { id: string; name: string };
  subject?: { id: string; name: string };
  submissions?: Submission[];
  progress?: AssignmentProgress;
  _count?: { submissions: number };
}

export interface CreateAssignmentInput {
  classId: string;
  subjectId: string;
  title: string;
  instructions: string;
  dueAt?: string;
  maxScoreHundredths?: number;
  assessmentId?: string;
}

const KEY = ["homework"];

/** Hundredths to marks, for display. 800 -> "8". */
export function toMarks(hundredths: number | null | undefined): string {
  if (hundredths === null || hundredths === undefined) return "—";
  return String(hundredths / 100);
}

export function useAssignments(classId?: string) {
  const { accessToken, enabled } = useAuthQueryState();
  const search = classId ? `?classId=${encodeURIComponent(classId)}` : "";
  return useQuery({
    queryKey: [...KEY, { classId }],
    enabled,
    queryFn: () => apiFetch<Assignment[]>(`/v1/homework${search}`, { headers: authHeaders(accessToken) }),
  });
}

export function useAssignment(id: string | null) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...KEY, id],
    enabled: enabled && Boolean(id),
    queryFn: () => apiFetch<Assignment>(`/v1/homework/${id}`, { headers: authHeaders(accessToken) }),
  });
}

export function useCreateAssignment() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAssignmentInput) =>
      apiFetch<Assignment>("/v1/homework", { method: "POST", headers: authHeaders(accessToken), body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateAssignment(id: string) {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { status?: AssignmentStatus; title?: string; instructions?: string; dueAt?: string }) =>
      apiFetch<Assignment>(`/v1/homework/${id}`, {
        method: "PATCH",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSubmitWork(assignmentId: string) {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: string) =>
      apiFetch<Submission>(`/v1/homework/${assignmentId}/submit`, {
        method: "POST",
        headers: authHeaders(accessToken),
        body: { content },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useMarkSubmission() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { submissionId: string; scoreHundredths?: number; feedback?: string }) =>
      apiFetch<Submission>(`/v1/homework/submissions/${input.submissionId}/mark`, {
        method: "PATCH",
        headers: authHeaders(accessToken),
        body: { scoreHundredths: input.scoreHundredths, feedback: input.feedback },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useReleaseMarks(assignmentId: string) {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ released: number }>(`/v1/homework/${assignmentId}/release`, {
        method: "POST",
        headers: authHeaders(accessToken),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
