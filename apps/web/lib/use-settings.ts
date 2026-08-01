"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { useAuthStore } from "@/store/auth-store";

export interface SettingEntry {
  key: string;
  group: string;
  label: string;
  help?: string;
  type: "string" | "number" | "email" | "boolean" | "url";
  secret: boolean;
  placeholder?: string;
  configured: boolean;
  /** Masked for secrets — never the real value. */
  value: string | null;
  source: "database" | "environment" | "unset";
}

export interface SettingGroup {
  id: string;
  label: string;
  description: string;
}

interface SettingsResponse {
  groups: SettingGroup[];
  settings: SettingEntry[];
}

const SETTINGS_KEY = ["admin-settings"];

function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function useSettings() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const isSuperAdmin = user?.roles.includes("SUPER_ADMIN") ?? false;

  return useQuery({
    queryKey: SETTINGS_KEY,
    // Only a super admin may read this; asking as anyone else just produces a
    // 403 and a scary error panel.
    enabled: Boolean(accessToken) && isSuperAdmin,
    queryFn: () => apiFetch<SettingsResponse>("/v1/admin/settings", { headers: authHeaders(accessToken) }),
  });
}

export function useUpdateSettings() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (values: Record<string, string>) =>
      apiFetch<SettingsResponse>("/v1/admin/settings", {
        method: "PUT",
        headers: authHeaders(accessToken),
        body: { values },
      }),
    onSuccess: (data) => {
      // Seed the cache from the response rather than refetching: the response
      // already carries the new masked values.
      queryClient.setQueryData(SETTINGS_KEY, data);
    },
  });
}

export function useTestEmail() {
  const accessToken = useAuthStore((s) => s.accessToken);

  return useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean; message: string }>("/v1/admin/settings/email/test", {
        method: "POST",
        headers: authHeaders(accessToken),
      }),
  });
}

/** Public — no auth, no admin gate. Missing keys mean "hide that icon". */
export function useSocialLinks() {
  return useQuery({
    queryKey: ["social-links"],
    queryFn: () => apiFetch<Record<string, string>>("/v1/settings/social"),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateUser() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      roles?: string[];
      markEmailVerified?: boolean;
    }) =>
      apiFetch<{ id: string; email: string; roles: string[] }>("/v1/admin/users", {
        method: "POST",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });
}
