"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export interface SchoolProfile {
  id: string;
  motto: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  town: string | null;
  state: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  registrationNumber: string | null;
  establishedYear: number | null;
  headTeacherName: string | null;
}

export type SchoolProfileInput = Partial<Omit<SchoolProfile, "id">>;

const KEY = ["school-profile"];

/** Null when a school has never filled one in — not an empty row. */
export function useSchoolProfile() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: KEY,
    enabled,
    queryFn: () => apiFetch<SchoolProfile | null>("/v1/school-profile", { headers: authHeaders(accessToken) }),
  });
}

/**
 * The lines that will head a printed document.
 *
 * Fetched from the API rather than assembled here, so the preview on the
 * settings screen and the header on the actual report card come from the
 * same function. A preview that agrees with nothing is worse than no preview.
 */
export function useDocumentHeader() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...KEY, "header"],
    enabled,
    queryFn: () =>
      apiFetch<string[]>("/v1/school-profile/document-header", { headers: authHeaders(accessToken) }),
  });
}

export function useUpdateSchoolProfile() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SchoolProfileInput) =>
      apiFetch<SchoolProfile>("/v1/school-profile", {
        method: "PATCH",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
