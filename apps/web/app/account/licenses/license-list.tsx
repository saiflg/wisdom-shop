"use client";

import Link from "next/link";
import { useState } from "react";
import { ApiError } from "@/lib/api";
import { useMyLicenses, useSetupHandoff, type License } from "@/lib/use-account";

const STATUS_STYLES: Record<License["status"], string> = {
  ACTIVE: "bg-green-100 text-green-900 dark:bg-green-950/50 dark:text-green-200",
  REVOKED: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  EXPIRED: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

export function LicenseList() {
  const { data: licenses, isLoading, error } = useMyLicenses();
  const handoff = useSetupHandoff();
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  if (isLoading) {
    return <p className="text-sm text-slate-600 dark:text-slate-400">Loading licenses…</p>;
  }

  if (error) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
        Couldn&apos;t load your licenses: {error.message}
      </p>
    );
  }

  if (!licenses || licenses.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-700">
        <p className="font-medium">You don&apos;t have any licenses yet</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Licenses appear here once a software purchase is paid for.
        </p>
        <Link
          href="/products?type=SOFTWARE"
          className="mt-4 inline-block rounded-full bg-brand-gradient px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Browse software
        </Link>
      </div>
    );
  }

  async function handleSetup(key: string) {
    setHandoffError(null);
    setPendingKey(key);
    try {
      const { redirectUrl } = await handoff.mutateAsync(key);
      // The token is short-lived, so it's fetched on click and used at once
      // rather than being embedded in the page.
      window.location.href = redirectUrl;
    } catch (err) {
      setHandoffError(
        err instanceof ApiError
          ? err.message
          : "Couldn't start your school setup. Please try again.",
      );
      setPendingKey(null);
    }
  }

  return (
    <div className="space-y-4">
      {handoffError && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {handoffError}
        </p>
      )}

      <ul className="space-y-3">
        {licenses.map((license) => {
          const expired =
            license.expiresAt !== null && new Date(license.expiresAt).getTime() < Date.now();
          const usable = license.status === "ACTIVE" && !expired;

          return (
            <li key={license.id} className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{license.product.title}</p>
                  <p className="mt-1 font-mono text-sm">{license.key}</p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Order {license.order.orderNumber}
                    {license.seats > 1 && ` · ${license.seats} seats`}
                    {license.expiresAt &&
                      ` · ${expired ? "expired" : "expires"} ${new Date(license.expiresAt).toLocaleDateString()}`}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[license.status]}`}
                >
                  {expired && license.status === "ACTIVE" ? "Expired" : license.status.toLowerCase()}
                </span>
              </div>

              {usable && (
                <button
                  type="button"
                  onClick={() => handleSetup(license.key)}
                  disabled={pendingKey === license.key}
                  className="mt-4 rounded-lg bg-brand-gradient px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                >
                  {pendingKey === license.key ? "Preparing…" : "Complete Your School Setup"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
