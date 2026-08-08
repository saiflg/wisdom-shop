"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { platformAuthHeaders, usePlatformAuthStore } from "@/store/platform-auth-store";

function useToken() {
  return usePlatformAuthStore((s) => s.accessToken);
}

function useAuthed() {
  return usePlatformAuthStore((s) => s.status === "authenticated" && Boolean(s.accessToken));
}

export type AiProvider =
  | "OPENROUTER"
  | "OPENAI"
  | "ANTHROPIC"
  | "GOOGLE_GEMINI"
  | "OPENAI_COMPATIBLE";

export interface ProviderOption {
  id: AiProvider;
  label: string;
  defaultModel: string;
  keyUrl: string | null;
  needsBaseUrl: boolean;
}

export interface AiSettings {
  provider: AiProvider;
  model: string;
  baseUrl: string | null;
  enabled: boolean;
  /** Whether a key is stored — never the key itself. */
  hasApiKey: boolean;
  apiKeyMasked: string | null;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastTestError: string | null;
}

const AI_KEY = ["platform", "ai"];

export function useAiProviders() {
  const token = useToken();
  const enabled = useAuthed();
  return useQuery({
    queryKey: [...AI_KEY, "providers"],
    enabled,
    queryFn: () => apiFetch<ProviderOption[]>("/v1/platform/ai/providers", { headers: platformAuthHeaders(token) }),
  });
}

export function useAiSettings() {
  const token = useToken();
  const enabled = useAuthed();
  return useQuery({
    queryKey: [...AI_KEY, "settings"],
    enabled,
    queryFn: () => apiFetch<AiSettings>("/v1/platform/ai/settings", { headers: platformAuthHeaders(token) }),
  });
}

export interface SaveAiSettingsInput {
  provider: AiProvider;
  model?: string;
  baseUrl?: string;
  /** Omit to keep the stored key; empty string clears it. */
  apiKey?: string;
  enabled?: boolean;
}

export function useSaveAiSettings() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveAiSettingsInput) =>
      apiFetch<AiSettings>("/v1/platform/ai/settings", {
        method: "PUT",
        headers: platformAuthHeaders(token),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: AI_KEY }),
  });
}

export function useTestAiConnection() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean; message: string; model: string }>("/v1/platform/ai/test", {
        method: "POST",
        headers: platformAuthHeaders(token),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: AI_KEY }),
  });
}

