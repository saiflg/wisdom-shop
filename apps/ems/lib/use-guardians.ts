"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";
import type { GuardianLink } from "./use-students";

export interface CreateGuardianInput {
  studentProfileId: string;
  relationship: string;
  email: string;
  firstName?: string;
  lastName?: string;
  password?: string;
}

export function useLinkGuardian() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGuardianInput) =>
      apiFetch<GuardianLink>("/v1/guardians", { method: "POST", headers: authHeaders(accessToken), body: input }),
    onSuccess: (_, input) => {
      queryClient.invalidateQueries({ queryKey: ["students", input.studentProfileId] });
      queryClient.invalidateQueries({ queryKey: ["students"] });
    },
  });
}

export function useUnlinkGuardian() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (linkId: string) =>
      apiFetch<void>(`/v1/guardians/${linkId}`, { method: "DELETE", headers: authHeaders(accessToken) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["students"] }),
  });
}
