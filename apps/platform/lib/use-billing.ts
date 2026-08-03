"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { platformAuthHeaders, usePlatformAuthStore } from "@/store/platform-auth-store";

export type BillingInterval = "MONTHLY" | "YEARLY";
export type SubscriptionStatus = "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED";
export type InvoiceStatus = "DRAFT" | "OPEN" | "PAID" | "VOID" | "UNCOLLECTIBLE";

export interface Plan {
  id: string;
  code: string;
  name: string;
  priceCents: number;
  currency: string;
  interval: BillingInterval;
  maxStudents: number | null;
  maxStaff: number | null;
  isActive: boolean;
}

export interface Subscription {
  id: string;
  schoolId: string;
  planId: string;
  plan: Plan;
  status: SubscriptionStatus;
  priceCents: number;
  currency: string;
  interval: BillingInterval;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialEndsAt: string | null;
  canceledAt: string | null;
}

export interface InvoiceLine {
  id: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
}

export interface Invoice {
  number: string;
  schoolId: string;
  school?: { name: string; slug: string };
  status: InvoiceStatus;
  currency: string;
  subtotalCents: number;
  totalCents: number;
  periodStart: string;
  periodEnd: string;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  lines: InvoiceLine[];
}

export interface RevenueSummary {
  collected: { currency: string; amountCents: number }[];
  outstanding: { currency: string; amountCents: number }[];
  subscriptions: { status: SubscriptionStatus; count: number }[];
}

/**
 * Mirrors the API's formatter. Amounts are integer minor units end to end —
 * they are never converted to a float on the way to the screen.
 */
export function formatMoney(amountCents: number, currency: string): string {
  const negative = amountCents < 0;
  const absolute = Math.abs(amountCents);
  const major = Math.trunc(absolute / 100);
  const minor = absolute % 100;
  return `${negative ? "-" : ""}${currency} ${major.toLocaleString("en-US")}.${String(minor).padStart(2, "0")}`;
}

const PLANS_KEY = ["platform", "plans"];
const INVOICES_KEY = ["platform", "invoices"];
const REVENUE_KEY = ["platform", "revenue"];
const SUBSCRIPTION_KEY = ["platform", "subscription"];

function useToken() {
  return usePlatformAuthStore((s) => s.accessToken);
}
function useAuthed() {
  return usePlatformAuthStore((s) => s.status === "authenticated" && Boolean(s.accessToken));
}

export function usePlans() {
  const token = useToken();
  const enabled = useAuthed();
  return useQuery({
    queryKey: PLANS_KEY,
    enabled,
    queryFn: () => apiFetch<Plan[]>("/v1/platform/billing/plans", { headers: platformAuthHeaders(token) }),
  });
}

export function useCreatePlan() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      apiFetch<Plan>("/v1/platform/billing/plans", {
        method: "POST",
        headers: platformAuthHeaders(token),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PLANS_KEY }),
  });
}

export function useUpdatePlan(planId: string) {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      apiFetch<Plan>(`/v1/platform/billing/plans/${planId}`, {
        method: "PATCH",
        headers: platformAuthHeaders(token),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PLANS_KEY }),
  });
}

export function useSubscription(schoolId: string | null) {
  const token = useToken();
  const enabled = useAuthed();
  return useQuery({
    queryKey: [...SUBSCRIPTION_KEY, schoolId],
    enabled: enabled && Boolean(schoolId),
    queryFn: () =>
      apiFetch<Subscription | null>(`/v1/platform/billing/schools/${schoolId}/subscription`, {
        headers: platformAuthHeaders(token),
      }),
  });
}

export function useSubscribeSchool(schoolId: string) {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { planId: string; trialDays?: number }) =>
      apiFetch<Subscription>(`/v1/platform/billing/schools/${schoolId}/subscription`, {
        method: "POST",
        headers: platformAuthHeaders(token),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_KEY }),
  });
}

export function useSubscriptionAction(schoolId: string, action: "activate" | "past-due" | "cancel") {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<Subscription>(`/v1/platform/billing/schools/${schoolId}/subscription/${action}`, {
        method: "PATCH",
        headers: platformAuthHeaders(token),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_KEY }),
  });
}

export function useInvoices(schoolId?: string) {
  const token = useToken();
  const enabled = useAuthed();
  const search = schoolId ? `?schoolId=${encodeURIComponent(schoolId)}` : "";
  return useQuery({
    queryKey: [...INVOICES_KEY, { schoolId }],
    enabled,
    queryFn: () => apiFetch<Invoice[]>(`/v1/platform/billing/invoices${search}`, { headers: platformAuthHeaders(token) }),
  });
}

export function useGenerateInvoice(schoolId: string) {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<Invoice>(`/v1/platform/billing/schools/${schoolId}/invoices`, {
        method: "POST",
        headers: platformAuthHeaders(token),
        body: {},
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INVOICES_KEY });
      queryClient.invalidateQueries({ queryKey: REVENUE_KEY });
    },
  });
}

export function useInvoiceAction(invoiceNumber: string, action: "issue" | "pay" | "void" | "uncollectible") {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<Invoice>(`/v1/platform/billing/invoices/${invoiceNumber}/${action}`, {
        method: "PATCH",
        headers: platformAuthHeaders(token),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INVOICES_KEY });
      queryClient.invalidateQueries({ queryKey: REVENUE_KEY });
    },
  });
}

export function useRevenue() {
  const token = useToken();
  const enabled = useAuthed();
  return useQuery({
    queryKey: REVENUE_KEY,
    enabled,
    queryFn: () => apiFetch<RevenueSummary>("/v1/platform/billing/revenue", { headers: platformAuthHeaders(token) }),
  });
}
