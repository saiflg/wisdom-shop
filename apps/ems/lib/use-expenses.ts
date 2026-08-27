"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export type ExpenseStatus = "REQUESTED" | "APPROVED" | "PAID" | "REJECTED";

export const STATUS_LABEL: Record<ExpenseStatus, string> = {
  REQUESTED: "Waiting for approval",
  APPROVED: "Approved, not yet paid",
  PAID: "Paid",
  REJECTED: "Turned down",
};

export const STATUS_STYLE: Record<ExpenseStatus, string> = {
  REQUESTED: "bg-blue-600 text-white",
  APPROVED: "bg-amber-500 text-white",
  PAID: "bg-emerald-600 text-white",
  REJECTED: "bg-slate-500 text-white",
};

export const TRANSITION_LABEL: Record<ExpenseStatus, string> = {
  APPROVED: "Approve",
  REJECTED: "Turn down",
  PAID: "Record payment",
  REQUESTED: "Ask again",
};

export interface Expense {
  id: string;
  category: string;
  description: string;
  amountCents: number;
  incurredOn: string;
  payee: string | null;
  status: ExpenseStatus;
  method: string | null;
  reference: string | null;
  paidAt: string | null;
  requestedByName: string;
  decidedByName: string | null;
  decisionNote: string | null;
  availableTransitions?: ExpenseStatus[];
}

export interface ExpenseSummary {
  /** Approved and paid together — money the school has committed. */
  committedCents: number;
  paidCents: number;
  outstandingCents: number;
  /** Asked for and not yet decided. Not spending. */
  pendingCents: number;
  byCategory: { category: string; amountCents: number }[];
}

export interface ExpenseList {
  expenses: Expense[];
  summary: ExpenseSummary;
}

const KEY = ["expenses"];

export function useExpenses(filter: { from?: string; to?: string; status?: ExpenseStatus } = {}) {
  const { accessToken, enabled } = useAuthQueryState();
  const query = new URLSearchParams();
  if (filter.from) query.set("from", filter.from);
  if (filter.to) query.set("to", filter.to);
  if (filter.status) query.set("status", filter.status);
  const suffix = query.toString() ? `?${query}` : "";

  return useQuery({
    queryKey: [...KEY, suffix],
    enabled,
    queryFn: () => apiFetch<ExpenseList>(`/v1/expenses${suffix}`, { headers: authHeaders(accessToken) }),
  });
}

export function useExpense(id: string | null) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...KEY, "one", id],
    enabled: enabled && Boolean(id),
    queryFn: () => apiFetch<Expense>(`/v1/expenses/${id}`, { headers: authHeaders(accessToken) }),
  });
}

export function useCreateExpense() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      category: string;
      description: string;
      amountCents: number;
      incurredOn: string;
      payee?: string;
    }) => apiFetch<Expense>("/v1/expenses", { method: "POST", headers: authHeaders(accessToken), body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDecideExpense(id: string) {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { to: ExpenseStatus; note?: string; method?: string; reference?: string }) =>
      apiFetch<Expense>(`/v1/expenses/${id}/status`, {
        method: "PATCH",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

/** Minor units to a readable amount: 5000000 reads as 50,000.00. */
export function formatAmount(amountCents: number): string {
  const major = Math.floor(Math.abs(amountCents) / 100).toLocaleString("en-NG");
  return `${amountCents < 0 ? "-" : ""}${major}.${String(Math.abs(amountCents) % 100).padStart(2, "0")}`;
}

/** A typed amount to minor units, rounded once. */
export function toMinorUnits(amount: string): number {
  const value = Number(amount);
  return Number.isFinite(value) ? Math.round(value * 100) : Number.NaN;
}
