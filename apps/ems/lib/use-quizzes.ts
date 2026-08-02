"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";
import type { SchemeOfWorkStatus, ContentSource } from "./use-schemes-of-work";

export const QUIZ_QUESTION_TYPES = ["MULTIPLE_CHOICE", "SHORT_ANSWER"] as const;
export type QuizQuestionType = (typeof QUIZ_QUESTION_TYPES)[number];

export interface QuizQuestion {
  questionNumber: number;
  prompt: string;
  type: QuizQuestionType;
  options: string[];
  /** Absent for STUDENT/GUARDIAN viewers — the API strips the answer key. */
  correctAnswer?: string;
  marks: number;
}

export interface QuizContent {
  questions: QuizQuestion[];
}

export interface Quiz {
  id: string;
  schemeOfWorkId: string;
  schemeOfWork?: {
    id: string;
    academicYear: string;
    term: string;
    subject?: { id: string; name: string; gradeLevel: string | null };
  };
  weekNumber: number;
  title: string;
  status: SchemeOfWorkStatus;
  source: ContentSource;
  content: QuizContent;
  generatedAt: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateQuizInput {
  schemeOfWorkId: string;
  weekNumber: number;
  title: string;
  content: QuizContent;
}

export interface GenerateQuizInput {
  schemeOfWorkId: string;
  weekNumber: number;
  title: string;
  questionCount?: number;
}

export interface UpdateQuizInput {
  title?: string;
  content?: QuizContent;
}

const QUIZZES_KEY = ["quizzes"];

export function useQuizzes(schemeOfWorkId?: string) {
  const { accessToken, enabled } = useAuthQueryState();
  const search = schemeOfWorkId ? `?schemeOfWorkId=${encodeURIComponent(schemeOfWorkId)}` : "";
  return useQuery({
    queryKey: [...QUIZZES_KEY, { schemeOfWorkId }],
    enabled,
    queryFn: () => apiFetch<Quiz[]>(`/v1/quizzes${search}`, { headers: authHeaders(accessToken) }),
  });
}

export function useQuiz(id: string | null) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: ["quizzes", id],
    enabled: enabled && Boolean(id),
    queryFn: () => apiFetch<Quiz>(`/v1/quizzes/${id}`, { headers: authHeaders(accessToken) }),
  });
}

export function useCreateQuiz() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateQuizInput) =>
      apiFetch<Quiz>("/v1/quizzes", { method: "POST", headers: authHeaders(accessToken), body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUIZZES_KEY }),
  });
}

export function useGenerateQuiz() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: GenerateQuizInput) =>
      apiFetch<Quiz>("/v1/quizzes/generate", { method: "POST", headers: authHeaders(accessToken), body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUIZZES_KEY }),
  });
}

export function useUpdateQuiz(id: string) {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateQuizInput) =>
      apiFetch<Quiz>(`/v1/quizzes/${id}`, { method: "PATCH", headers: authHeaders(accessToken), body: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUIZZES_KEY });
      queryClient.invalidateQueries({ queryKey: ["quizzes", id] });
    },
  });
}

export function usePublishQuiz(id: string) {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<Quiz>(`/v1/quizzes/${id}/publish`, { method: "PATCH", headers: authHeaders(accessToken) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUIZZES_KEY });
      queryClient.invalidateQueries({ queryKey: ["quizzes", id] });
    },
  });
}
