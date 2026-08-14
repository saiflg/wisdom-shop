"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export interface TurnoverRow {
  serial: number;
  staffProfileId: string;
  name: string;
  section: string | null;
  jobTitle: string | null;
  startDate: string | null;
  endDate: string;
  /** What they were last actually paid. Null when they were never on a run. */
  lastMonthlyCents: number | null;
  tenureMonths: number | null;
  tenureLabel: string;
}

export interface TurnoverReport {
  groups: { section: string; rows: TurnoverRow[]; monthlyCents: number }[];
  total: number;
  /** Combined monthly salary of everyone who left — the replacement bill. */
  monthlyCents: number;
  /** Leavers with no payslip, so the figure above understates by that many. */
  withoutSalary: number;
  averageTenureMonths: number | null;
}

export function useTurnover() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: ["staff", "turnover"],
    enabled,
    queryFn: () => apiFetch<TurnoverReport>("/v1/staff/turnover", { headers: authHeaders(accessToken) }),
  });
}
