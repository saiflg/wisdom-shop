"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export const EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "VOLUNTEER"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

/** The two roles a staff record can hold. Students and guardians are not staff. */
export const STAFF_ROLES = ["TEACHER", "SCHOOL_ADMIN"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export interface MaskedBankDetails {
  bankName: string | null;
  bankCode: string | null;
  accountName: string | null;
  /** Last four only. The full number has its own audited route. */
  accountNumberMasked: string | null;
  hasAccountNumber: boolean;
}

export interface StaffMember {
  id: string;
  /**
   * The employment record's id, distinct from the user's.
   *
   * Anything attached to somebody's employment rather than their login — a
   * loan, a payslip — is keyed on this. Null for a user with no staff record.
   */
  staffProfileId: string | null;
  email: string | null;
  firstName: string;
  lastName: string;
  /** False means the account exists but has never been set up. */
  hasPassword: boolean;
  roles: string[];
  staffNumber: string | null;
  jobTitle: string | null;
  employmentType: EmploymentType | null;
  startDate: string | null;
  endDate: string | null;
  bank: MaskedBankDetails;
}

export interface RegisterStaffInput {
  email: string;
  /**
   * Optional, and better left out — omitting it means the person is invited
   * and chooses their own, rather than the office knowing how to sign in as
   * a colleague whose account reaches every child's record.
   */
  password?: string;
  firstName: string;
  lastName: string;
  role: StaffRole;
  staffNumber?: string;
  jobTitle?: string;
  employmentType?: EmploymentType;
  startDate?: string;
}

/**
 * An employment edit.
 *
 * `accountNumber` carries three distinct meanings and the difference matters:
 * absent leaves what is on file alone, an empty string clears it, and a value
 * replaces it. Sending `null` is not one of them — the API would reject it,
 * and conflating "don't touch" with "delete" is how bank details disappear
 * during an unrelated edit.
 */
export interface UpsertStaffProfileInput {
  staffNumber?: string;
  jobTitle?: string;
  employmentType?: EmploymentType;
  startDate?: string;
  endDate?: string;
  bankName?: string;
  bankCode?: string;
  accountName?: string;
  accountNumber?: string;
}

export interface RevealedAccount {
  staffUserId: string;
  accountName: string | null;
  bankName: string | null;
  bankCode: string | null;
  accountNumber: string;
}

export interface BankAccessEntry {
  id: string;
  staffProfileId: string;
  staffName: string;
  actorUserId: string;
  actorName: string;
  reason: string;
  createdAt: string;
}

const STAFF_KEY = ["staff"];

export function useStaff() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: STAFF_KEY,
    enabled,
    queryFn: () => apiFetch<StaffMember[]>("/v1/staff", { headers: authHeaders(accessToken) }),
  });
}

export function useStaffMember(userId: string) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...STAFF_KEY, userId],
    enabled: enabled && Boolean(userId),
    queryFn: () => apiFetch<StaffMember>(`/v1/staff/${userId}`, { headers: authHeaders(accessToken) }),
  });
}

export function useRegisterStaff() {
  const { accessToken } = useAuthQueryState();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterStaffInput) =>
      apiFetch<StaffMember>("/v1/staff", { method: "POST", headers: authHeaders(accessToken), body: input }),
    // Teachers appear in both lists, and a new administrator changes who the
    // school has — neither list should still show yesterday's roster.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: STAFF_KEY });
      void queryClient.invalidateQueries({ queryKey: ["teachers"] });
    },
  });
}

export function useUpsertStaffProfile(userId: string) {
  const { accessToken } = useAuthQueryState();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertStaffProfileInput) =>
      apiFetch<StaffMember>(`/v1/staff/${userId}`, {
        method: "PUT",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: (member) => {
      queryClient.setQueryData([...STAFF_KEY, userId], member);
      void queryClient.invalidateQueries({ queryKey: STAFF_KEY });
    },
  });
}

export function useBankAccessLog() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...STAFF_KEY, "access-log"],
    enabled,
    queryFn: () => apiFetch<BankAccessEntry[]>("/v1/staff/access-log", { headers: authHeaders(accessToken) }),
  });
}

/**
 * Asks for one staff member's full account number, and says why.
 *
 * A plain function rather than a `useMutation`, deliberately: a mutation keeps
 * its last result in hook state, and react-query's devtools and cache
 * inspectors would then hold a bank account number for as long as the page is
 * open. Here the caller holds the value in local state and can drop it, which
 * the reveal panel does on a timer and on unmount.
 *
 * The reason is not a formality. It is written to the access log *before* the
 * number comes back, so the log answers "why" and not merely "who".
 */
export async function revealAccountNumber(
  userId: string,
  reason: string,
  accessToken: string | null,
): Promise<RevealedAccount> {
  return apiFetch<RevealedAccount>(`/v1/staff/${userId}/account-number`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: { reason },
  });
}
