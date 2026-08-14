"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export type LoanKind = "LOAN" | "SALARY_ADVANCE";
export type LoanStatus = "ACTIVE" | "SETTLED" | "WRITTEN_OFF" | "CANCELLED";

export interface LoanRow {
  loanId: string;
  staffName: string;
  kind: LoanKind;
  reference: string;
  issuedOn: string;
  principalCents: number;
  repaidCents: number;
  outstandingCents: number;
  monthlyDeductionCents: number;
  status: LoanStatus;
  /** Null when it will never clear at the current instalment. */
  monthsRemaining: number | null;
}

export interface LoanRegister {
  rows: LoanRow[];
  totals: {
    count: number;
    principalCents: number;
    repaidCents: number;
    outstandingCents: number;
    /** What this month's payroll will recover if it runs today. */
    dueThisMonthCents: number;
  };
}

export function useLoans(includeSettled: boolean) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: ["payroll", "loans", includeSettled],
    enabled,
    queryFn: () =>
      apiFetch<LoanRegister>(`/v1/payroll/loans?includeSettled=${includeSettled}`, {
        headers: authHeaders(accessToken),
      }),
  });
}

export interface CreateLoanInput {
  staffProfileId: string;
  kind: LoanKind;
  principalCents: number;
  monthlyDeductionCents: number;
  reference?: string;
  note?: string;
}

export function useCreateLoan() {
  const { accessToken } = useAuthQueryState();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLoanInput) =>
      apiFetch<{ id: string }>("/v1/payroll/loans", {
        method: "POST",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["payroll", "loans"] }),
  });
}

export function useRecordRepayment() {
  const { accessToken } = useAuthQueryState();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { loanId: string; amountCents: number; note?: string }) =>
      apiFetch(`/v1/payroll/loans/${input.loanId}/repayments`, {
        method: "POST",
        headers: authHeaders(accessToken),
        body: { amountCents: input.amountCents, note: input.note },
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["payroll", "loans"] }),
  });
}

export function useCloseLoan() {
  const { accessToken } = useAuthQueryState();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { loanId: string; status: "WRITTEN_OFF" | "CANCELLED"; note?: string }) =>
      apiFetch(`/v1/payroll/loans/${input.loanId}/close`, {
        method: "PATCH",
        headers: authHeaders(accessToken),
        body: { status: input.status, note: input.note },
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["payroll", "loans"] }),
  });
}
