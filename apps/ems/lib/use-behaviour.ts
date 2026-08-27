"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export type BehaviourKind = "MERIT" | "CONCERN";

export interface BehaviourRecord {
  id: string;
  kind: BehaviourKind;
  category: string;
  description: string;
  points: number;
  occurredAt: string;
  recordedByName: string;
  createdAt: string;
  updatedAt: string;
  class: { id: string; name: string } | null;
}

export interface BehaviourSummary {
  merits: number;
  concerns: number;
  meritPoints: number;
  concernPoints: number;
  netPoints: number;
  topCategories: { category: string; count: number }[];
}

export interface BehaviourForStudent {
  records: BehaviourRecord[];
  summary: BehaviourSummary;
}

export interface CreateBehaviourInput {
  studentProfileId: string;
  classId?: string;
  kind: BehaviourKind;
  category: string;
  description: string;
  points?: number;
  occurredAt?: string;
}

const KEY = ["behaviour"];

export function useBehaviourForStudent(studentProfileId: string | null) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...KEY, studentProfileId],
    enabled: enabled && Boolean(studentProfileId),
    queryFn: () =>
      apiFetch<BehaviourForStudent>(`/v1/behaviour/students/${studentProfileId}`, {
        headers: authHeaders(accessToken),
      }),
  });
}

export function useCreateBehaviourRecord() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBehaviourInput) =>
      apiFetch<BehaviourRecord>("/v1/behaviour", {
        method: "POST",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useWithdrawBehaviourRecord() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/v1/behaviour/${id}`, { method: "DELETE", headers: authHeaders(accessToken) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

/**
 * Whether a record has been amended since it was written.
 *
 * Prisma sets updatedAt on create as well, so the two are equal to the
 * millisecond on an untouched row; a second of slack keeps a clock that
 * rounds differently from labelling every record "edited".
 */
export function wasAmended(record: BehaviourRecord): boolean {
  return new Date(record.updatedAt).getTime() - new Date(record.createdAt).getTime() > 1000;
}
