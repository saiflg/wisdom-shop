"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export interface FeeAllocation {
  invoiceId: string;
  studentProfileId: string;
  studentName: string;
  invoiceNumber: string;
  amountCents: number;
}

export interface StaffFeeRow {
  staffProfileId: string;
  staffUserId: string;
  staffName: string;
  monthlyCapCents: number;
  children: { studentProfileId: string; studentName: string }[];
  plan: {
    totalCents: number;
    allocations: FeeAllocation[];
    remainingCents: number;
    outstandingCents: number;
  };
  /** Set when this person cannot be recovered against, and why. */
  blocked: string | null;
}

export interface AppliedFees {
  appliedCents: number;
  credited: { staffName: string; studentName: string; invoiceNumber: string; amountCents: number }[];
  /** Invoices this run had already credited — the idempotency guard working. */
  alreadyDone: number;
}

export function useStaffFeesPreview() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: ["payroll", "staff-fees"],
    enabled,
    queryFn: () => apiFetch<StaffFeeRow[]>("/v1/payroll/staff-fees", { headers: authHeaders(accessToken) }),
  });
}

export function useApplyStaffFees() {
  const { accessToken } = useAuthQueryState();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) =>
      apiFetch<AppliedFees>(`/v1/payroll/runs/${runId}/staff-fees`, {
        method: "POST",
        headers: authHeaders(accessToken),
      }),
    onSuccess: () => {
      // Balances have moved, so the preview and anything showing fee arrears
      // are both stale.
      void queryClient.invalidateQueries({ queryKey: ["payroll"] });
      void queryClient.invalidateQueries({ queryKey: ["fees"] });
      void queryClient.invalidateQueries({ queryKey: ["parents"] });
    },
  });
}
