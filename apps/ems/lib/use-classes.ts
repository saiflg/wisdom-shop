"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export interface SchoolClass {
  id: string;
  name: string;
  gradeLevel: string | null;
  academicYear: string;
  homeroomTeacherId: string | null;
  homeroomTeacher: { id: string; firstName: string; lastName: string } | null;
  enrollments?: {
    id: string;
    /** `id` is the StudentProfile id — the key attendance and enrollment both use. */
    studentProfile: { id: string; user: { id: string; firstName: string; lastName: string } };
  }[];
}

export interface CreateClassInput {
  name: string;
  gradeLevel?: string;
  academicYear: string;
  homeroomTeacherId?: string;
}

const CLASSES_KEY = ["classes"];

export function useClasses() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: CLASSES_KEY,
    enabled,
    queryFn: () => apiFetch<SchoolClass[]>("/v1/classes", { headers: authHeaders(accessToken) }),
  });
}

export function useClass(id: string | null) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: ["classes", id],
    enabled: enabled && Boolean(id),
    queryFn: () => apiFetch<SchoolClass>(`/v1/classes/${id}`, { headers: authHeaders(accessToken) }),
  });
}

export function useCreateClass() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateClassInput) =>
      apiFetch<SchoolClass>("/v1/classes", { method: "POST", headers: authHeaders(accessToken), body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLASSES_KEY }),
  });
}
