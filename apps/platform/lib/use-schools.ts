"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { platformAuthHeaders, usePlatformAuthStore } from "@/store/platform-auth-store";

export type SchoolStatus = "PROVISIONING" | "ACTIVE" | "SUSPENDED" | "FAILED";

export interface School {
  id: string;
  name: string;
  slug: string;
  databaseName: string;
  status: SchoolStatus;
  licenseKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProvisioningAttempt {
  id: string;
  step: string;
  success: boolean;
  errorMessage: string | null;
  createdAt: string;
}

export interface LifecycleEvent {
  id: string;
  fromStatus: SchoolStatus;
  toStatus: SchoolStatus;
  reason: string;
  actorEmail: string;
  createdAt: string;
}

export interface SchoolDetail extends School {
  provisioningAttempts: ProvisioningAttempt[];
  lifecycleEvents: LifecycleEvent[];
}

const SCHOOLS_KEY = ["platform", "schools"];

function useToken() {
  return usePlatformAuthStore((s) => s.accessToken);
}

function useAuthed() {
  return usePlatformAuthStore((s) => s.status === "authenticated" && Boolean(s.accessToken));
}

export function useSchools() {
  const token = useToken();
  const enabled = useAuthed();
  return useQuery({
    queryKey: SCHOOLS_KEY,
    enabled,
    queryFn: () => apiFetch<School[]>("/v1/platform/schools", { headers: platformAuthHeaders(token) }),
  });
}

export function useSchool(id: string | null) {
  const token = useToken();
  const enabled = useAuthed();
  return useQuery({
    queryKey: [...SCHOOLS_KEY, id],
    enabled: enabled && Boolean(id),
    queryFn: () => apiFetch<SchoolDetail>(`/v1/platform/schools/${id}`, { headers: platformAuthHeaders(token) }),
  });
}

export interface CreateSchoolInput {
  name: string;
  slug: string;
  adminEmail: string;
  adminPassword: string;
  adminFirstName: string;
  adminLastName: string;
}

export function useCreateSchool() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSchoolInput) =>
      apiFetch<{ school: School }>("/v1/platform/schools", {
        method: "POST",
        headers: platformAuthHeaders(token),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SCHOOLS_KEY }),
  });
}

/** Suspend or reactivate. Both require a reason — see ChangeSchoolStatusDto. */
export function useChangeSchoolStatus(schoolId: string, action: "suspend" | "reactivate") {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) =>
      apiFetch<School>(`/v1/platform/schools/${schoolId}/${action}`, {
        method: "PATCH",
        headers: platformAuthHeaders(token),
        body: { reason },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SCHOOLS_KEY }),
  });
}
