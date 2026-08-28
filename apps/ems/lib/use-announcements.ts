"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export const AUDIENCES = [
  { value: "WHOLE_SCHOOL", label: "Everyone — all parents and all staff" },
  { value: "ALL_PARENTS", label: "All parents" },
  { value: "ALL_STAFF", label: "All staff" },
  { value: "CLASS", label: "The parents of one class" },
] as const;

export interface AnnouncementInput {
  title: string;
  body: string;
  audience: string;
  classId?: string;
  channels: string[];
}

export interface ChannelPlan {
  channel: "EMAIL" | "SMS";
  reach: number;
  summary: string;
  /** Shown before sending — text messages cost money and cannot be recalled. */
  warning: string | null;
  examples: string[];
  skipped: { userId: string; name: string; reason: string }[];
  skippedCount: number;
}

export interface AnnouncementPreview {
  audience: string;
  channels: ChannelPlan[];
  totalSends: number;
}

export interface SentAnnouncement {
  id: string;
  title: string;
  body: string;
  audience: string;
  audienceLabel: string;
  channels: string[];
  reached: number;
  skipped: number;
  sentByName: string | null;
  /** Null while it is a draft — a draft has been written, not sent. */
  sentAt: string | null;
  status: "DRAFT" | "SENT";
}

/** A draft only needs a title; the rest can be finished another day. */
export interface DraftInput {
  title: string;
  body?: string;
  audience?: string;
  classId?: string;
  channels?: string[];
}

export interface AnnouncementDetail {
  id: string;
  deliveries: {
    id: string;
    channel: string;
    recipientName: string;
    recipientAddress: string;
    status: string;
    statusReason: string | null;
    sentAt: string | null;
  }[];
  byStatus: Record<string, number>;
}

const KEY = ["announcements"];

export function useAnnouncements() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: KEY,
    enabled,
    queryFn: () => apiFetch<SentAnnouncement[]>("/v1/messaging/announcements", { headers: authHeaders(accessToken) }),
  });
}

export function useAnnouncementDetail(id: string | null) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...KEY, id],
    enabled: enabled && Boolean(id),
    queryFn: () =>
      apiFetch<AnnouncementDetail>(`/v1/messaging/announcements/${id}`, { headers: authHeaders(accessToken) }),
  });
}

/** Sends nothing. Used to show the count before the button. */
export function usePreviewAnnouncement() {
  const { accessToken } = useAuthQueryState();
  return useMutation({
    mutationFn: (input: AnnouncementInput) =>
      apiFetch<AnnouncementPreview>("/v1/messaging/announcements/preview", {
        method: "POST",
        headers: authHeaders(accessToken),
        body: input,
      }),
  });
}

export function useSendAnnouncement() {
  const { accessToken } = useAuthQueryState();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AnnouncementInput) =>
      apiFetch<{ id: string; title: string; sent: number; duplicates: number; reached: number }>(
        "/v1/messaging/announcements",
        { method: "POST", headers: authHeaders(accessToken), body: input },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSaveDraft() {
  const { accessToken } = useAuthQueryState();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DraftInput) =>
      apiFetch<SentAnnouncement>("/v1/messaging/announcements/drafts", {
        method: "POST",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateDraft(id: string) {
  const { accessToken } = useAuthQueryState();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DraftInput) =>
      apiFetch<SentAnnouncement>(`/v1/messaging/announcements/drafts/${id}`, {
        method: "PATCH",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSendDraft(id: string) {
  const { accessToken } = useAuthQueryState();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ id: string; title: string; sent: number; duplicates: number; reached: number }>(
        `/v1/messaging/announcements/drafts/${id}/send`,
        { method: "POST", headers: authHeaders(accessToken) },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDiscardDraft() {
  const { accessToken } = useAuthQueryState();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/v1/messaging/announcements/drafts/${id}`, {
        method: "DELETE",
        headers: authHeaders(accessToken),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
