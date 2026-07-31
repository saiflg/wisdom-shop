"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { useAuthStore } from "@/store/auth-store";
import type { Address } from "./order-types";

function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function useAuthed() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const status = useAuthStore((s) => s.status);
  return { accessToken, enabled: status === "authenticated" && Boolean(accessToken) };
}

// ── Security ─────────────────────────────────────────────────────────

export function useChangePassword() {
  const accessToken = useAuthStore((s) => s.accessToken);
  return useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      apiFetch<void>("/v1/auth/change-password", {
        method: "POST",
        headers: authHeaders(accessToken),
        body,
      }),
  });
}

export interface TwoFactorSetup {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
}

export function useStartTwoFactorSetup() {
  const accessToken = useAuthStore((s) => s.accessToken);
  return useMutation({
    mutationFn: () =>
      apiFetch<TwoFactorSetup>("/v1/auth/2fa/setup", {
        method: "POST",
        headers: authHeaders(accessToken),
      }),
  });
}

export function useEnableTwoFactor() {
  const accessToken = useAuthStore((s) => s.accessToken);
  return useMutation({
    mutationFn: (body: { code: string }) =>
      apiFetch<{ recoveryCodes: string[] }>("/v1/auth/2fa/enable", {
        method: "POST",
        headers: authHeaders(accessToken),
        body,
      }),
  });
}

export function useDisableTwoFactor() {
  const accessToken = useAuthStore((s) => s.accessToken);
  return useMutation({
    mutationFn: (body: { code: string; password: string }) =>
      apiFetch<void>("/v1/auth/2fa/disable", {
        method: "POST",
        headers: authHeaders(accessToken),
        body,
      }),
  });
}

// ── Addresses ────────────────────────────────────────────────────────

export function useMyAddresses() {
  const { accessToken, enabled } = useAuthed();
  return useQuery({
    queryKey: ["addresses"],
    enabled,
    queryFn: () => apiFetch<Address[]>("/v1/addresses", { headers: authHeaders(accessToken) }),
  });
}

export function useDeleteAddress() {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/v1/addresses/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: authHeaders(accessToken),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["addresses"] }),
  });
}

export function useSetDefaultAddress() {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<Address>(`/v1/addresses/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: authHeaders(accessToken),
        body: { isDefault: true },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["addresses"] }),
  });
}

// ── Licenses ─────────────────────────────────────────────────────────

export interface License {
  id: string;
  key: string;
  status: "ACTIVE" | "REVOKED" | "EXPIRED";
  seats: number;
  expiresAt: string | null;
  createdAt: string;
  product: { id: string; title: string; slug: string; type: string };
  order: { orderNumber: string; createdAt: string };
}

export function useMyLicenses() {
  const { accessToken, enabled } = useAuthed();
  return useQuery({
    queryKey: ["licenses"],
    enabled,
    queryFn: () => apiFetch<License[]>("/v1/licenses", { headers: authHeaders(accessToken) }),
  });
}

/**
 * Requests the signed handoff into the separate EMS onboarding portal. The
 * URL is short-lived, so it's fetched on click rather than rendered into the
 * page ahead of time.
 */
export function useSetupHandoff() {
  const accessToken = useAuthStore((s) => s.accessToken);
  return useMutation({
    mutationFn: (key: string) =>
      apiFetch<{ redirectUrl: string; expiresInSeconds: number }>(
        `/v1/licenses/${encodeURIComponent(key)}/setup-handoff`,
        { method: "POST", headers: authHeaders(accessToken) },
      ),
  });
}
