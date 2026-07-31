"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { useAuthStore } from "@/store/auth-store";
import { CART_QUERY_KEY } from "./use-cart";
import type { Address, CheckoutPreview, Order } from "./order-types";

function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function useAddresses() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const status = useAuthStore((s) => s.status);

  return useQuery({
    queryKey: ["addresses"],
    enabled: status === "authenticated" && Boolean(accessToken),
    queryFn: () => apiFetch<Address[]>("/v1/addresses", { headers: authHeaders(accessToken) }),
  });
}

export function useCreateAddress() {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);

  return useMutation({
    mutationFn: (body: Omit<Address, "id" | "isDefault"> & { isDefault?: boolean }) =>
      apiFetch<Address>("/v1/addresses", {
        method: "POST",
        headers: authHeaders(accessToken),
        body,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["addresses"] }),
  });
}

export function useCheckoutPreview() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const status = useAuthStore((s) => s.status);

  return useQuery({
    queryKey: ["checkout-preview"],
    enabled: status === "authenticated" && Boolean(accessToken),
    // Always re-read totals: shipping/tax and live prices can differ from
    // what the cart page showed.
    staleTime: 0,
    queryFn: () => apiFetch<CheckoutPreview>("/v1/checkout/preview", { headers: authHeaders(accessToken) }),
  });
}

export function usePlaceOrder() {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);

  return useMutation({
    mutationFn: (body: { addressId?: string; expectedTotalCents: number }) =>
      apiFetch<Order>("/v1/orders", {
        method: "POST",
        headers: authHeaders(accessToken),
        body,
      }),
    onSuccess: () => {
      // The server cleared the cart as part of the order transaction.
      queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["checkout-preview"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

export interface PaymentProviderStatus {
  provider: "STRIPE" | "PAYSTACK" | "FLUTTERWAVE" | "PAYPAL";
  configured: boolean;
}

/**
 * Which providers this deployment can actually take money with. The UI uses
 * this to avoid offering a Pay button that would only ever return 503.
 */
export function usePaymentProviders() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const status = useAuthStore((s) => s.status);

  return useQuery({
    queryKey: ["payment-providers"],
    enabled: status === "authenticated" && Boolean(accessToken),
    queryFn: () =>
      apiFetch<PaymentProviderStatus[]>("/v1/payments/providers", {
        headers: authHeaders(accessToken),
      }),
  });
}

export function useStartPayment() {
  const accessToken = useAuthStore((s) => s.accessToken);

  return useMutation({
    mutationFn: ({ orderNumber, provider }: { orderNumber: string; provider: string }) =>
      apiFetch<{ provider: string; redirectUrl: string | null }>(
        `/v1/payments/${provider.toLowerCase()}/checkout/${encodeURIComponent(orderNumber)}`,
        { method: "POST", headers: authHeaders(accessToken) },
      ),
  });
}

export function useOrders() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const status = useAuthStore((s) => s.status);

  return useQuery({
    queryKey: ["orders"],
    enabled: status === "authenticated" && Boolean(accessToken),
    queryFn: () => apiFetch<Order[]>("/v1/orders", { headers: authHeaders(accessToken) }),
  });
}
