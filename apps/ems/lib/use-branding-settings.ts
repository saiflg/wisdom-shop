"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiError } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";
import type { Branding } from "./branding";

export const BRANDING_KEY = ["branding"];

export function useBrandingSettings() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: BRANDING_KEY,
    enabled,
    queryFn: () => apiFetch<Branding>("/v1/branding", { headers: authHeaders(accessToken) }),
  });
}

export function useUpdateBranding() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      apiFetch<Branding>("/v1/branding", {
        method: "PATCH",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BRANDING_KEY }),
  });
}

/**
 * Logo upload, which cannot go through `apiFetch`.
 *
 * That helper sets `Content-Type: application/json` and JSON-stringifies the
 * body. A multipart upload needs the browser to set the content type itself,
 * because only it knows the boundary string it generated — writing the
 * header by hand produces a body the server cannot parse.
 */
export function useUploadLogo() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData();
      body.append("file", file);

      const res = await fetch("/v1/branding/logo", {
        method: "POST",
        credentials: "include",
        headers: authHeaders(accessToken),
        body,
      });

      const data = await res.json().catch(() => undefined);
      if (!res.ok) {
        const raw = data && typeof data === "object" ? (data as { message?: unknown }).message : undefined;
        const message = Array.isArray(raw) ? raw.join(", ") : (raw as string) || res.statusText;
        throw new ApiError(res.status, message, data);
      }
      return data as Branding;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BRANDING_KEY }),
  });
}

export function useRemoveLogo() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<Branding>("/v1/branding/logo", { method: "DELETE", headers: authHeaders(accessToken) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BRANDING_KEY }),
  });
}
