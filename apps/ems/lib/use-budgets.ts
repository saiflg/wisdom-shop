"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export interface BudgetLine {
  id?: string;
  category: string;
  amountCents: number;
}

export interface Budget {
  id: string;
  name: string;
  academicYear: string;
  term: string | null;
  fromDate: string;
  toDate: string;
  createdByName: string | null;
  lines: BudgetLine[];
}

export interface BudgetComparisonRow {
  category: string;
  budgetedCents: number;
  spentCents: number;
  /** Negative means overspent. */
  remainingCents: number;
  overspent: boolean;
  /** Money went out under a category nobody budgeted for. */
  unbudgeted: boolean;
}

export interface BudgetComparison {
  rows: BudgetComparisonRow[];
  budgetedCents: number;
  spentCents: number;
  remainingCents: number;
  unbudgetedCents: number;
}

export interface BudgetWithActual {
  budget: Budget;
  comparison: BudgetComparison;
}

export interface CreateBudgetInput {
  name: string;
  academicYear: string;
  term?: string;
  fromDate: string;
  toDate: string;
  lines: BudgetLine[];
}

const KEY = ["budgets"];

export function useBudgets() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: KEY,
    enabled,
    queryFn: () => apiFetch<Budget[]>("/v1/budgets", { headers: authHeaders(accessToken) }),
  });
}

export function useBudgetWithActual(id: string | null) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...KEY, id],
    enabled: enabled && Boolean(id),
    queryFn: () => apiFetch<BudgetWithActual>(`/v1/budgets/${id}`, { headers: authHeaders(accessToken) }),
  });
}

export function useCreateBudget() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBudgetInput) =>
      apiFetch<Budget>("/v1/budgets", { method: "POST", headers: authHeaders(accessToken), body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteBudget() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/v1/budgets/${id}`, { method: "DELETE", headers: authHeaders(accessToken) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

/** Minor units to a readable amount. */
export function formatAmount(amountCents: number): string {
  const major = Math.floor(Math.abs(amountCents) / 100).toLocaleString("en-NG");
  return `${amountCents < 0 ? "-" : ""}${major}.${String(Math.abs(amountCents) % 100).padStart(2, "0")}`;
}

export function toMinorUnits(amount: string): number {
  const value = Number(amount);
  return Number.isFinite(value) ? Math.round(value * 100) : Number.NaN;
}

/**
 * How much of a line has been used, capped for the bar's width only.
 *
 * The number beside the bar is never capped — a line at 140% has to read as
 * 140%, or the screen would show a full bar for something badly overspent
 * and a full bar for something exactly on budget.
 */
export function usedPercent(row: BudgetComparisonRow): number {
  if (row.budgetedCents <= 0) return 100;
  return Math.round((row.spentCents / row.budgetedCents) * 100);
}
