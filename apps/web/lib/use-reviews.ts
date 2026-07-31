"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { useAuthStore } from "@/store/auth-store";

export interface Review {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  createdAt: string;
  updatedAt: string;
  authorName: string;
  authorUserId: string;
}

export interface RatingSummary {
  average: number;
  count: number;
  distribution: Record<string, number>;
}

export interface ReviewPage {
  data: Review[];
  summary: RatingSummary;
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export type ReviewRefusalReason = "not-purchased" | "order-not-settled" | "already-reviewed";

export interface ReviewEligibility {
  canReview: boolean;
  reason: ReviewRefusalReason | null;
  yourReview: Review | null;
}

function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const reviewsKey = (slug: string) => ["product-reviews", slug];
const eligibilityKey = (slug: string) => ["product-review-eligibility", slug];

export function useReviews(slug: string) {
  return useQuery({
    queryKey: reviewsKey(slug),
    // Public: no token needed, and reviews should render for signed-out
    // visitors like any other part of the product page.
    queryFn: () => apiFetch<ReviewPage>(`/v1/products/${slug}/reviews`),
  });
}

export function useReviewEligibility(slug: string) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const status = useAuthStore((s) => s.status);

  return useQuery({
    queryKey: eligibilityKey(slug),
    enabled: status === "authenticated" && Boolean(accessToken),
    queryFn: () =>
      apiFetch<ReviewEligibility>(`/v1/products/${slug}/reviews/me`, {
        headers: authHeaders(accessToken),
      }),
  });
}

/** Both lists change together, so they are refreshed together. */
function useReviewInvalidation(slug: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: reviewsKey(slug) });
    queryClient.invalidateQueries({ queryKey: eligibilityKey(slug) });
  };
}

export function useCreateReview(slug: string) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const invalidate = useReviewInvalidation(slug);

  return useMutation({
    mutationFn: (input: { rating: number; title?: string; body?: string }) =>
      apiFetch<Review>(`/v1/products/${slug}/reviews`, {
        method: "POST",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateReview(slug: string) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const invalidate = useReviewInvalidation(slug);

  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; rating?: number; title?: string; body?: string }) =>
      apiFetch<Review>(`/v1/reviews/${id}`, {
        method: "PATCH",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteReview(slug: string) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const invalidate = useReviewInvalidation(slug);

  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/v1/reviews/${id}`, {
        method: "DELETE",
        headers: authHeaders(accessToken),
      }),
    onSuccess: invalidate,
  });
}

/** Why the review form is unavailable, in words a customer can act on. */
export function explainRefusal(reason: ReviewRefusalReason | null): string {
  switch (reason) {
    case "not-purchased":
      return "Only customers who bought this product can review it.";
    case "order-not-settled":
      return "You can review this once your order has been paid for.";
    case "already-reviewed":
      return "You've already reviewed this product.";
    default:
      return "";
  }
}
