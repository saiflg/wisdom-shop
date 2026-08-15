"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

/**
 * Whether somebody is about.
 *
 * Words, never a timestamp: the API deliberately never sends one, so a
 * classmate cannot read back what time a child was online.
 */
export interface Presence {
  presence: "ONLINE" | "RECENTLY" | "AWAY";
  online: boolean;
  label: string;
}

export interface ClassMember extends Presence {
  id: string;
  studentProfileId: string;
  name: string;
  /** Staff only; null for classmates. A class list is not a contact list. */
  studentCode: string | null;
}

export interface ClassMembers {
  class: { id: string; name: string; gradeLevel: string | null; academicYear: string };
  classTeacher: ({ id: string; name: string } & Presence) | null;
  subjectTeachers: ({ id: string; name: string; subject: string } & Presence)[];
  leadership: { id: string; name: string; role: string; jobTitle: string | null }[];
  /** Online first, then alphabetical — sorted by the API. */
  students: ClassMember[];
  you: {
    canPost: boolean;
    isStaff: boolean;
    /** Why not, in words a teacher can act on. Null when they can post. */
    cannotPostReason: string | null;
  };
}

export interface ChatAttachment {
  id: string;
  kind: "IMAGE" | "AUDIO" | "DOCUMENT";
  contentType: string;
  byteSize: number;
  displayName: string;
  /** Voice notes only. */
  durationSeconds: number | null;
  /** Authorised route — needs the bearer token, so it is fetched, not linked. */
  url: string;
}

export interface ChatMessage {
  id: string;
  authorUserId: string;
  authorName: string;
  authorRole: string;
  body: string;
  createdAt: string;
  deleted: boolean;
  /** Staff only: what a removed message actually said. */
  removedBody?: string;
  /** Always present; empty for a message with nothing attached or removed. */
  attachments: ChatAttachment[];
  mine: boolean;
}

export interface Conversation {
  conversationId: string;
  locked: boolean;
  lockedReason: string | null;
  /** Shown to students, verbatim, above the messages. */
  notice: string;
  canPost: boolean;
  /** Why not, in words the reader can act on. Null when they can post. */
  cannotPostReason: string | null;
  canModerate: boolean;
  messages: ChatMessage[];
  hasMore: boolean;
}

export interface MyClass {
  id: string;
  name: string;
  gradeLevel: string | null;
  academicYear: string;
}

/**
 * The classes this person is in.
 *
 * Kept for the session — a student's enrolment does not change while they are
 * sitting in a lesson, and refetching it on every window focus would be a
 * request per tab switch to learn nothing.
 */
export function useMyClasses() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: ["classes", "mine"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: () => apiFetch<MyClass[]>("/v1/classes/mine", { headers: authHeaders(accessToken) }),
  });
}

export function useClassMembers(classId: string) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: ["class", classId, "members"],
    enabled: enabled && Boolean(classId),
    queryFn: () => apiFetch<ClassMembers>(`/v1/classes/${classId}/members`, { headers: authHeaders(accessToken) }),
  });
}

/**
 * The conversation, polled while the page is open.
 *
 * Polling rather than websockets: a class chat that updates within a few
 * seconds is a chat, and a socket server is a deployment concern this does
 * not need yet. Revisit when a school complains it feels slow, not before.
 */
export function useConversation(classId: string) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: ["class", classId, "chat"],
    enabled: enabled && Boolean(classId),
    refetchInterval: 5000,
    queryFn: () => apiFetch<Conversation>(`/v1/classes/${classId}/chat`, { headers: authHeaders(accessToken) }),
  });
}

export function usePostMessage(classId: string) {
  const { accessToken } = useAuthQueryState();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      apiFetch<ChatMessage>(`/v1/classes/${classId}/chat`, {
        method: "POST",
        headers: authHeaders(accessToken),
        body: { body },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["class", classId, "chat"] }),
  });
}

/**
 * Post with a photograph, voice note or PDF.
 *
 * One request carrying both, matching the API: uploading first and then
 * referencing the result would mean the server trusting a client's account of
 * what the file is.
 */
export function usePostMessageWithFile(classId: string) {
  const { accessToken } = useAuthQueryState();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ body, file, durationSeconds }: { body: string; file: File; durationSeconds?: number }) => {
      const form = new FormData();
      if (body.trim()) form.append("body", body.trim());
      if (durationSeconds) form.append("durationSeconds", String(Math.round(durationSeconds)));
      form.append("file", file, file.name);

      // No Content-Type header: the browser must set it, because only it
      // knows the multipart boundary it generated.
      return apiFetch<ChatMessage>(`/v1/classes/${classId}/chat/file`, {
        method: "POST",
        headers: authHeaders(accessToken),
        body: form,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["class", classId, "chat"] }),
  });
}

/**
 * Fetch an attachment's bytes as a blob URL.
 *
 * These are authorised routes, so an <img src> pointing straight at one would
 * arrive without the bearer token and 401. The bytes are fetched with the
 * token and turned into an object URL the browser can render.
 */
export async function fetchAttachment(url: string, accessToken: string | null): Promise<string> {
  const res = await fetch(url, { headers: authHeaders(accessToken) as HeadersInit });
  if (!res.ok) throw new Error("Couldn't load that file.");
  return URL.createObjectURL(await res.blob());
}

export function useRemoveMessage(classId: string) {
  const { accessToken } = useAuthQueryState();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) =>
      apiFetch<ChatMessage>(`/v1/class-messages/${messageId}`, {
        method: "DELETE",
        headers: authHeaders(accessToken),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["class", classId, "chat"] }),
  });
}

export function useReportMessage(classId: string) {
  const { accessToken } = useAuthQueryState();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, reason }: { messageId: string; reason: string }) =>
      apiFetch<{ reported: boolean; message: string }>(`/v1/class-messages/${messageId}/report`, {
        method: "POST",
        headers: authHeaders(accessToken),
        body: { reason },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["class", classId, "chat"] }),
  });
}

export function useLockConversation(classId: string) {
  const { accessToken } = useAuthQueryState();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ locked, reason }: { locked: boolean; reason?: string }) =>
      apiFetch<{ locked: boolean }>(`/v1/classes/${classId}/chat/lock`, {
        method: "PUT",
        headers: authHeaders(accessToken),
        body: { locked, ...(reason ? { reason } : {}) },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["class", classId, "chat"] }),
  });
}
