"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export type TransportDirection = "MORNING" | "AFTERNOON" | "BOTH";

export const DIRECTION_LABEL: Record<TransportDirection, string> = {
  MORNING: "Morning only",
  AFTERNOON: "Afternoon only",
  BOTH: "Both ways",
};

export interface Vehicle {
  id: string;
  label: string;
  plateNumber: string | null;
  /** Seats per run, not per day. */
  seats: number;
  driverName: string | null;
  driverPhone: string | null;
}

export interface Stop {
  id: string;
  name: string;
  position: number;
  /** Minutes from midnight; null means the school has not set one. */
  pickupMinute: number | null;
}

export interface Assignment {
  id: string;
  direction: TransportDirection;
  studentProfile: { id: string; user: { firstName: string; lastName: string } };
  stop: { id: string; name: string } | null;
}

export interface Route {
  id: string;
  name: string;
  vehicle: Vehicle | null;
  stops: Stop[];
  assignments: Assignment[];
  seats: number;
  taken: { morning: number; afternoon: number };
  /** Stops whose times run backwards along the route. Reported, not corrected. */
  stopWarnings: string[];
}

export interface StudentRide {
  id: string;
  direction: TransportDirection;
  route: { id: string; name: string; vehicle: { label: string; driverName: string | null } | null };
  stop: { id: string; name: string; pickupMinute: number | null } | null;
}

const KEY = ["transport"];

export function useRoutes() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...KEY, "routes"],
    enabled,
    queryFn: () => apiFetch<Route[]>("/v1/transport/routes", { headers: authHeaders(accessToken) }),
  });
}

export function useVehicles() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...KEY, "vehicles"],
    enabled,
    queryFn: () => apiFetch<Vehicle[]>("/v1/transport/vehicles", { headers: authHeaders(accessToken) }),
  });
}

export function useAddVehicle() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { label: string; plateNumber?: string; seats?: number; driverName?: string }) =>
      apiFetch<Vehicle>("/v1/transport/vehicles", {
        method: "POST",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useAddRoute() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; vehicleId?: string }) =>
      apiFetch<Route>("/v1/transport/routes", {
        method: "POST",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSetStops(routeId: string) {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (stops: { name: string; position?: number; pickupMinute?: number }[]) =>
      apiFetch<Route>(`/v1/transport/routes/${routeId}/stops`, {
        method: "PUT",
        headers: authHeaders(accessToken),
        body: { stops },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useAssign() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      routeId: string;
      studentProfileId: string;
      stopId?: string;
      direction: TransportDirection;
    }) =>
      apiFetch<Assignment>("/v1/transport/assignments", {
        method: "POST",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUnassign() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/v1/transport/assignments/${id}`, { method: "DELETE", headers: authHeaders(accessToken) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useStudentRides(studentProfileId: string | null) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...KEY, "student", studentProfileId],
    enabled: enabled && Boolean(studentProfileId),
    queryFn: () =>
      apiFetch<StudentRide[]>(`/v1/transport/students/${studentProfileId}`, {
        headers: authHeaders(accessToken),
      }),
  });
}

/** 390 reads as 06:30. Null is "not set", which is not midnight. */
export function formatMinute(minute: number | null): string {
  if (minute === null) return "no time set";
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

/** "06:30" to 390, or null when it is not a time. */
export function parseMinute(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const minute = Number(match[1]) * 60 + Number(match[2]);
  return minute >= 0 && minute <= 1439 ? minute : null;
}
