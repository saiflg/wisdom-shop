"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export type WalletEntryKind = "TOPUP" | "REFUND" | "SPEND" | "ADJUSTMENT_CREDIT" | "ADJUSTMENT_DEBIT";

export const ENTRY_KINDS: { value: WalletEntryKind; label: string; hint: string }[] = [
  { value: "TOPUP", label: "Top-up", hint: "Money in from the family" },
  { value: "SPEND", label: "Spend", hint: "Money drawn down by the school" },
  { value: "REFUND", label: "Refund", hint: "Money back out to the family" },
  { value: "ADJUSTMENT_CREDIT", label: "Correction — add", hint: "Put right a shortfall" },
  { value: "ADJUSTMENT_DEBIT", label: "Correction — remove", hint: "Put right an over-credit" },
];

export interface WalletEntry {
  id: string;
  kind: WalletEntryKind;
  /** Signed minor units: credits positive, debits negative. */
  amountCents: number;
  balanceAfterCents: number;
  description: string;
  reference: string | null;
  recordedByName: string;
  createdAt: string;
}

export interface Wallet {
  id: string;
  studentProfileId: string;
  balanceCents: number;
  student: { id: string; user: { firstName: string; lastName: string } };
}

export interface Statement {
  wallet: Wallet;
  entries: WalletEntry[];
}

export interface PortalChild {
  id: string;
  user: { firstName: string; lastName: string };
}

const KEY = ["wallet"];

/**
 * The students this viewer may look at.
 *
 * Staff get the school's list; a parent or a student gets the portal's
 * "children" endpoint, which answers "themselves, or their children". Two
 * sources because they are two genuinely different questions, and asking the
 * staff endpoint as a parent would rightly be refused.
 */
export function usePortalChildren(enabledForViewer: boolean) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: ["portal", "children"],
    enabled: enabled && enabledForViewer,
    queryFn: () => apiFetch<PortalChild[]>("/v1/portal/children", { headers: authHeaders(accessToken) }),
    retry: false,
  });
}

export function useWalletStatement(studentProfileId: string | null) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...KEY, studentProfileId],
    enabled: enabled && Boolean(studentProfileId),
    queryFn: () =>
      apiFetch<Statement>(`/v1/wallets/${studentProfileId}/statement`, { headers: authHeaders(accessToken) }),
  });
}

export function useRecordWalletEntry(studentProfileId: string) {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      kind: WalletEntryKind;
      amountCents: number;
      description: string;
      reference?: string;
    }) =>
      apiFetch<{ entry: WalletEntry; duplicate: boolean }>(`/v1/wallets/${studentProfileId}/entries`, {
        method: "POST",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

/** Minor units to a readable amount: 123456 reads as 1,234.56. */
export function formatAmount(amountCents: number): string {
  const sign = amountCents < 0 ? "-" : "";
  const absolute = Math.abs(amountCents);
  const major = Math.floor(absolute / 100).toLocaleString("en-NG");
  return `${sign}${major}.${String(absolute % 100).padStart(2, "0")}`;
}

/**
 * A typed amount to minor units.
 *
 * Rounded rather than truncated, and rounded once: "12.005" is a typo, not a
 * half-kobo, and floor() would quietly take money off a family.
 */
export function toMinorUnits(amount: string): number {
  const value = Number(amount);
  if (!Number.isFinite(value)) return Number.NaN;
  return Math.round(value * 100);
}
