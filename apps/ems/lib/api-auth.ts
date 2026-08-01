"use client";

import { useAuthStore } from "@/store/auth-store";

export function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function useAuthQueryState() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const status = useAuthStore((s) => s.status);
  return { accessToken, enabled: status === "authenticated" && Boolean(accessToken) };
}
