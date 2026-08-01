"use client";

import { useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { refreshSession } from "@/lib/refresh-session";
import { useAuthStore, type SessionUser } from "@/store/auth-store";

/** Silently exchanges the httpOnly refresh cookie for a fresh access token on first load — same pattern as apps/web. */
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
