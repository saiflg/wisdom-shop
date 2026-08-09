"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export type QuestionType = "SINGLE_CHOICE" | "MULTI_CHOICE" | "TRUE_FALSE" | "SHORT_ANSWER" | "ESSAY";
export type ExamStatus = "DRAFT" | "PUBLISHED" | "CLOSED";
export type AttemptStatus = "IN_PROGRESS" | "SUBMITTED" | "MARKED" | "RELEASED";

export interface QuestionOption {
  key: string;
  text: string;
}

export interface BankQuestion {
  id: string;
  subjectId: string;
  gradeLevel: string | null;
  topic: string | null;
  type: QuestionType;
  prompt: string;
  options: QuestionOption[];
  answer: string[];
  marksHundredths: number;
  source: "MANUAL" | "AI_GENERATED";
  subject?: { id: string; name: string };
}

/**
 * A question **as a student sees it**.
 *
 * There is deliberately no `answer` field on this type, not even an optional
 * one: if the API ever did leak the key, the compiler would not help anyone
 * render it by accident.
 */
export interface StudentQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  options: QuestionOption[];
  marksHundredths: number;
}

export interface ExamQuestion extends StudentQuestion {
  orderIndex: number;
  answer: string[];
  /** Which bank question it was copied from. Null once that one is deleted. */
  sourceItemId: string | null;
}

export interface ExamAttempt {
  id: string;
  studentProfileId: string;
  status: AttemptStatus;
  startedAt: string;
  expiresAt: string;
  submittedAt: string | null;
  autoSubmitted: boolean;
  /** Absent, not null, until released — see the service's presentAttemptForStudent. */
  autoScoreHundredths?: number | null;
  manualScoreHundredths?: number | null;
  totalScoreHundredths?: number | null;
  needsReview?: boolean;
  markedByName?: string | null;
  studentProfile?: { id: string; user?: { firstName: string; lastName: string } };
}

export interface Exam {
  id: string;
  classId: string;
  subjectId: string;
  title: string;
  instructions: string | null;
  academicYear: string;
  term: string;
  durationMinutes: number;
  opensAt: string | null;
  closesAt: string | null;
  shuffleQuestions: boolean;
  status: ExamStatus;
  assessmentId: string | null;
  class?: { id: string; name: string };
  subject?: { id: string; name: string };
  questions?: ExamQuestion[];
  attempts?: ExamAttempt[];
  totalMarksHundredths?: number;
  progress?: {
    expected: number;
    started: number;
    submitted: number;
    needingReview: number;
    released: number;
  };
  /** Only on the student/guardian list: their own attempt, or null. */
  attempt?: ExamAttempt | null;
  _count?: { questions: number; attempts: number };
}

export interface Paper {
  attemptId: string;
  examId: string;
  title: string;
  instructions: string | null;
  expiresAt: string;
  remainingSeconds: number;
  totalMarksHundredths: number;
  questions: StudentQuestion[];
  answers: { examQuestionId: string; response: string[] }[];
}

export interface MyAttempt extends ExamAttempt {
  totalMarksHundredths?: number;
  questions: StudentQuestion[];
  answers: {
    examQuestionId: string;
    response: string[];
    awardedHundredths: number | null;
    autoMarked: boolean;
    feedback: string | null;
  }[];
}

export interface StaffAttempt extends ExamAttempt {
  totalMarksHundredths: number;
  exam: Exam & { questions: ExamQuestion[] };
  answers: {
    id: string;
    examQuestionId: string;
    response: string[];
    awardedHundredths: number | null;
    autoMarked: boolean;
    needsReview: boolean;
    feedback: string | null;
  }[];
}

const KEY = ["exams"];
const BANK_KEY = ["question-bank"];

/** Hundredths to marks, for display. 250 -> "2.5". */
export function toMarks(hundredths: number | null | undefined): string {
  if (hundredths === null || hundredths === undefined) return "—";
  return String(hundredths / 100);
}

/** "2 marks", but "1 mark" — a question worth one mark said so in English. */
export function marksLabel(hundredths: number): string {
  return `${toMarks(hundredths)} ${hundredths === 100 ? "mark" : "marks"}`;
}

/** Seconds to "12:05", for a countdown a child can read at a glance. */
export function clock(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  SINGLE_CHOICE: "Multiple choice (one answer)",
  MULTI_CHOICE: "Multiple choice (several answers)",
  TRUE_FALSE: "True or false",
  SHORT_ANSWER: "Short answer",
  ESSAY: "Essay",
};

// ── The question bank ────────────────────────────────────────────────────

export function useQuestionBank(subjectId?: string) {
  const { accessToken, enabled } = useAuthQueryState();
  const search = subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : "";
  return useQuery({
    queryKey: [...BANK_KEY, { subjectId }],
    enabled,
    queryFn: () =>
      apiFetch<BankQuestion[]>(`/v1/exams/questions${search}`, { headers: authHeaders(accessToken) }),
  });
}

export interface CreateQuestionInput {
  subjectId: string;
  gradeLevel?: string;
  topic?: string;
  type: QuestionType;
  prompt: string;
  options?: QuestionOption[];
  answer?: string[];
  marksHundredths?: number;
}

export function useCreateQuestion() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateQuestionInput) =>
      apiFetch<BankQuestion>("/v1/exams/questions", {
        method: "POST",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BANK_KEY }),
  });
}

export function useDeleteQuestion() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ deleted: boolean }>(`/v1/exams/questions/${id}`, {
        method: "DELETE",
        headers: authHeaders(accessToken),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BANK_KEY }),
  });
}

export function useGenerateQuestions() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { subjectId: string; topic: string; gradeLevel?: string; count?: number }) =>
      apiFetch<{ created: BankQuestion[]; rejected: string[]; requested: number }>(
        "/v1/exams/questions/generate",
        { method: "POST", headers: authHeaders(accessToken), body: input },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BANK_KEY }),
  });
}

// ── Papers ───────────────────────────────────────────────────────────────

export function useExams(classId?: string) {
  const { accessToken, enabled } = useAuthQueryState();
  const search = classId ? `?classId=${encodeURIComponent(classId)}` : "";
  return useQuery({
    queryKey: [...KEY, { classId }],
    enabled,
    queryFn: () => apiFetch<Exam[]>(`/v1/exams${search}`, { headers: authHeaders(accessToken) }),
  });
}

export function useExam(id: string | null, options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...KEY, id],
    enabled: enabled && Boolean(id) && (options.enabled ?? true),
    queryFn: () => apiFetch<Exam>(`/v1/exams/${id}`, { headers: authHeaders(accessToken) }),
  });
}

export interface CreateExamInput {
  classId: string;
  subjectId: string;
  title: string;
  instructions?: string;
  academicYear: string;
  term: string;
  durationMinutes: number;
  opensAt?: string;
  closesAt?: string;
  shuffleQuestions?: boolean;
  assessmentId?: string;
}

export function useCreateExam() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateExamInput) =>
      apiFetch<Exam>("/v1/exams", { method: "POST", headers: authHeaders(accessToken), body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateExam(id: string) {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { status?: ExamStatus; title?: string; durationMinutes?: number }) =>
      apiFetch<Exam>(`/v1/exams/${id}`, { method: "PATCH", headers: authHeaders(accessToken), body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useAddExamQuestions(examId: string) {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (questionIds: string[]) =>
      apiFetch<Exam>(`/v1/exams/${examId}/questions`, {
        method: "POST",
        headers: authHeaders(accessToken),
        body: { questionIds },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRemoveExamQuestion(examId: string) {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (questionId: string) =>
      apiFetch<Exam>(`/v1/exams/${examId}/questions/${questionId}`, {
        method: "DELETE",
        headers: authHeaders(accessToken),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useReleaseExam(examId: string) {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ released: number; heldForReview: number }>(`/v1/exams/${examId}/release`, {
        method: "POST",
        headers: authHeaders(accessToken),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

// ── Sitting ──────────────────────────────────────────────────────────────

export function useStartExam(examId: string) {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<Paper>(`/v1/exams/${examId}/sit`, { method: "POST", headers: authHeaders(accessToken) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

/**
 * Saves one answer.
 *
 * Deliberately does **not** invalidate anything on success: refetching the
 * paper mid-exam would re-render every question under the student's cursor.
 * The server holds the truth; the page holds what they have typed.
 */
export function useSaveAnswer(examId: string) {
  const accessToken = useAuthQueryState().accessToken;
  return useMutation({
    mutationFn: (input: { examQuestionId: string; response: string[] }) =>
      apiFetch<{ saved: boolean; remainingSeconds: number }>(`/v1/exams/${examId}/answers`, {
        method: "POST",
        headers: authHeaders(accessToken),
        body: input,
      }),
  });
}

export function useSubmitExam(examId: string) {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<ExamAttempt>(`/v1/exams/${examId}/submit`, {
        method: "POST",
        headers: authHeaders(accessToken),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useMyAttempt(examId: string | null, options: { enabled?: boolean } = {}) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...KEY, examId, "my-attempt"],
    enabled: enabled && Boolean(examId) && (options.enabled ?? true),
    queryFn: () =>
      apiFetch<MyAttempt>(`/v1/exams/${examId}/my-attempt`, { headers: authHeaders(accessToken) }),
    retry: false,
  });
}

// ── Marking ──────────────────────────────────────────────────────────────

export function useStaffAttempt(attemptId: string | null) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: ["exam-attempt", attemptId],
    enabled: enabled && Boolean(attemptId),
    queryFn: () =>
      apiFetch<StaffAttempt>(`/v1/exams/attempts/${attemptId}`, { headers: authHeaders(accessToken) }),
  });
}

export function useMarkExamAnswer(attemptId: string) {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { answerId: string; awardedHundredths: number; feedback?: string }) =>
      apiFetch<ExamAttempt>(`/v1/exams/attempts/${attemptId}/answers/${input.answerId}`, {
        method: "PATCH",
        headers: authHeaders(accessToken),
        body: { awardedHundredths: input.awardedHundredths, feedback: input.feedback },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exam-attempt", attemptId] });
      queryClient.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useCollectExpired(examId: string) {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ collected: number }>(`/v1/exams/${examId}/collect`, {
        method: "POST",
        headers: authHeaders(accessToken),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
