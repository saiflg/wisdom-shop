"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export const WEEKDAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface TimetablePeriod {
  id: string;
  label: string;
  startMinute: number;
  endMinute: number;
  isTeaching: boolean;
}

export interface TimetableEntry {
  id: string;
  classId: string;
  subjectId: string;
  teacherUserId: string | null;
  weekday: Weekday;
  periodId: string;
  room: string | null;
  subject?: { id: string; name: string };
  class?: { id: string; name: string };
  period?: TimetablePeriod;
  teacher?: { id: string; firstName: string; lastName: string } | null;
}

const TIMETABLE_KEY = ["timetable"];

/**
 * "08:30" from 510.
 *
 * Minutes since midnight, matching the API — a period is a time-of-day that
 * recurs, so there is no date and no timezone to get wrong.
 */
export function formatMinute(minute: number): string {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** 510 from "08:30", or null if it isn't a time. Mirrors the API's parser. */
export function parseMinute(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function usePeriods() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...TIMETABLE_KEY, "periods"],
    enabled,
    queryFn: () => apiFetch<TimetablePeriod[]>("/v1/timetable/periods", { headers: authHeaders(accessToken) }),
  });
}

export function useClassTimetable(classId: string | null) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...TIMETABLE_KEY, "class", classId],
    enabled: enabled && Boolean(classId),
    queryFn: () =>
      apiFetch<TimetableEntry[]>(`/v1/timetable/classes/${classId}`, { headers: authHeaders(accessToken) }),
  });
}

export function useTeacherTimetable(teacherUserId: string | null) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...TIMETABLE_KEY, "teacher", teacherUserId],
    enabled: enabled && Boolean(teacherUserId),
    queryFn: () =>
      apiFetch<TimetableEntry[]>(`/v1/timetable/teachers/${teacherUserId}`, {
        headers: authHeaders(accessToken),
      }),
  });
}

/** A period being saved: no id yet if it is new, id if it is being kept. */
export interface PeriodDraft {
  id?: string;
  label: string;
  startMinute: number;
  endMinute: number;
  isTeaching: boolean;
}

export function useReplacePeriods() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (periods: PeriodDraft[]) =>
      apiFetch<TimetablePeriod[]>("/v1/timetable/periods", {
        method: "PUT",
        headers: authHeaders(accessToken),
        body: { periods },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TIMETABLE_KEY }),
  });
}

export interface UpsertEntryInput {
  id?: string;
  classId: string;
  subjectId: string;
  teacherUserId?: string;
  weekday: Weekday;
  periodId: string;
  room?: string;
}

export function useUpsertEntry() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UpsertEntryInput) =>
      apiFetch<TimetableEntry>(id ? `/v1/timetable/entries/${id}` : "/v1/timetable/entries", {
        method: id ? "PUT" : "POST",
        headers: authHeaders(accessToken),
        body,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TIMETABLE_KEY }),
  });
}

export function useDeleteEntry() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ deleted: boolean }>(`/v1/timetable/entries/${id}`, {
        method: "DELETE",
        headers: authHeaders(accessToken),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TIMETABLE_KEY }),
  });
}
