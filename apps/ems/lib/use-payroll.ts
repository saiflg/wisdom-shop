"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiError } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export type PayComponentKind = "EARNING" | "DEDUCTION";
export type PayComponentBasis = "FIXED" | "PERCENT_OF_BASIC";
export type PayrollRunStatus = "DRAFT" | "APPROVED" | "PAID";

export interface SalaryComponent {
  id?: string;
  label: string;
  kind: PayComponentKind;
  basis: PayComponentBasis;
  /** Minor units when FIXED, hundredths of a percent when PERCENT_OF_BASIC. */
  amount: number;
  isBasic: boolean;
}

export interface PayslipTotals {
  grossCents: number;
  deductionsCents: number;
  netCents: number;
}

export interface SalaryView {
  userId: string;
  staffName: string;
  components: SalaryComponent[];
  preview: PayslipTotals & { lines: Array<{ label: string; kind: PayComponentKind; amountCents: number }> };
}

export interface Payslip extends PayslipTotals {
  id: string;
  staffName: string;
  staffNumber: string | null;
  lines: Array<{ label: string; kind: PayComponentKind; amountCents: number }>;
  overDeducted?: boolean;
}

export interface PayrollRun {
  id: string;
  year: number;
  month: number;
  period: string;
  status: PayrollRunStatus;
  notes: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
  paidAt: string | null;
  paidByName: string | null;
  summary: PayslipTotals & { staffCount: number };
  payslips?: Payslip[];
}

const RUNS_KEY = ["payroll", "runs"];
const SALARY_KEY = ["payroll", "salary"];

export function useSalary(userId: string | null) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...SALARY_KEY, userId],
    enabled: enabled && Boolean(userId),
    queryFn: () =>
      apiFetch<SalaryView>(`/v1/payroll/staff/${userId}/components`, { headers: authHeaders(accessToken) }),
  });
}

export function useSetSalary(userId: string) {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (components: SalaryComponent[]) =>
      apiFetch<SalaryView>(`/v1/payroll/staff/${userId}/components`, {
        method: "PUT",
        headers: authHeaders(accessToken),
        body: { components },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SALARY_KEY }),
  });
}

export function usePayrollRuns() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: RUNS_KEY,
    enabled,
    queryFn: () => apiFetch<PayrollRun[]>("/v1/payroll/runs", { headers: authHeaders(accessToken) }),
  });
}

export function usePayrollRun(id: string | null) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...RUNS_KEY, id],
    enabled: enabled && Boolean(id),
    queryFn: () => apiFetch<PayrollRun>(`/v1/payroll/runs/${id}`, { headers: authHeaders(accessToken) }),
  });
}

export function useCreatePayrollRun() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { year: number; month: number; notes?: string }) =>
      apiFetch<PayrollRun>("/v1/payroll/runs", { method: "POST", headers: authHeaders(accessToken), body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: RUNS_KEY }),
  });
}

/** refresh, approve and paid differ only in verb and path. */
function useRunAction(id: string, action: "refresh" | "approve" | "paid") {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<PayrollRun>(`/v1/payroll/runs/${id}/${action}`, {
        method: action === "refresh" ? "POST" : "PATCH",
        headers: authHeaders(accessToken),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: RUNS_KEY }),
  });
}

export function useRefreshRun(id: string) {
  return useRunAction(id, "refresh");
}

export function useApproveRun(id: string) {
  return useRunAction(id, "approve");
}

export function useMarkRunPaid(id: string) {
  return useRunAction(id, "paid");
}

/**
 * Downloads the bank file.
 *
 * Hand-rolled rather than a react-query mutation because the response is a
 * file, and because the count of staff who could not be paid comes back in
 * headers that need reading before the download is handed to the browser.
 */
export async function downloadTransferFile(
  id: string,
  accessToken: string | null,
): Promise<{ missingCount: number; paidCount: number }> {
  const res = await fetch(`/v1/payroll/runs/${id}/transfer-file`, {
    method: "POST",
    credentials: "include",
    headers: authHeaders(accessToken),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => undefined);
    throw new ApiError(res.status, (data as { message?: string } | undefined)?.message ?? res.statusText, data);
  }

  const named = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1];
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = named ?? "payroll.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  // Read from headers so the caller can warn about anyone who will not be
  // paid without having to parse the file to find out.
  return {
    paidCount: Number(res.headers.get("x-payroll-paid-count") ?? 0),
    missingCount: Number(res.headers.get("x-payroll-missing-count") ?? 0),
  };
}

export async function downloadPayslipPdf(payslipId: string, accessToken: string | null, staffName: string) {
  const res = await fetch(`/v1/payroll/payslips/${payslipId}/pdf`, {
    credentials: "include",
    headers: authHeaders(accessToken),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => undefined);
    throw new ApiError(res.status, (data as { message?: string } | undefined)?.message ?? res.statusText, data);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `payslip-${staffName.replace(/\s+/g, "-").toLowerCase()}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
