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

export interface ChecklistItem {
  id: string;
  label: string;
  position: number;
  done: boolean;
  doneAt: string | null;
  doneByName: string | null;
  note: string | null;
}

export interface Checklist {
  runId: string;
  period: { year: number; month: number };
  runStatus: PayrollRunStatus;
  items: ChecklistItem[];
  progress: { total: number; done: number; percent: number; complete: boolean };
  /** Something to read before approving, or null. Never a reason to block. */
  warning: string | null;
}

const RUNS_KEY = ["payroll", "runs"];
const SALARY_KEY = ["payroll", "salary"];
const CHECKLIST_KEY = ["payroll", "checklist"];

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

export function useChecklist(runId: string | null) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...CHECKLIST_KEY, runId],
    enabled: enabled && Boolean(runId),
    queryFn: () =>
      apiFetch<Checklist>(`/v1/payroll/runs/${runId}/checklist`, { headers: authHeaders(accessToken) }),
  });
}

/**
 * Ticking, adding and removing all return the whole list.
 *
 * So the cache is replaced with the server's answer rather than invalidated
 * and refetched: a tick that appears to land and then reverts on the refetch
 * is worse than one that takes a moment, and this way the screen can never
 * disagree with what was stored.
 */
function useChecklistMutation<TInput>(
  runId: string,
  request: (input: TInput, token: string | null) => Promise<Checklist>,
) {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) => request(input, accessToken),
    onSuccess: (checklist) => queryClient.setQueryData([...CHECKLIST_KEY, runId], checklist),
  });
}

export function useSetChecklistItem(runId: string) {
  return useChecklistMutation<{ itemId: string; done: boolean; note?: string }>(
    runId,
    ({ itemId, done, note }, token) =>
      apiFetch<Checklist>(`/v1/payroll/runs/${runId}/checklist/${itemId}`, {
        method: "PATCH",
        headers: authHeaders(token),
        body: { done, ...(note === undefined ? {} : { note }) },
      }),
  );
}

export function useAddChecklistItem(runId: string) {
  return useChecklistMutation<string>(runId, (label, token) =>
    apiFetch<Checklist>(`/v1/payroll/runs/${runId}/checklist`, {
      method: "POST",
      headers: authHeaders(token),
      body: { label },
    }),
  );
}

export function useRemoveChecklistItem(runId: string) {
  return useChecklistMutation<string>(runId, (itemId, token) =>
    apiFetch<Checklist>(`/v1/payroll/runs/${runId}/checklist/${itemId}`, {
      method: "DELETE",
      headers: authHeaders(token),
    }),
  );
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
