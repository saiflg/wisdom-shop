"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export type DiscountKind = "PERCENT" | "FIXED";

export interface InvoiceDiscount {
  id: string;
  label: string;
  /** "20% off" / "NGN 5,000.00 off" — how it was granted, not what it came to. */
  describedAs: string;
  amountCents: number;
  reason: string | null;
  /** Set when a standing award produced it; it cannot be removed by hand. */
  fromScholarship: string | null;
  grantedByName: string | null;
  createdAt: string;
}

export interface InvoiceDiscounts {
  invoiceId: string;
  invoiceNumber: string;
  currency: string;
  /** What the fee lines add up to, before anything was taken off. */
  grossCents: number;
  discountCents: number;
  payableCents: number;
  paidCents: number;
  discounts: InvoiceDiscount[];
}

export interface Scholarship {
  id: string;
  studentProfileId: string;
  studentName: string;
  name: string;
  sponsor: string | null;
  kind: DiscountKind;
  value: number;
  /** "50% off, ongoing" / "20% off — withdrawn" */
  describedAs: string;
  status: "ACTIVE" | "WITHDRAWN";
  startDate: string | null;
  endDate: string | null;
  awardedByName: string | null;
  withdrawnReason: string | null;
  /** An award nobody has used is worth questioning. */
  timesApplied: number;
}

const KEY = ["fees", "discounts"];

export function useInvoiceDiscounts(invoiceId: string | null) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...KEY, invoiceId],
    enabled: enabled && Boolean(invoiceId),
    queryFn: () =>
      apiFetch<InvoiceDiscounts>(`/v1/fees/invoices/${invoiceId}/discounts`, {
        headers: authHeaders(accessToken),
      }),
  });
}

export function useGrantDiscount(invoiceId: string) {
  const { accessToken } = useAuthQueryState();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { label: string; kind: DiscountKind; value: number; reason?: string }) =>
      apiFetch<InvoiceDiscounts>(`/v1/fees/invoices/${invoiceId}/discounts`, {
        method: "POST",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...KEY, invoiceId] });
      // The invoice itself changed: its payable total and status both move.
      queryClient.invalidateQueries({ queryKey: ["fees", "invoices"] });
    },
  });
}

export function useRevokeDiscount(invoiceId: string) {
  const { accessToken } = useAuthQueryState();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (discountId: string) =>
      apiFetch<InvoiceDiscounts>(`/v1/fees/discounts/${discountId}`, {
        method: "DELETE",
        headers: authHeaders(accessToken),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...KEY, invoiceId] });
      queryClient.invalidateQueries({ queryKey: ["fees", "invoices"] });
    },
  });
}

export function useScholarships(studentProfileId?: string) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: ["fees", "scholarships", studentProfileId ?? "all"],
    enabled,
    queryFn: () =>
      apiFetch<Scholarship[]>(
        `/v1/fees/scholarships${studentProfileId ? `?studentProfileId=${studentProfileId}` : ""}`,
        { headers: authHeaders(accessToken) },
      ),
  });
}

export function useAwardScholarship() {
  const { accessToken } = useAuthQueryState();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      studentProfileId: string;
      name: string;
      sponsor?: string;
      kind: DiscountKind;
      value: number;
      startDate?: string;
      endDate?: string;
    }) =>
      apiFetch<Scholarship>("/v1/fees/scholarships", {
        method: "POST",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["fees", "scholarships"] }),
  });
}

export function useWithdrawScholarship() {
  const { accessToken } = useAuthQueryState();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiFetch<Scholarship>(`/v1/fees/scholarships/${id}/withdraw`, {
        method: "PATCH",
        headers: authHeaders(accessToken),
        body: { reason },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["fees", "scholarships"] }),
  });
}
