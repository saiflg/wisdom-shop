"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export interface Session {
  id: string;
  /** "Chrome on Windows", or "Unknown device" when it cannot tell. */
  device: string;
  ipAddress: string | null;
  startedAt: string;
  lastUsedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  active: boolean;
}

export interface SessionList {
  sessions: Session[];
  summary: { active: number; revoked: number; expired: number };
}

const KEY = ["security", "sessions"];

export function useSessions() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: KEY,
    enabled,
    queryFn: () => apiFetch<SessionList>("/v1/security/sessions", { headers: authHeaders(accessToken) }),
  });
}

export function useEndSession() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ended: boolean; alreadyEnded: boolean }>(`/v1/security/sessions/${id}`, {
        method: "DELETE",
        headers: authHeaders(accessToken),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

/**
 * Signs out everywhere, including this device.
 *
 * Not "everywhere else" — the server cannot tell which session is asking, so
 * that button would be guessing about the one thing somebody using it most
 * needs to be right about.
 */
export function useSignOutEverywhere() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ ended: number }>("/v1/security/sessions/revoke-all", {
        method: "POST",
        headers: authHeaders(accessToken),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

/** Administrators only: shuts an account out without reading its devices. */
export function useSignOutUser() {
  const accessToken = useAuthQueryState().accessToken;
  return useMutation({
    mutationFn: (userId: string) =>
      apiFetch<{ ended: number }>(`/v1/security/users/${userId}/revoke-all`, {
        method: "POST",
        headers: authHeaders(accessToken),
      }),
  });
}

/** "3 days ago", roughly — precise enough for "was that me?". */
export function relativeTime(iso: string, now = new Date()): string {
  const then = new Date(iso).getTime();
  const minutes = Math.round((now.getTime() - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
