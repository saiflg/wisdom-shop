"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export const MARK_STATUSES = ["RECORDED", "ABSENT", "EXCUSED"] as const;
export type MarkStatus = (typeof MARK_STATUSES)[number];

export interface GradeBand {
  id?: string;
  label: string;
  minPercent: number;
  maxPercent: number;
  remark?: string | null;
  gradePoint?: number | null;
}

export interface GradeScale {
  id: string;
  name: string;
  isDefault: boolean;
  bands: GradeBand[];
}

export interface Mark {
  id: string;
  studentProfileId: string;
  scoreHundredths: number | null;
  status: MarkStatus;
  recordedByName: string | null;
  studentProfile?: { id: string; user: { firstName: string; lastName: string } };
}

export interface Assessment {
  id: string;
  subjectId: string;
  classId: string;
  name: string;
  academicYear: string;
  term: string;
  maxScoreHundredths: number;
  weightPercent: number;
  subject?: { id: string; name: string };
  marks: Mark[];
}

export interface SubjectResult {
  id: string;
  subjectId: string;
  percentHundredths: number;
  gradeLabel: string;
  gradeRemark: string | null;
  gradePoint: number | null;
  subject?: { id: string; name: string };
}

export interface TermResult {
  id: string;
  studentProfileId: string;
  classId: string;
  academicYear: string;
  term: string;
  status: "DRAFT" | "PUBLISHED";
  overallPercentHundredths: number | null;
  publishedAt: string | null;
  publishedByName: string | null;
  studentProfile?: { id: string; user: { id: string; firstName: string; lastName: string } };
  class?: { id: string; name: string };
  subjects: SubjectResult[];
}

const GRADING_KEY = ["grading"];

/**
 * Hundredths of a percent to a display string, without float maths — same
 * rule as the API's formatPercent. Null is "—", never "0%": no basis to
 * judge is not the same as scored nothing.
 */
export function formatPercent(percentHundredths: number | null): string {
  if (percentHundredths === null) return "—";
  const whole = Math.trunc(percentHundredths / 100);
  const fraction = Math.abs(percentHundredths % 100);
  return `${whole}.${String(fraction).padStart(2, "0")}%`;
}

/** Hundredths of a mark to a display string: 1750 → "17.50", 1800 → "18". */
export function formatScore(scoreHundredths: number | null): string {
  if (scoreHundredths === null) return "—";
  const whole = Math.trunc(scoreHundredths / 100);
  const fraction = Math.abs(scoreHundredths % 100);
  return fraction === 0 ? String(whole) : `${whole}.${String(fraction).padStart(2, "0")}`;
}

/**
 * Parses a typed mark like "17.5" into hundredths.
 *
 * String-based for the same reason as money: `parseFloat("17.5") * 100` is
 * fine until it isn't, and this one decides a grade. Returns null for
 * anything that isn't a clean mark so the caller refuses rather than guesses.
 */
export function parseScoreToHundredths(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function useGradeScales() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...GRADING_KEY, "scales"],
    enabled,
    queryFn: () => apiFetch<GradeScale[]>("/v1/grading/scales", { headers: authHeaders(accessToken) }),
  });
}

export function useAssessments(classId: string | null, academicYear: string, term: string) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...GRADING_KEY, "assessments", classId, academicYear, term],
    enabled: enabled && Boolean(classId && academicYear && term),
    queryFn: () =>
      apiFetch<Assessment[]>(
        `/v1/grading/assessments?classId=${classId}&academicYear=${encodeURIComponent(
          academicYear,
        )}&term=${encodeURIComponent(term)}`,
        { headers: authHeaders(accessToken) },
      ),
  });
}

export function useResults(classId: string | null, academicYear: string, term: string) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...GRADING_KEY, "results", classId, academicYear, term],
    enabled: enabled && Boolean(classId && academicYear && term),
    queryFn: () =>
      apiFetch<TermResult[]>(
        `/v1/grading/results?classId=${classId}&academicYear=${encodeURIComponent(
          academicYear,
        )}&term=${encodeURIComponent(term)}`,
        { headers: authHeaders(accessToken) },
      ),
  });
}

export function useReportCard(studentProfileId: string | null, academicYear: string, term: string) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...GRADING_KEY, "report-card", studentProfileId, academicYear, term],
    enabled: enabled && Boolean(studentProfileId && academicYear && term),
    retry: false,
    queryFn: () =>
      apiFetch<TermResult>(
        `/v1/grading/report-cards/${studentProfileId}?academicYear=${encodeURIComponent(
          academicYear,
        )}&term=${encodeURIComponent(term)}`,
        { headers: authHeaders(accessToken) },
      ),
  });
}

export interface CreateAssessmentInput {
  subjectId: string;
  classId: string;
  name: string;
  academicYear: string;
  term: string;
  maxScoreHundredths: number;
  weightPercent: number;
}

export function useCreateAssessment() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAssessmentInput) =>
      apiFetch<Assessment>("/v1/grading/assessments", {
        method: "POST",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: GRADING_KEY }),
  });
}

export function useRecordMarks(assessmentId: string) {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (marks: { studentProfileId: string; scoreHundredths?: number; status: MarkStatus }[]) =>
      apiFetch<Assessment[]>(`/v1/grading/assessments/${assessmentId}/marks`, {
        method: "POST",
        headers: authHeaders(accessToken),
        body: { marks },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: GRADING_KEY }),
  });
}

export function usePublishResults() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { classId: string; academicYear: string; term: string; unpublish?: boolean }) =>
      apiFetch<{ studentsPublished?: number; unpublished?: number }>(
        `/v1/grading/${input.unpublish ? "unpublish" : "publish"}`,
        {
          method: "POST",
          headers: authHeaders(accessToken),
          body: { classId: input.classId, academicYear: input.academicYear, term: input.term },
        },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: GRADING_KEY }),
  });
}
