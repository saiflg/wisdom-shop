"use client";

import { useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { refreshSession } from "@/lib/refresh-session";
import { useAuthStore, type SessionUser } from "@/store/auth-store";

/**
 * Silently exchanges the httpOnly refresh cookie (if any) for a fresh
 * access token on first load, so a page refresh doesn't look logged out
 * just because the in-memory access token was lost.
 *
 * Goes through `refreshSession()` rather than calling the endpoint directly:
 * refresh tokens rotate and reuse is treated as theft, so two concurrent
 * refreshes revoke the user's sessions. React StrictMode runs this effect
 * twice, which is exactly two concurrent refreshes.
 */
export function SessionBootstrap() {
  const setSession = useAuthStore((s) => s.setSession);
  const clearSession = useAuthStore((s) => s.clearSession);
  const setStatus = useAuthStore((s) => s.setStatus);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setStatus("loading");
      try {
        const refreshed = await refreshSession();
        const user = await apiFetch<SessionUser>("/v1/auth/me", {
          headers: { Authorization: `Bearer ${refreshed.accessToken}` },
        });
        if (!cancelled) setSession(refreshed.accessToken, user);
      } catch {
        if (!cancelled) clearSession();
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [setSession, clearSession, setStatus]);

  return null;
}
