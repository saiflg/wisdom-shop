"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export interface SectionHead {
  id: string;
  firstName: string;
  lastName: string;
}

export interface SectionClass {
  id: string;
  name: string;
  gradeLevel: string | null;
  academicYear: string;
}

export interface Section {
  id: string;
  name: string;
  description: string | null;
  position: number;
  headId: string | null;
  head: SectionHead | null;
  /** Present on the list; the count is what the screen is for. */
  _count?: { classes: number };
  /** Present on the detail. */
  classes?: SectionClass[];
}

export interface CreateSectionInput {
  name: string;
  description?: string;
  position?: number;
  headId?: string;
}

const SECTIONS_KEY = ["sections"];

export function useSections() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: SECTIONS_KEY,
    enabled,
    queryFn: () => apiFetch<Section[]>("/v1/sections", { headers: authHeaders(accessToken) }),
  });
}

export function useSection(id: string | null) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...SECTIONS_KEY, id],
    enabled: enabled && Boolean(id),
    queryFn: () => apiFetch<Section>(`/v1/sections/${id}`, { headers: authHeaders(accessToken) }),
  });
}

export function useCreateSection() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSectionInput) =>
      apiFetch<Section>("/v1/sections", { method: "POST", headers: authHeaders(accessToken), body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SECTIONS_KEY }),
  });
}

export function useUpdateSection(id: string) {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<CreateSectionInput>) =>
      apiFetch<Section>(`/v1/sections/${id}`, { method: "PATCH", headers: authHeaders(accessToken), body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SECTIONS_KEY }),
  });
}

export function useDeleteSection() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/v1/sections/${id}`, { method: "DELETE", headers: authHeaders(accessToken) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SECTIONS_KEY }),
  });
}

/**
 * Set a section's classes as a whole set, matching the API.
 *
 * Sending the full membership rather than a delta is what makes a retry
 * safe after a dropped connection, so the hook takes the same shape.
 */
export function useAssignClasses(id: string) {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (classIds: string[]) =>
      apiFetch<Section>(`/v1/sections/${id}/classes`, {
        method: "PUT",
        headers: authHeaders(accessToken),
        body: { classIds },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SECTIONS_KEY });
      queryClient.invalidateQueries({ queryKey: ["classes"] });
    },
  });
}
