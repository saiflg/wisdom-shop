"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export interface StaffOverview {
  staff: {
    id: string;
    name: string;
    jobTitle: string | null;
    section: string | null;
    startDate: string | null;
  };
  attendance: {
    present: number;
    absent: number;
    late: number;
    onLeave: number;
    attended: number;
    expected: number;
    minutesLate: number;
    /** Null when nobody was expected in. */
    rate: number | null;
  };
  leave: {
    entitlementDays: number;
    takenDays: number;
    pendingDays: number;
    remainingDays: number;
    /** True when the school has set no allowance — not "none left". */
    untracked: boolean;
    summary: string;
  };
  load: {
    classes: number;
    subjects: number;
    periods: number;
    /** Null when no timetable has been entered. */
    minutesPerWeek: number | null;
  };
  notes: {
    draft: number;
    submitted: number;
    returned: number;
    approved: number;
    /** Theirs to act on. */
    mine: number;
    /** Waiting on somebody else. */
    theirs: number;
  };
  flags: string[];
}

export function useStaffOverview(userId: string | null) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: ["staff-overview", userId],
    enabled: enabled && Boolean(userId),
    queryFn: () =>
      apiFetch<StaffOverview>(`/v1/staff-overview/${userId}`, { headers: authHeaders(accessToken) }),
  });
}

/** 320 minutes reads as "5h 20m". */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}
