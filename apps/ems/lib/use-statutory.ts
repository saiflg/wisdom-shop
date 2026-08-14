"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export interface TaxRegister {
  schoolName: string;
  heading: string;
  register: {
    rows: { serial: number; staffProfileId: string; staffName: string; taxCents: number }[];
    totalCents: number;
    /** Everybody on the payroll, including those who paid no tax. */
    staffConsidered: number;
  };
}

export interface PensionRow {
  serial: number;
  staffProfileId: string;
  staffName: string;
  pensionPin: string | null;
  employerCents: number;
  employeeCents: number;
  totalCents: number;
}

export interface PensionRegister {
  schoolName: string;
  heading: string;
  /** The two lines naming where the money goes, printed verbatim. */
  remittance: string[];
  settings: PensionSettings;
  register: {
    rows: PensionRow[];
    employerTotalCents: number;
    employeeTotalCents: number;
    totalCents: number;
    /** Rows the administrator will reject: a contribution with no PIN. */
    missingPin: PensionRow[];
  };
}

export interface PensionSettings {
  providerName: string | null;
  remittanceBankName: string | null;
  remittanceAccountNumber: string | null;
  /** The employer's share as a percentage of the employee's contribution. */
  employerMatchPercent: number;
  componentLabel: string;
}

export function useTaxRegister(runId: string | null) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: ["payroll", "tax-register", runId],
    enabled: enabled && Boolean(runId),
    queryFn: () =>
      apiFetch<TaxRegister>(`/v1/payroll/runs/${runId}/tax-register`, {
        headers: authHeaders(accessToken),
      }),
  });
}

export function usePensionRegister(runId: string | null) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: ["payroll", "pension-register", runId],
    enabled: enabled && Boolean(runId),
    queryFn: () =>
      apiFetch<PensionRegister>(`/v1/payroll/runs/${runId}/pension-register`, {
        headers: authHeaders(accessToken),
      }),
  });
}

export function usePensionSettings() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: ["payroll", "pension-settings"],
    enabled,
    queryFn: () =>
      apiFetch<PensionSettings>("/v1/payroll/pension-settings", { headers: authHeaders(accessToken) }),
  });
}

export function useSavePensionSettings() {
  const { accessToken } = useAuthQueryState();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: Partial<PensionSettings>) =>
      apiFetch<PensionSettings>("/v1/payroll/pension-settings", {
        method: "PUT",
        headers: authHeaders(accessToken),
        body: settings,
      }),
    onSuccess: () => {
      // The schedule's employer column is derived from these, so a stale
      // register after saving would show the old split and look like the save
      // silently failed.
      void queryClient.invalidateQueries({ queryKey: ["payroll"] });
    },
  });
}
