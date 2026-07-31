"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiError } from "./api";
import { useAuthStore } from "@/store/auth-store";

function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type VendorStatus = "PENDING" | "APPROVED" | "SUSPENDED" | "REJECTED";

export interface Vendor {
  id: string;
  storeName: string;
  slug: string;
  status: VendorStatus;
  commissionPct: string;
  createdAt: string;
}

export interface EarningsLine {
  orderNumber: string;
  orderStatus: string;
  placedAt: string;
  currency: string;
  title: string;
  quantity: number;
  grossCents: number;
  commissionCents: number;
  netCents: number;
}

export interface Earnings {
  lines: EarningsLine[];
  totals: {
    currency: string;
    grossCents: number;
    commissionCents: number;
    netCents: number;
    payableLineCount: number;
    excludedLineCount: number;
  };
}

const VENDOR_KEY = ["vendor-me"];
const EARNINGS_KEY = ["vendor-earnings"];

/**
 * The caller's own vendor account, or null when they have never applied.
 *
 * A 404 is the API's way of saying "no vendor account", which is a normal
 * state for most users rather than an error — so it is folded into `null`
 * and everything else is allowed to surface.
 */
export function useMyVendor() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const status = useAuthStore((s) => s.status);

  return useQuery({
    queryKey: VENDOR_KEY,
    enabled: status === "authenticated" && Boolean(accessToken),
    retry: false,
    queryFn: async (): Promise<Vendor | null> => {
      try {
        return await apiFetch<Vendor>("/v1/vendors/me", { headers: authHeaders(accessToken) });
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
  });
}

export function useApplyAsVendor() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { storeName: string; slug?: string }) =>
      apiFetch<Vendor>("/v1/vendors/apply", {
        method: "POST",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: (vendor) => queryClient.setQueryData(VENDOR_KEY, vendor),
  });
}

export function useVendorEarnings(enabled: boolean) {
  const accessToken = useAuthStore((s) => s.accessToken);

  return useQuery({
    queryKey: EARNINGS_KEY,
    // Only an approved vendor may call this; asking otherwise just produces
    // a 403 and an alarming error panel on a page that is working correctly.
    enabled: enabled && Boolean(accessToken),
    queryFn: () => apiFetch<Earnings>("/v1/vendor/earnings", { headers: authHeaders(accessToken) }),
  });
}
