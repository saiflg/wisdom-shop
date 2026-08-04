"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export type MessageChannel = "EMAIL" | "SMS" | "WHATSAPP" | "PUSH";
export type MessageStatus = "QUEUED" | "SENT" | "FAILED" | "SKIPPED";
export type MessageEvent =
  | "ATTENDANCE_ABSENT"
  | "FEE_INVOICE_ISSUED"
  | "FEE_INVOICE_OVERDUE"
  | "RESULTS_PUBLISHED"
  | "MANUAL";

export interface MessageTemplate {
  id: string;
  event: MessageEvent;
  channel: MessageChannel;
  subject: string | null;
  body: string;
  enabled: boolean;
}

export interface OutboxMessage {
  id: string;
  event: MessageEvent;
  channel: MessageChannel;
  recipientName: string;
  recipientAddress: string;
  subject: string | null;
  body: string;
  status: MessageStatus;
  statusReason: string | null;
  attempts: number;
  sentAt: string | null;
  createdAt: string;
  studentProfile?: { id: string; user: { firstName: string; lastName: string } } | null;
}

/**
 * What each event can put in a message.
 *
 * Mirrors EVENT_PLACEHOLDERS on the API so the editor can offer an accurate
 * palette. The API validates independently — this copy is a convenience for
 * the person typing, never the thing that enforces the rule.
 */
export const EVENT_PLACEHOLDERS: Record<MessageEvent, string[]> = {
  ATTENDANCE_ABSENT: ["schoolName", "guardianName", "studentName", "className", "date"],
  FEE_INVOICE_ISSUED: ["schoolName", "guardianName", "studentName", "invoiceNumber", "amount", "dueDate"],
  FEE_INVOICE_OVERDUE: ["schoolName", "guardianName", "studentName", "invoiceNumber", "amount", "dueDate"],
  RESULTS_PUBLISHED: ["schoolName", "guardianName", "studentName", "term", "academicYear", "className"],
  MANUAL: ["schoolName", "guardianName", "studentName"],
};

const MESSAGING_KEY = ["messaging"];

/** Every distinct `{{placeholder}}` a template refers to, in first-seen order. */
export function extractPlaceholders(template: string): string[] {
  const seen: string[] = [];
  for (const match of template.matchAll(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g)) {
    const name = match[1] as string;
    if (!seen.includes(name)) seen.push(name);
  }
  return seen;
}

/**
 * Placeholders a template uses that its event cannot supply.
 *
 * Shown as you type so the mistake is visible before saving, rather than
 * arriving as a 400 after. The API is still the authority.
 */
export function unknownPlaceholders(body: string, event: MessageEvent): string[] {
  const allowed = EVENT_PLACEHOLDERS[event] ?? [];
  return extractPlaceholders(body).filter((name) => !allowed.includes(name));
}

export function useMessageTemplates() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...MESSAGING_KEY, "templates"],
    enabled,
    queryFn: () => apiFetch<MessageTemplate[]>("/v1/messaging/templates", { headers: authHeaders(accessToken) }),
  });
}

export function useOutbox(status?: MessageStatus) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...MESSAGING_KEY, "outbox", status ?? "all"],
    enabled,
    queryFn: () =>
      apiFetch<OutboxMessage[]>(`/v1/messaging/outbox${status ? `?status=${status}` : ""}`, {
        headers: authHeaders(accessToken),
      }),
  });
}

export function useUpdateTemplate() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; subject?: string; body?: string; enabled?: boolean }) =>
      apiFetch<MessageTemplate>(`/v1/messaging/templates/${input.id}`, {
        method: "PATCH",
        headers: authHeaders(accessToken),
        body: { subject: input.subject, body: input.body, enabled: input.enabled },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MESSAGING_KEY }),
  });
}

export function useRetryMessage() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<OutboxMessage>(`/v1/messaging/outbox/${id}/retry`, {
        method: "POST",
        headers: authHeaders(accessToken),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MESSAGING_KEY }),
  });
}
