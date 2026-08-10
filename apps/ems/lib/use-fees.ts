"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export const FEE_PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "CARD", "MOBILE_MONEY", "GATEWAY", "OTHER"] as const;
export type FeePaymentMethod = (typeof FEE_PAYMENT_METHODS)[number];

export type FeeInvoiceStatus = "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "VOID";

export interface FinanceSettings {
  id: string;
  currency: string;
  invoiceCounter: number;
}

export interface FeeItem {
  id?: string;
  label: string;
  /** Minor units. Never hold money in a float on this side either. */
  amountCents: number;
}

export interface FeeStructure {
  id: string;
  name: string;
  academicYear: string;
  term: string;
  classId: string | null;
  class?: { id: string; name: string } | null;
  items: FeeItem[];
  _count?: { invoices: number };
}

export interface FeePayment {
  id: string;
  amountCents: number;
  method: FeePaymentMethod;
  reference: string | null;
  receivedAt: string;
  note: string | null;
  recordedByName: string;
}

export interface FeeInvoice {
  id: string;
  invoiceNumber: string;
  studentProfileId: string;
  feeStructureId: string | null;
  academicYear: string;
  term: string;
  currency: string;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  status: FeeInvoiceStatus;
  dueDate: string | null;
  note: string | null;
  lines: FeeItem[];
  payments: FeePayment[];
  feeStructure?: { id: string; name: string } | null;
  studentProfile?: { id: string; user: { id: string; firstName: string; lastName: string } };
}

export interface FeesSummary {
  currency?: string;
  invoiced: number;
  collected: number;
  outstanding: number;
  invoiceCount: number;
}

export interface InvoiceList {
  invoices: FeeInvoice[];
  summary: FeesSummary;
}

const FEES_KEY = ["fees"];

/**
 * Minor units to a display string, without float maths — the same rule as
 * the API's formatMoney. `Number(cents) / 100` is how a total drifts.
 */
export function formatMoney(amountCents: number, currency: string): string {
  const negative = amountCents < 0;
  const absolute = Math.abs(amountCents);
  const major = Math.trunc(absolute / 100);
  const minor = absolute % 100;
  return `${negative ? "-" : ""}${currency} ${major.toLocaleString("en-US")}.${String(minor).padStart(2, "0")}`;
}

/**
 * Parses a typed amount like "25000.50" into minor units.
 *
 * Deliberately string-based: `Math.round(parseFloat("4500.55") * 100)` is
 * 450055 today and a support ticket the day it isn't. Returns null when the
 * input isn't a clean money value, so the caller can refuse rather than guess.
 */
export function parseMoneyToCents(input: string): number | null {
  const trimmed = input.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [major, minor = ""] = trimmed.split(".");
  return Number(major) * 100 + Number(minor.padEnd(2, "0"));
}

export function useFinanceSettings() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...FEES_KEY, "settings"],
    enabled,
    queryFn: () => apiFetch<FinanceSettings>("/v1/fees/settings", { headers: authHeaders(accessToken) }),
  });
}

export function useFeeStructures() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...FEES_KEY, "structures"],
    enabled,
    queryFn: () => apiFetch<FeeStructure[]>("/v1/fees/structures", { headers: authHeaders(accessToken) }),
  });
}

export function useInvoices(studentProfileId?: string) {
  const { accessToken, enabled } = useAuthQueryState();
  const query = studentProfileId ? `?studentProfileId=${studentProfileId}` : "";
  return useQuery({
    queryKey: [...FEES_KEY, "invoices", studentProfileId ?? "all"],
    enabled,
    queryFn: () => apiFetch<InvoiceList>(`/v1/fees/invoices${query}`, { headers: authHeaders(accessToken) }),
  });
}

export function useInvoice(id: string | null) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...FEES_KEY, "invoice", id],
    enabled: enabled && Boolean(id),
    queryFn: () => apiFetch<FeeInvoice>(`/v1/fees/invoices/${id}`, { headers: authHeaders(accessToken) }),
  });
}

export interface CreateStructureInput {
  name: string;
  academicYear: string;
  term: string;
  classId?: string;
  items: FeeItem[];
}

export function useCreateStructure() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateStructureInput) =>
      apiFetch<FeeStructure>("/v1/fees/structures", {
        method: "POST",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FEES_KEY }),
  });
}

/** Safe to call twice — the API reports duplicates rather than re-billing. */
export function useGenerateInvoices(structureId: string) {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { dueDate?: string }) =>
      apiFetch<{ eligibleStudents: number; invoicesCreated: number; duplicatesSkipped: number }>(
        `/v1/fees/structures/${structureId}/invoices`,
        { method: "POST", headers: authHeaders(accessToken), body: input },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FEES_KEY }),
  });
}

export function useRecordPayment(invoiceId: string) {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { amountCents: number; method: FeePaymentMethod; reference?: string; note?: string }) =>
      apiFetch<FeeInvoice>(`/v1/fees/invoices/${invoiceId}/payments`, {
        method: "POST",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FEES_KEY }),
  });
}

export interface CheckoutStart {
  url: string;
  reference: string;
  provider: string;
  amountCents: number;
}

/**
 * Starts an online payment and hands back where to send the payer.
 *
 * Not a query: it creates a transaction at the provider, so it must never be
 * fired by a component re-render or a refetch on window focus.
 */
export function useStartCheckout(invoiceId: string) {
  const { accessToken } = useAuthQueryState();
  return useMutation({
    mutationFn: () =>
      apiFetch<CheckoutStart>(`/v1/fees/invoices/${invoiceId}/checkout`, {
        method: "POST",
        headers: authHeaders(accessToken),
      }),
  });
}

export function useVoidInvoice(invoiceId: string) {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { reason: string }) =>
      apiFetch<FeeInvoice>(`/v1/fees/invoices/${invoiceId}/void`, {
        method: "POST",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FEES_KEY }),
  });
}
