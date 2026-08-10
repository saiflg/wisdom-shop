"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export type ModuleKey = string;

/**
 * Which modules this school bought.
 *
 * Read once and kept — entitlements change when an operator changes them,
 * which is rare, and refetching on every window focus would spend a request
 * per tab switch to learn nothing. A school that has just been upgraded sees
 * it on the next page load.
 */
export function useSchoolModules() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: ["school", "modules"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: () =>
      apiFetch<{ modules: ModuleKey[] }>("/v1/school/modules", { headers: authHeaders(accessToken) }),
  });
}
