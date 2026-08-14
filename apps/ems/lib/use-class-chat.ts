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
