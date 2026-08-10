"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { platformAuthHeaders, usePlatformAuthStore } from "@/store/platform-auth-store";

export type SchoolStatus = "PROVISIONING" | "ACTIVE" | "SUSPENDED" | "FAILED";

/** A module key — see apps/ems-api/src/schools/school-modules.ts. */
export type ModuleKey = string;

export interface ModuleDefinition {
  key: ModuleKey;
  label: string;
  description: string;
  group: string;
  /** Core modules cannot be switched off, and the console must not offer to. */
  core: boolean;
}

export interface School {
  id: string;
  name: string;
  slug: string;
  databaseName: string;
  customDomain: string | null;
  status: SchoolStatus;
  licenseKey: string | null;
  /** What this school may actually use, after the plan and its own exceptions. */
  modules: ModuleKey[];
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

export interface ModuleChange {
  id: string;
  module: ModuleKey;
  enabled: boolean;
  reason: string;
  actorEmail: string;
  createdAt: string;
}

export interface SchoolDetail extends School {
  provisioningAttempts: ProvisioningAttempt[];
  lifecycleEvents: LifecycleEvent[];
  moduleChanges: ModuleChange[];
  /** What the plan grants, before this school's own exceptions. */
  planModules: ModuleKey[];
  /** Only the exceptions, so the console can show which switches are overrides. */
  overrides: Record<string, boolean>;
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

export interface UpdateSchoolInput {
  name?: string;
  /** An empty string clears it, which is distinct from omitting the field. */
  customDomain?: string;
}

export function useUpdateSchool(schoolId: string) {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateSchoolInput) =>
      apiFetch<School>(`/v1/platform/schools/${schoolId}`, {
        method: "PATCH",
        headers: platformAuthHeaders(token),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SCHOOLS_KEY }),
  });
}

/** The catalog is a property of the build, so it never changes while the console is open. */
export function useModuleCatalog() {
  const token = useToken();
  const enabled = useAuthed();
  return useQuery({
    queryKey: [...SCHOOLS_KEY, "module-catalog"],
    enabled,
    staleTime: Infinity,
    queryFn: () =>
      apiFetch<ModuleDefinition[]>("/v1/platform/schools/modules/catalog", {
        headers: platformAuthHeaders(token),
      }),
  });
}

export interface SetModulesInput {
  modules: { module: ModuleKey; enabled: boolean }[];
  reason: string;
}

export function useSetSchoolModules(schoolId: string) {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SetModulesInput) =>
      apiFetch<SchoolDetail>(`/v1/platform/schools/${schoolId}/modules`, {
        method: "PUT",
        headers: platformAuthHeaders(token),
        body: input,
      }),
    onSuccess: (detail) => {
      queryClient.setQueryData([...SCHOOLS_KEY, schoolId], detail);
      void queryClient.invalidateQueries({ queryKey: SCHOOLS_KEY });
    },
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
