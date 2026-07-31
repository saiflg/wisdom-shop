"use client";

import { useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { useAuthStore, type SessionUser } from "@/store/auth-store";

/**
 * Silently exchanges the httpOnly refresh cookie (if any) for a fresh
 * access token on first load, so a page refresh doesn't look logged out
 * just because the in-memory access token was lost.
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
        const refreshed = await apiFetch<{ accessToken: string }>("/v1/auth/refresh", {
          method: "POST",
          csrf: true,
        });
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
