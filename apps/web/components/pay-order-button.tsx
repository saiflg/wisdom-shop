"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { usePaymentProviders, useStartPayment } from "@/lib/use-checkout";

const PROVIDER_LABELS: Record<string, string> = {
  STRIPE: "Pay by card",
  PAYSTACK: "Pay with Paystack",
  FLUTTERWAVE: "Pay with Flutterwave",
  PAYPAL: "Pay with PayPal",
};

/**
 * Only rendered for PENDING orders, and only offers providers the server
 * reports as configured — a button that could only ever return 503 is worse
 * than no button.
 */
export function PayOrderButton({ orderNumber }: { orderNumber: string }) {
  const { data: providers, isLoading } = usePaymentProviders();
  const startPayment = useStartPayment();
  const [error, setError] = useState<string | null>(null);

  if (isLoading) {
    return <div className="mt-4 h-11 w-48 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />;
  }

  const available = providers?.filter((p) => p.configured) ?? [];

  if (available.length === 0) {
    return (
      <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
        Online payment isn&apos;t available on this site yet. Contact support to arrange payment for
        this order.
      </p>
    );
  }

  async function handlePay(provider: string) {
    setError(null);
    try {
      const result = await startPayment.mutateAsync({ orderNumber, provider });
      if (!result.redirectUrl) {
        setError("The payment provider didn't return a checkout link. Please try again.");
        return;
      }
      // Full navigation, not a client-side route change — this leaves the app.
      window.location.href = result.redirectUrl;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError("This order can no longer be paid. Refresh the page to see its current status.");
      } else {
        setError(
          err instanceof ApiError ? err.message : "Couldn't start payment. Please try again.",
        );
      }
    }
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-3">
        {available.map((p) => (
          <button
            key={p.provider}
            type="button"
            onClick={() => handlePay(p.provider)}
            disabled={startPayment.isPending}
            className="rounded-lg bg-brand-gradient px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {startPayment.isPending ? "Redirecting…" : (PROVIDER_LABELS[p.provider] ?? p.provider)}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
