import { apiFetch } from "@/lib/api";

/**
 * The single place allowed to exchange the refresh cookie — collapses
 * concurrent calls (React StrictMode double-invokes effects) into one
 * in-flight request, same reasoning as apps/web's copy of this file: a
 * rotated-out refresh token is treated as theft, so two concurrent
 * refreshes for the same cookie would revoke every session.
 */
let inFlight: Promise<{ accessToken: string }> | null = null;

export function refreshSession(): Promise<{ accessToken: string }> {
  if (!inFlight) {
    inFlight = apiFetch<{ accessToken: string }>("/v1/auth/refresh", {
      method: "POST",
      csrf: true,
    }).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}
