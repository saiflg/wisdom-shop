"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export type TutorSessionStatus = "ACTIVE" | "ENDED";
export type TutorTurnRole = "STUDENT" | "TUTOR";

export interface TutorTurn {
  id: string;
  sequence: number;
  role: TutorTurnRole;
  content: string;
  createdAt: string;
}

export interface TutorSession {
  id: string;
  topic: string;
  status: TutorSessionStatus;
  subjectId: string;
  subject?: { id: string; name: string; gradeLevel: string | null };
  schemeOfWorkId: string | null;
  weekNumber: number | null;
  startedByUser?: { id: string; firstName: string; lastName: string };
  startedAt: string;
  endedAt: string | null;
  updatedAt: string;
  turns?: TutorTurn[];
  _count?: { turns: number };
}

export interface StartSessionInput {
  subjectId: string;
  topic: string;
  schemeOfWorkId?: string;
  weekNumber?: number;
}

export interface AskResult {
  question: TutorTurn;
  answer: TutorTurn;
}

const SESSIONS_KEY = ["ai-teacher", "sessions"];

export function useTutorSessions() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: SESSIONS_KEY,
    enabled,
    queryFn: () => apiFetch<TutorSession[]>("/v1/ai-teacher/sessions", { headers: authHeaders(accessToken) }),
  });
}

export function useTutorSession(id: string | null) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...SESSIONS_KEY, id],
    enabled: enabled && Boolean(id),
    queryFn: () => apiFetch<TutorSession>(`/v1/ai-teacher/sessions/${id}`, { headers: authHeaders(accessToken) }),
  });
}

export function useStartTutorSession() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: StartSessionInput) =>
      apiFetch<TutorSession>("/v1/ai-teacher/sessions", {
        method: "POST",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSIONS_KEY }),
  });
}

export function useAskTutor(sessionId: string) {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (question: string) =>
      apiFetch<AskResult>(`/v1/ai-teacher/sessions/${sessionId}/ask`, {
        method: "POST",
        headers: authHeaders(accessToken),
        body: { question },
      }),
    // Refetching the whole session rather than appending locally keeps the
    // displayed transcript identical to the stored one, which is the record
    // a parent or a teacher will later read.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...SESSIONS_KEY, sessionId] }),
  });
}

export function useEndTutorSession(sessionId: string) {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<TutorSession>(`/v1/ai-teacher/sessions/${sessionId}/end`, {
        method: "PATCH",
        headers: authHeaders(accessToken),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });
      queryClient.invalidateQueries({ queryKey: [...SESSIONS_KEY, sessionId] });
    },
  });
}
