"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { platformAuthHeaders, usePlatformAuthStore } from "@/store/platform-auth-store";

function useToken() {
  return usePlatformAuthStore((s) => s.accessToken);
}

function useAuthed() {
  return usePlatformAuthStore((s) => s.status === "authenticated" && Boolean(s.accessToken));
}

export type DriftLevel = "UP_TO_DATE" | "BEHIND" | "UNREACHABLE" | "AHEAD";

export interface SchoolDrift {
  schoolId: string;
  name: string;
  slug: string;
  status: string;
  level: DriftLevel;
  /** Named, in the order they must be applied. */
  pending: string[];
  /** Applied there but absent from this build — a downgrade, not a gap. */
  unknown: string[];
  summary: string;
  unreachable: string | null;
}

export interface FleetMigrationStatus {
  migrationsInThisBuild: number;
  summary: {
    total: number;
    upToDate: number;
    behind: number;
    unreachable: number;
    ahead: number;
    headline: string;
  };
  schools: SchoolDrift[];
}

export interface ApplyResult {
  attempted: number;
  succeeded: number;
  failed: number;
  status: FleetMigrationStatus;
  results: { slug: string; applied: number; success: boolean; output?: string }[];
}

const KEY = ["platform", "migrations"];

export function useMigrationStatus() {
  const token = useToken();
  const enabled = useAuthed();
  return useQuery({
    queryKey: KEY,
    enabled,
    // Reading every school's database is not free, so this is not on a poll.
    staleTime: 60_000,
    queryFn: () =>
      apiFetch<FleetMigrationStatus>("/v1/platform/schools/migrations", { headers: platformAuthHeaders(token) }),
  });
}

export function useApplyMigrations() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (schoolId?: string) =>
      apiFetch<ApplyResult>("/v1/platform/schools/migrations/apply", {
        method: "POST",
        headers: platformAuthHeaders(token),
        body: schoolId ? { schoolId } : {},
      }),
    onSuccess: (result) => queryClient.setQueryData(KEY, result.status),
  });
}
