"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export type ReadingSupport = "NONE" | "SIMPLIFIED" | "STEP_BY_STEP";

export interface AccessibilityProfile {
  userId: string;
  largeText: boolean;
  highContrast: boolean;
  dyslexiaFont: boolean;
  reduceMotion: boolean;
  readingSupport: ReadingSupport;
  describeVisuals: boolean;
  requireCaptions: boolean;
  /** Staff only. Absent for everyone else, not blank — the API never sends it. */
  notes?: string | null;
}

export type UpdateAccessibilityInput = Partial<Omit<AccessibilityProfile, "userId">>;

const KEY = ["accessibility"];

export function useAccessibility() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...KEY, "me"],
    enabled,
    // These preferences shape every page, so they are worth keeping warm
    // rather than refetching on each navigation.
    staleTime: 5 * 60 * 1000,
    queryFn: () => apiFetch<AccessibilityProfile>("/v1/accessibility/me", { headers: authHeaders(accessToken) }),
  });
}

export function useUpdateAccessibility() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateAccessibilityInput) =>
      apiFetch<AccessibilityProfile>("/v1/accessibility/me", {
        method: "PUT",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useStudentAccessibility(userId: string | null) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...KEY, "user", userId],
    enabled: enabled && Boolean(userId),
    queryFn: () =>
      apiFetch<AccessibilityProfile>(`/v1/accessibility/users/${userId}`, { headers: authHeaders(accessToken) }),
  });
}

export function useUpdateStudentAccessibility(userId: string) {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateAccessibilityInput) =>
      apiFetch<AccessibilityProfile>(`/v1/accessibility/users/${userId}`, {
        method: "PUT",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
