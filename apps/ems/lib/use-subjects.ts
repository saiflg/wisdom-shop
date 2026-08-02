"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export interface Subject {
  id: string;
  name: string;
  gradeLevel: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CreateSubjectInput {
  name: string;
  gradeLevel?: string;
}

const SUBJECTS_KEY = ["subjects"];

export function useSubjects() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: SUBJECTS_KEY,
    enabled,
    queryFn: () => apiFetch<Subject[]>("/v1/subjects", { headers: authHeaders(accessToken) }),
  });
}

export function useCreateSubject() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSubjectInput) =>
      apiFetch<Subject>("/v1/subjects", { method: "POST", headers: authHeaders(accessToken), body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SUBJECTS_KEY }),
  });
}
