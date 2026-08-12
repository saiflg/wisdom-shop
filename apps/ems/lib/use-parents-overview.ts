"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export type ParentAlertKind =
  | "AWAITING_REPLY"
  | "ABSENT"
  | "UNPAID"
  | "UNREACHABLE"
  | "NO_PORTAL_ACCESS";

export interface ParentAlert {
  kind: ParentAlertKind;
  urgency: number;
  headline: string;
  detail: string;
  href: string | null;
}

export interface ParentsOverview {
  familyCount: number;
  awaitingReplyCount: number;
  absentTodayCount: number;
  unpaidCount: number;
  outstandingTotals: { currency: string; cents: number }[];
  unreachableCount: number;
  noPortalAccessCount: number;
  /** Already sorted by the API into the order an office should work through. */
  alerts: ParentAlert[];
}

/**
 * What needs attention about families today.
 *
 * Refetched on an interval because this is a screen somebody leaves open on a
 * second monitor all morning, and a parent who writes at 11am should not have
 * to wait for a page reload to become visible.
 */
export function useParentsOverview() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: ["parents", "overview"],
    enabled,
    refetchInterval: 60_000,
    queryFn: () =>
      apiFetch<ParentsOverview>("/v1/guardians/overview", { headers: authHeaders(accessToken) }),
  });
}
