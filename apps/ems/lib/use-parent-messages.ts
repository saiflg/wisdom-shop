"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export interface ParentThreadSummary {
  studentProfileId: string;
  studentUserId: string;
  studentName: string;
  className: string | null;
  lastMessageAt: string | null;
  lastSide: string | null;
  /** The family spoke last, so the school owes a reply. */
  awaitingSchool: boolean;
  preview: string | null;
}

export interface ParentMessage {
  id: string;
  authorName: string;
  side: string;
  body: string;
  createdAt: string;
  deleted: boolean;
  mine: boolean;
}

export interface ParentThread {
  studentProfileId: string;
  studentName: string;
  canPost: boolean;
  youAre: "FAMILY" | "SCHOOL";
  messages: ParentMessage[];
}

export function useParentThreads() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: ["parent-messages"],
    enabled,
    refetchInterval: 30_000,
    queryFn: () => apiFetch<ParentThreadSummary[]>("/v1/parent-messages", { headers: authHeaders(accessToken) }),
  });
}

export function useParentThread(studentProfileId: string | null) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: ["parent-messages", studentProfileId],
    enabled: enabled && Boolean(studentProfileId),
    refetchInterval: 15_000,
    queryFn: () =>
      apiFetch<ParentThread>(`/v1/parent-messages/${studentProfileId}`, { headers: authHeaders(accessToken) }),
  });
}

export function usePostParentMessage(studentProfileId: string) {
  const { accessToken } = useAuthQueryState();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      apiFetch<ParentMessage>(`/v1/parent-messages/${studentProfileId}`, {
        method: "POST",
        headers: authHeaders(accessToken),
        body: { body },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["parent-messages"] });
    },
  });
}

export function useWithdrawParentMessage(studentProfileId: string) {
  const { accessToken } = useAuthQueryState();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) =>
      apiFetch<ParentMessage>(`/v1/parent-messages/messages/${messageId}`, {
        method: "DELETE",
        headers: authHeaders(accessToken),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["parent-messages", studentProfileId] });
    },
  });
}
