"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

/**
 * Every figure the school might not have is nullable here too.
 *
 * The types carry the honesty: `attendanceRate: number | null` forces the
 * screen to decide what to show for a child with no registers, rather than
 * rendering a confident 0%.
 */
export interface StudentOverview {
  student: {
    id: string;
    name: string;
    studentCode: string | null;
    class: { id: string; name: string; academicYear: string } | null;
  };
  /** Null when nothing has been recorded. */
  attendanceRate: number | null;
  attendanceDays: number;
  /** Null when the child has never been invoiced. */
  balanceCents: number | null;
  invoicedCents: number;
  paidCents: number;
  /** Null when nothing has been written about them. */
  behaviour: { merits: number; concerns: number; netPoints: number } | null;
  libraryOut: number;
  libraryOverdue: number;
  /** Null when they have no wallet; zero means a wallet holding nothing. */
  walletCents: number | null;
  flags: string[];
  loans: { title: string; dueOn: string; overdue: boolean }[];
  transport: {
    route: string;
    direction: string;
    stop: string | null;
    pickupMinute: number | null;
  } | null;
  hostel: { block: string; room: string } | null;
}

export function useStudentOverview(studentProfileId: string | null) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: ["student-overview", studentProfileId],
    enabled: enabled && Boolean(studentProfileId),
    queryFn: () =>
      apiFetch<StudentOverview>(`/v1/student-overview/${studentProfileId}`, {
        headers: authHeaders(accessToken),
      }),
  });
}

/** Minor units as a readable amount. */
export function formatAmount(amountCents: number): string {
  const major = Math.floor(Math.abs(amountCents) / 100).toLocaleString("en-NG");
  return `${amountCents < 0 ? "-" : ""}${major}.${String(Math.abs(amountCents) % 100).padStart(2, "0")}`;
}

export function formatMinute(minute: number | null): string {
  if (minute === null) return "no time set";
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}
