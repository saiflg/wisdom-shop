"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export type CurriculumMode = "MANUAL" | "AI_AUTOMATIC" | "HYBRID";

export interface CurriculumSettings {
  id: string;
  mode: CurriculumMode;
  country: string | null;
  curriculumStandard: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateCurriculumSettingsInput {
  mode?: CurriculumMode;
  country?: string;
  curriculumStandard?: string;
}

const CURRICULUM_SETTINGS_KEY = ["curriculum-settings"];

export function useCurriculumSettings() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: CURRICULUM_SETTINGS_KEY,
    enabled,
    queryFn: () => apiFetch<CurriculumSettings>("/v1/curriculum-settings", { headers: authHeaders(accessToken) }),
  });
}

export function useUpdateCurriculumSettings() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateCurriculumSettingsInput) =>
      apiFetch<CurriculumSettings>("/v1/curriculum-settings", {
        method: "PATCH",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CURRICULUM_SETTINGS_KEY }),
  });
}
