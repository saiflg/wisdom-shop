import { apiFetch } from "@/lib/api";

/**
 * The single place allowed to exchange the refresh cookie.
 *
 * Refresh tokens rotate, and presenting a rotated-out token is treated by the
 * API as theft: it revokes every session the user has. That is the correct
 * response to a stolen token — but it means the client must never send two
 * refreshes for the same cookie, because the second one carries a token the
 * first already retired.
 *
 * This is not hypothetical. React StrictMode double-invokes effects in
 * development, so `SessionBootstrap` fired two concurrent refreshes on every
 * page load, the API logged `auth.refresh_token_reuse_detected` twice a
 * millisecond apart, and the user was signed out by the act of loading a
 * page. The same race is reachable in production without StrictMode whenever
 * two refreshes overlap — most obviously two tabs opened at once.
 *
 * Collapsing them to one in-flight request fixes it at the source rather than
 * by making the server more forgiving about token reuse.
 */
let inFlight: Promise<{ accessToken: string }> | null = null;

export function refreshSession(): Promise<{ accessToken: string }> {
  if (!inFlight) {
    inFlight = apiFetch<{ accessToken: string }>("/v1/auth/refresh", {
      method: "POST",
      csrf: true,
    }).finally(() => {
      // Cleared on settle, not on success: a failed refresh must not leave a
      // rejected promise cached for every later caller to trip over.
      inFlight = null;
    });
  }
  return inFlight;
}
