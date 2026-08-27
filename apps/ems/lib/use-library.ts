"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export interface LibraryBook {
  id: string;
  title: string;
  author: string | null;
  isbn: string | null;
  category: string | null;
  copies: number;
  outstandingLoans: number;
  overdueLoans: number;
  availableCopies: number;
}

export interface LibrarySummary {
  /** Distinct titles, kept apart from copies: forty of one book is not forty books. */
  titles: number;
  copies: number;
  onLoan: number;
  available: number;
  overdue: number;
}

export interface LibraryLoan {
  id: string;
  borrowedOn: string;
  dueOn: string;
  returnedOn: string | null;
  issuedByName: string;
  overdue: boolean;
  daysOverdue: number;
  book: { id: string; title: string; author: string | null };
  studentProfile: { id: string; user: { firstName: string; lastName: string } };
}

export interface Catalogue {
  books: LibraryBook[];
  summary: LibrarySummary;
}

const KEY = ["library"];

export function useCatalogue(search: string) {
  const { accessToken, enabled } = useAuthQueryState();
  const suffix = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
  return useQuery({
    queryKey: [...KEY, "books", suffix],
    enabled,
    queryFn: () => apiFetch<Catalogue>(`/v1/library/books${suffix}`, { headers: authHeaders(accessToken) }),
  });
}

export function useLibraryLimits() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...KEY, "limits"],
    enabled,
    queryFn: () =>
      apiFetch<{ maxPerBorrower: number; loanDays: number }>("/v1/library/limits", {
        headers: authHeaders(accessToken),
      }),
  });
}

export function useLibraryLoans(studentProfileId?: string, includeReturned = false) {
  const { accessToken, enabled } = useAuthQueryState();
  const query = new URLSearchParams();
  if (studentProfileId) query.set("studentProfileId", studentProfileId);
  if (includeReturned) query.set("includeReturned", "true");
  const suffix = query.toString() ? `?${query}` : "";

  return useQuery({
    queryKey: [...KEY, "loans", suffix],
    enabled,
    queryFn: () => apiFetch<LibraryLoan[]>(`/v1/library/loans${suffix}`, { headers: authHeaders(accessToken) }),
  });
}

export function useAddBook() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { title: string; author?: string; category?: string; copies?: number }) =>
      apiFetch<LibraryBook>("/v1/library/books", {
        method: "POST",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useBorrow() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { bookId: string; studentProfileId: string }) =>
      apiFetch<LibraryLoan>("/v1/library/loans", {
        method: "POST",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useReturnLoan() {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (loanId: string) =>
      apiFetch<{ loan: LibraryLoan; alreadyReturned: boolean }>(`/v1/library/loans/${loanId}/return`, {
        method: "POST",
        headers: authHeaders(accessToken),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

/** How a loan's deadline reads, from the borrower's point of view. */
export function dueLabel(loan: LibraryLoan): string {
  if (loan.returnedOn) return `returned ${new Date(loan.returnedOn).toLocaleDateString()}`;
  if (loan.overdue) {
    return loan.daysOverdue === 1 ? "1 day overdue" : `${loan.daysOverdue} days overdue`;
  }
  return `due ${new Date(loan.dueOn).toLocaleDateString()}`;
}
