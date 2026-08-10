"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export interface PortalChild {
  studentProfileId: string;
  /** The login behind the profile — what the photo route is keyed on. */
  userId: string;
  name: string;
  studentCode: string | null;
  className: string | null;
  classId: string | null;
}

export interface PortalResult {
  id: string;
  academicYear: string;
  term: string;
  className: string | null;
  /** Hundredths, like every other percentage in this system. */
  overallPercent: number;
  grade: string | null;
  subjectCount: number;
}

export interface PortalExam {
  id: string;
  title: string;
  subject: string | null;
  opensAt: string | null;
  closesAt: string | null;
  /** True when it can be sat right now. */
  open: boolean;
  started: boolean;
}

export interface PortalLesson {
  period: string;
  startMinute: number;
  subject: string;
  teacher: string | null;
}

export interface PortalHomeworkItem {
  id: string;
  title: string;
  subject: string | null;
  dueAt: string | null;
}

export interface PortalMark {
  assignmentId: string;
  title: string;
  subject: string | null;
  scoreHundredths: number | null;
  maxScoreHundredths: number;
  feedback: string | null;
}

export interface PortalHome {
  isStaff: boolean;
  children: PortalChild[];
  child: PortalChild | null;
  today: PortalLesson[];
  homework: {
    overdue: PortalHomeworkItem[];
    today: PortalHomeworkItem[];
    upcoming: PortalHomeworkItem[];
    noDeadline: PortalHomeworkItem[];
    recentlyMarked: PortalMark[];
  } | null;
  attendance: { total: number; presentRate: number | null; counts: Record<string, number> } | null;
  fees: { invoiced: number; collected: number; outstanding: number; invoiceCount: number } | null;
  lessons: Array<{ id: string; topic: string; subject: string | null; status: string; percent: number }>;
  /** Published term results only — a draft is not a family's business. */
  results?: PortalResult[];
  /** Papers still to sit; anything submitted drops off. */
  exams?: PortalExam[];
}

export function usePortalHome(studentProfileId?: string | null) {
  const { accessToken, enabled } = useAuthQueryState();
  const search = studentProfileId ? `?studentProfileId=${encodeURIComponent(studentProfileId)}` : "";
  return useQuery({
    queryKey: ["portal", "home", studentProfileId ?? null],
    enabled,
    queryFn: () => apiFetch<PortalHome>(`/v1/portal/home${search}`, { headers: authHeaders(accessToken) }),
  });
}

/** Minutes since midnight to "08:30". */
export function clockTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function toMarks(hundredths: number | null | undefined): string {
  if (hundredths === null || hundredths === undefined) return "—";
  return String(hundredths / 100);
}

export function money(cents: number): string {
  return (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
