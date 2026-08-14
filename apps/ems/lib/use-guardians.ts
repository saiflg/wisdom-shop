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
  /** False means the account exists but has never been set up. */
  hasPassword: boolean;
  children: GuardianChild[];
}

export type InvitationState = "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";

export interface GuardianInvitation {
  id: string;
  state: InvitationState;
  /** Words, never a timestamp — "Expires in 5 days". */
  expiresIn: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  sentByName: string | null;
  createdAt: string;
}

export interface CreatedInvitation {
  id: string;
  guardian: { id: string; name: string; email: string };
  /** Shown once. No route returns this again. */
  url: string;
  expiresIn: string;
  supersededCount: number;
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

export function useGuardianInvitations(guardianUserId: string | null) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: ["guardians", guardianUserId, "invitations"],
    enabled: enabled && Boolean(guardianUserId),
    queryFn: () =>
      apiFetch<GuardianInvitation[]>(`/v1/guardians/${guardianUserId}/invitations`, {
        headers: authHeaders(accessToken),
      }),
  });
}

/**
 * Create an invitation and get the link back.
 *
 * The link is in the response and nowhere else — deliberately not cached,
 * because a one-time credential sitting in a query cache is a one-time
 * credential that outlives the moment it was needed.
 */
export function useInviteGuardian() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (guardianUserId: string) =>
      apiFetch<CreatedInvitation>(`/v1/guardians/${guardianUserId}/invitations`, {
        method: "POST",
        headers: authHeaders(accessToken),
      }),
    onSuccess: (_, guardianUserId) =>
      queryClient.invalidateQueries({ queryKey: ["guardians", guardianUserId, "invitations"] }),
  });
}

export function useRevokeInvitation(guardianUserId: string) {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: string) =>
      apiFetch<GuardianInvitation[]>(`/v1/guardians/invitations/${invitationId}`, {
        method: "DELETE",
        headers: authHeaders(accessToken),
      }),
    onSuccess: (invitations) =>
      queryClient.setQueryData(["guardians", guardianUserId, "invitations"], invitations),
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
