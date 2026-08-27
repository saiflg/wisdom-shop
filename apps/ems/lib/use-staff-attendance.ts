"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export type StaffAttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "ON_LEAVE";

export const STATUS_LABEL: Record<StaffAttendanceStatus, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  LATE: "Late",
  ON_LEAVE: "On leave",
};

export const STATUS_STYLE: Record<StaffAttendanceStatus, string> = {
  PRESENT: "bg-emerald-600 text-white",
  ABSENT: "bg-red-600 text-white",
  LATE: "bg-amber-500 text-white",
  // Not red, not green: being on approved leave is neither a failure nor
  // attendance, and colouring it like either misreads the record.
  ON_LEAVE: "bg-slate-500 text-white",
};

export interface StaffAttendanceDay {
  id: string;
  userId: string;
  date: string;
  status: StaffAttendanceStatus;
  minutesLate: number | null;
  note: string | null;
  recordedByName: string;
  user?: { id: string; firstName: string; lastName: string };
}

export interface StaffAttendanceSummary {
  present: number;
  absent: number;
  late: number;
  onLeave: number;
  attended: number;
  expected: number;
  minutesLate: number;
}

export interface StaffAttendancePeriod {
  days: StaffAttendanceDay[];
  summary: StaffAttendanceSummary;
  /** Null when nobody was expected — a period entirely on leave has no rate. */
  rate: number | null;
}

const KEY = ["staff-attendance"];

export function useStaffAttendanceDay(date: string) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...KEY, "day", date],
    enabled: enabled && Boolean(date),
    queryFn: () =>
      apiFetch<StaffAttendanceDay[]>(`/v1/staff-attendance/day?date=${encodeURIComponent(date)}`, {
        headers: authHeaders(accessToken),
      }),
  });
}

export function useStaffAttendancePeriod(userId: string | null, from: string, to: string) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...KEY, "staff", userId, from, to],
    enabled: enabled && Boolean(userId && from && to),
    queryFn: () =>
      apiFetch<StaffAttendancePeriod>(
        `/v1/staff-attendance/staff?userId=${userId}&from=${from}&to=${to}`,
        { headers: authHeaders(accessToken) },
      ),
  });
}

export function useMarkStaffAttendance() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      userId: string;
      date: string;
      status: StaffAttendanceStatus;
      minutesLate?: number;
      note?: string;
    }) =>
      apiFetch<{ record: StaffAttendanceDay; adjusted: string | null }>("/v1/staff-attendance", {
        method: "POST",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

/** Today as YYYY-MM-DD, which is what the API's date-only fields expect. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
