"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "LATE", "EXCUSED"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export interface AttendanceAmendment {
  id: string;
  fromStatus: AttendanceStatus;
  toStatus: AttendanceStatus;
  reason: string;
  actorName: string;
  createdAt: string;
}

export interface AttendanceRecord {
  id: string;
  studentProfileId: string;
  status: AttendanceStatus;
  note: string | null;
  studentProfile?: { id: string; user: { id: string; firstName: string; lastName: string } };
  register?: { id: string; date: string; session: string; class: { id: string; name: string } };
  amendments: AttendanceAmendment[];
}

export interface AttendanceRegister {
  id: string;
  classId: string;
  date: string;
  session: string;
  takenAt: string;
  class?: { id: string; name: string; academicYear: string };
  takenBy?: { id: string; firstName: string; lastName: string } | null;
  records: AttendanceRecord[];
}

export interface AttendanceSummary {
  counts: Record<AttendanceStatus, number>;
  total: number;
  /** Null when there are no records — not 0. "No data" isn't "attended nothing". */
  presentRate: number | null;
}

export interface StudentAttendance {
  records: AttendanceRecord[];
  summary: AttendanceSummary;
}

const ATTENDANCE_KEY = ["attendance"];

export function useClassRegisters(classId: string | null) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...ATTENDANCE_KEY, "class", classId],
    enabled: enabled && Boolean(classId),
    queryFn: () =>
      apiFetch<AttendanceRegister[]>(`/v1/attendance/classes/${classId}/registers`, {
        headers: authHeaders(accessToken),
      }),
  });
}

export function useStudentAttendance(studentProfileId: string | null) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...ATTENDANCE_KEY, "student", studentProfileId],
    enabled: enabled && Boolean(studentProfileId),
    queryFn: () =>
      apiFetch<StudentAttendance>(`/v1/attendance/students/${studentProfileId}`, {
        headers: authHeaders(accessToken),
      }),
  });
}

export interface TakeRegisterInput {
  classId: string;
  date: string;
  session?: string;
  marks: { studentProfileId: string; status: AttendanceStatus; note?: string }[];
}

export function useTakeRegister() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TakeRegisterInput) =>
      apiFetch<AttendanceRegister>("/v1/attendance/registers", {
        method: "POST",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ATTENDANCE_KEY }),
  });
}

/** Changing a recorded mark always carries a reason — see the API. */
export function useAmendAttendance(recordId: string) {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { status: AttendanceStatus; reason: string; note?: string }) =>
      apiFetch<AttendanceRecord>(`/v1/attendance/records/${recordId}`, {
        method: "PATCH",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ATTENDANCE_KEY }),
  });
}
