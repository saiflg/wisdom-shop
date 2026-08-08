"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export interface StaffMember {
  id: string;
  email: string | null;
  firstName: string;
  lastName: string;
  roles: string[];
  staffNumber: string | null;
  jobTitle: string | null;
  bank: {
    bankName: string | null;
    bankCode: string | null;
    accountName: string | null;
    /** Last four only. The full number has its own audited route. */
    accountNumberMasked: string | null;
    hasAccountNumber: boolean;
  };
}

export function useStaff() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: ["staff"],
    enabled,
    queryFn: () => apiFetch<StaffMember[]>("/v1/staff", { headers: authHeaders(accessToken) }),
  });
}
