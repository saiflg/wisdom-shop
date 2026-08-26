"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/i18n-provider";
import { FormField } from "@/components/form-field";
import { SecretField } from "@/components/secret-field";
import {
  usePaymentSettings,
  useTestPaymentGateway,
  useUpdatePaymentGateway,
  type PaymentGatewayView,
} from "@/lib/use-settings";

export default function PaymentSettingsPage() {
  const { t } = useTranslation();
  const { data, isLoading, error } = usePaymentSettings();

  if (isLoading) return <p className="text-sm text-slate-600 dark:text-slate-400">{t("common.loading")}</p>;
  if (error) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
        {error.message}
      </p>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("settings.paymentsTitle")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">{t("settings.paymentsIntro")}</p>
      </div>

      {data.map((gateway) => (
        <ProviderCard key={gateway.provider} gateway={gateway} />
      ))}
    </div>
  );
}

const PROVIDER_LABELS: Record<PaymentGatewayView["provider"], string> = {
  PAYSTACK: "Paystack",
  OPAY: "OPay",
  FLUTTERWAVE: "Flutterwave",
  STRIPE: "Stripe",
};

function ProviderCard({ gateway }: { gateway: PaymentGatewayView }) {
  const { t } = useTranslation();
  const update = useUpdatePaymentGateway(gateway.provider);
  const test = useTestPaymentGateway(gateway.provider);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  // OPay needs one credential more than the others and has no read-only
  // endpoint to check them against, so its card differs in two places.
  const isOpay = gateway.provider === "OPAY";

  const report = (tone: "ok" | "error", text: string) => setMessage({ tone, text });
  const fromError = (err: unknown, fallback: string) =>
    report("error", err instanceof ApiError ? err.message : fallback);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const secretKey = String(form.get("secretKey") ?? "");
    const webhookSecret = String(form.get("webhookSecret") ?? "");
    try {
      await update.mutateAsync({
        publicKey: String(form.get("publicKey") ?? "") || undefined,
        currency: String(form.get("currency") ?? "") || undefined,
        enabled: form.get("enabled") === "on",
        // OPay only. Sent unconditionally for OPay so clearing the box
        // clears the stored value, rather than leaving a stale merchant id
        // behind an empty field.
        ...(isOpay
          ? { merchantId: String(form.get("merchantId") ?? ""), sandbox: form.get("sandbox") === "on" }
          : {}),
        ...(secretKey ? { secretKey } : {}),
        ...(webhookSecret ? { webhookSecret } : {}),
      });
      report("ok", t("common.saved"));
    } catch (err) {
      fromError(err, t("settings.saveFailed"));
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{PROVIDER_LABELS[gateway.provider]}</h2>
        <span
          className={
            gateway.configured
              ? "rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
              : "rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400"
          }
        >
          {gateway.configured ? t("settings.configured") : t("settings.notConfigured")}
        </span>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {/* The publishable key is not a secret, so it is shown in full. */}
          <FormField label={t("settings.paymentPublicKey")} name="publicKey" defaultValue={gateway.publicKey ?? ""} />
          <FormField
            label={t("settings.paymentCurrency")}
            name="currency"
            maxLength={3}
            defaultValue={gateway.currency ?? ""}
            placeholder="NGN"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <SecretField
            label={t("settings.paymentSecretKey")}
            name="secretKey"
            storedMask={gateway.secretKey}
            onClear={async () => {
              setMessage(null);
              try {
                await update.mutateAsync({ secretKey: null });
                report("ok", t("common.saved"));
              } catch (err) {
                fromError(err, t("settings.saveFailed"));
              }
            }}
          />
          <SecretField
            label={t("settings.paymentWebhookSecret")}
            name="webhookSecret"
            storedMask={gateway.webhookSecret}
          />
        </div>

        {isOpay && (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Merchant ID"
              name="merchantId"
              defaultValue={gateway.merchantId ?? ""}
              placeholder="e.g. 281822xxxxxxxxx"
            />
            <label className="flex items-start gap-2 self-end pb-2 text-sm">
              <input type="checkbox" name="sandbox" defaultChecked={gateway.sandbox} className="mt-0.5 h-4 w-4" />
              <span>
                Test mode
                <span className="block text-xs text-slate-500">
                  Sandbox keys take real-looking payments that are not real. Parents are shown a “test mode” label.
                </span>
              </span>
            </label>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="enabled" defaultChecked={gateway.enabled} className="h-4 w-4" />
          {t("settings.paymentEnabled")}
        </label>

        {message && (
          <p
            role={message.tone === "error" ? "alert" : undefined}
            className={
              message.tone === "error"
                ? "rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400"
                : "text-sm text-emerald-600 dark:text-emerald-400"
            }
          >
            {message.text}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={update.isPending}
            className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {t("common.save")}
          </button>
          <button
            type="button"
            disabled={test.isPending || !gateway.configured || isOpay}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-900"
            onClick={async () => {
              setMessage(null);
              try {
                const result = await test.mutateAsync();
                report("ok", result.detail);
              } catch (err) {
                fromError(err, t("settings.testFailed"));
              }
            }}
          >
            {t("settings.runTest")}
          </button>
          <span className="text-xs text-slate-500">
            {isOpay
              ? "OPay has no read-only credential check. Save the details and take one sandbox payment to confirm them."
              : t("settings.paymentTestNote")}
          </span>
        </div>
      </form>
    </section>
  );
}
