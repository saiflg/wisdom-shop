"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";
import type { GuardianLink } from "./use-students";

export interface GuardianChild {
  linkId: string;
  studentProfileId: string;
  name: string;
  className: string | null;
  relationship: string;
}

export interface GuardianEntry {
  guardianUserId: string;
  firstName: string;
  lastName: string;
  /** Null for a parent recorded from paper with only a phone number. */
  email: string | null;
  children: GuardianChild[];
}

/**
 * Every family in the school, one entry per guardian rather than per child.
 *
 * The API does the collapsing, so a parent of three arrives once with three
 * children attached.
 */
export function useGuardianDirectory() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: ["guardians"],
    enabled,
    queryFn: () => apiFetch<GuardianEntry[]>("/v1/guardians", { headers: authHeaders(accessToken) }),
  });
}

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
