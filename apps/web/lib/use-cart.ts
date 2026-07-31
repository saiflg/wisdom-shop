"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { useAuthStore } from "@/store/auth-store";
import type { CartSummary } from "./cart-types";

export const CART_QUERY_KEY = ["cart"] as const;

function authHeaders(accessToken: string | null): Record<string, string> {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

/** Reads the cart only when signed in — the endpoint 401s for guests. */
export function useCart() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const status = useAuthStore((s) => s.status);

  return useQuery({
    queryKey: CART_QUERY_KEY,
    enabled: status === "authenticated" && Boolean(accessToken),
    queryFn: () => apiFetch<CartSummary>("/v1/cart", { headers: authHeaders(accessToken) }),
  });
}

/**
 * Every cart mutation returns the full updated cart, so the response is
 * written straight into the query cache — no refetch round-trip needed.
 */
function useCartMutation<TVariables>(
  request: (vars: TVariables, accessToken: string | null) => Promise<CartSummary>,
) {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);

  return useMutation({
    mutationFn: (vars: TVariables) => request(vars, accessToken),
    onSuccess: (cart) => queryClient.setQueryData(CART_QUERY_KEY, cart),
  });
}

export function useAddToCart() {
  return useCartMutation<{ productId: string; variantId?: string; quantity?: number }>((vars, token) =>
    apiFetch<CartSummary>("/v1/cart/items", {
      method: "POST",
      headers: authHeaders(token),
      body: vars,
    }),
  );
}

export function useUpdateCartItem() {
  return useCartMutation<{ itemId: string; quantity: number }>(({ itemId, quantity }, token) =>
    apiFetch<CartSummary>(`/v1/cart/items/${itemId}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: { quantity },
    }),
  );
}

export function useRemoveCartItem() {
  return useCartMutation<{ itemId: string }>(({ itemId }, token) =>
    apiFetch<CartSummary>(`/v1/cart/items/${itemId}`, {
      method: "DELETE",
      headers: authHeaders(token),
    }),
  );
}
