"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export interface GuardianLink {
  id: string;
  relationship: string;
  guardianUser: { id: string; firstName: string; lastName: string; email: string | null };
}

export interface StudentProfile {
  id: string;
  studentCode: string | null;
  dateOfBirth: string | null;
  user: { id: string; firstName: string; lastName: string; email: string | null };
  enrollments: { id: string; class: { id: string; name: string; academicYear: string } }[];
  guardianLinks: GuardianLink[];
}

export interface CreateStudentInput {
  firstName: string;
  lastName: string;
  email?: string;
  password?: string;
  studentCode?: string;
  dateOfBirth?: string;
}

const STUDENTS_KEY = ["students"];

export function useStudents() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: STUDENTS_KEY,
    enabled,
    queryFn: () => apiFetch<StudentProfile[]>("/v1/students", { headers: authHeaders(accessToken) }),
  });
}

export function useStudent(id: string | null) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: ["students", id],
    enabled: enabled && Boolean(id),
    queryFn: () => apiFetch<StudentProfile>(`/v1/students/${id}`, { headers: authHeaders(accessToken) }),
  });
}

export function useCreateStudent() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateStudentInput) =>
      apiFetch<StudentProfile>("/v1/students", { method: "POST", headers: authHeaders(accessToken), body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: STUDENTS_KEY }),
  });
}
