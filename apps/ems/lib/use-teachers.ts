"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export interface Teacher {
  id: string;
  email: string | null;
  firstName: string;
  lastName: string;
  roles: string[];
}

export interface CreateTeacherInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

const TEACHERS_KEY = ["teachers"];

export function useTeachers() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: TEACHERS_KEY,
    enabled,
    queryFn: () => apiFetch<Teacher[]>("/v1/teachers", { headers: authHeaders(accessToken) }),
  });
}

export function useCreateTeacher() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTeacherInput) =>
      apiFetch<Teacher>("/v1/teachers", { method: "POST", headers: authHeaders(accessToken), body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TEACHERS_KEY }),
  });
}
