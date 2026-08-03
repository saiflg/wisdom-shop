"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authHeaders, useAuthQueryState } from "./api-auth";

export type SmtpEncryption = "NONE" | "TLS" | "SSL";
export type PaymentProvider = "PAYSTACK" | "FLUTTERWAVE" | "STRIPE";

export const PAYMENT_PROVIDERS: PaymentProvider[] = ["PAYSTACK", "FLUTTERWAVE", "STRIPE"];

/**
 * Secret fields arrive as a mask (`sk_••••4b7d`) or null, never the real
 * value. Sending a field back omitted or empty keeps what's stored; sending
 * null clears it — see the API's secret-update.ts.
 */
export interface EmailGatewayView {
  host: string | null;
  port: number | null;
  username: string | null;
  encryption: SmtpEncryption;
  senderName: string | null;
  senderEmail: string | null;
  password: string | null;
  configured: boolean;
}

export interface SmsGatewayView {
  providerName: string | null;
  baseUrl: string | null;
  senderId: string | null;
  apiKey: string | null;
  apiSecret: string | null;
  configured: boolean;
}

export interface WhatsAppGatewayView {
  phoneNumberId: string | null;
  businessAccountId: string | null;
  webhookUrl: string | null;
  accessToken: string | null;
  webhookVerifyToken: string | null;
  configured: boolean;
}

export interface PushGatewayView {
  providerName: string | null;
  credentials: string | null;
  configured: boolean;
}

export interface CommunicationSettings {
  email: EmailGatewayView;
  sms: SmsGatewayView;
  whatsapp: WhatsAppGatewayView;
  push: PushGatewayView;
}

export interface PaymentGatewayView {
  provider: PaymentProvider;
  publicKey: string | null;
  currency: string | null;
  enabled: boolean;
  secretKey: string | null;
  webhookSecret: string | null;
  configured: boolean;
}

const COMMUNICATION_KEY = ["settings", "communication"];
const PAYMENTS_KEY = ["settings", "payments"];

export function useCommunicationSettings() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: COMMUNICATION_KEY,
    enabled,
    queryFn: () => apiFetch<CommunicationSettings>("/v1/settings/communication", { headers: authHeaders(accessToken) }),
  });
}

function useGatewayMutation<TInput, TResult>(path: string, invalidate: string[]) {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) =>
      apiFetch<TResult>(path, { method: "PATCH", headers: authHeaders(accessToken), body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: invalidate }),
  });
}

export const useUpdateEmailGateway = () =>
  useGatewayMutation<Record<string, unknown>, EmailGatewayView>("/v1/settings/communication/email", COMMUNICATION_KEY);
export const useUpdateSmsGateway = () =>
  useGatewayMutation<Record<string, unknown>, SmsGatewayView>("/v1/settings/communication/sms", COMMUNICATION_KEY);
export const useUpdateWhatsAppGateway = () =>
  useGatewayMutation<Record<string, unknown>, WhatsAppGatewayView>(
    "/v1/settings/communication/whatsapp",
    COMMUNICATION_KEY,
  );
export const useUpdatePushGateway = () =>
  useGatewayMutation<Record<string, unknown>, PushGatewayView>("/v1/settings/communication/push", COMMUNICATION_KEY);

export function useTestGateway(gateway: "email" | "sms" | "whatsapp") {
  const accessToken = useAuthQueryState().accessToken;
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<{ ok: true; sentTo: string }>(`/v1/settings/communication/${gateway}/test`, {
        method: "POST",
        headers: authHeaders(accessToken),
        body,
      }),
  });
}

export function usePaymentSettings() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: PAYMENTS_KEY,
    enabled,
    queryFn: () => apiFetch<PaymentGatewayView[]>("/v1/settings/payments", { headers: authHeaders(accessToken) }),
  });
}

export function useUpdatePaymentGateway(provider: PaymentProvider) {
  const accessToken = useAuthQueryState().accessToken;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      apiFetch<PaymentGatewayView>(`/v1/settings/payments/${provider}`, {
        method: "PATCH",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PAYMENTS_KEY }),
  });
}

export function useTestPaymentGateway(provider: PaymentProvider) {
  const accessToken = useAuthQueryState().accessToken;
  return useMutation({
    mutationFn: () =>
      apiFetch<{ ok: true; provider: PaymentProvider; detail: string }>(`/v1/settings/payments/${provider}/test`, {
        method: "POST",
        headers: authHeaders(accessToken),
      }),
  });
}
