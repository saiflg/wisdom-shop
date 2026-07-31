"use client";

import { useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api";
import { formatPrice } from "@/lib/catalog";
import { useApplyAsVendor, useMyVendor, useVendorEarnings } from "@/lib/use-vendor";
import { RequireAuth } from "@/components/require-auth";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900";

interface StatusCopy {
  label: string;
  tone: string;
  detail: string;
}

// Keyed on the four VendorStatus values. Typed as a full record rather than
// a partial one so a new status added server-side fails the build here
// instead of rendering a blank badge.
const STATUS_COPY: Record<"PENDING" | "APPROVED" | "SUSPENDED" | "REJECTED", StatusCopy> = {
  PENDING: {
    label: "Awaiting review",
    tone: "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300",
    detail: "An administrator still has to approve your store. You'll be emailed when they do.",
  },
  APPROVED: {
    label: "Approved",
    tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
    detail: "Your store is live. Products you publish appear in the shop.",
  },
  SUSPENDED: {
    label: "Suspended",
    tone: "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300",
    detail: "Your products have been withdrawn from the shop. Contact support to discuss it.",
  },
  REJECTED: {
    label: "Not approved",
    tone: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400",
    detail: "Your application was declined. Contact support if you would like to discuss it.",
  },
};

function ApplyForm() {
  const [storeName, setStoreName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const apply = useApplyAsVendor();

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          await apply.mutateAsync({ storeName: storeName.trim() });
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Couldn't submit that application.");
        }
      }}
      className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800 sm:p-6"
    >
      <h2 className="text-lg font-semibold">Sell on Wisdom Shop</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Apply for a vendor account to list your own books, courses, software or equipment. An
        administrator reviews every application before a store goes live.
      </p>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="mt-4">
        <label htmlFor="store-name" className="block text-sm font-medium">Store name</label>
        <input
          id="store-name"
          required
          minLength={2}
          maxLength={100}
          value={storeName}
          onChange={(e) => setStoreName(e.target.value)}
          placeholder="Wisdom Academy Press"
          className={`mt-1.5 ${inputClass}`}
        />
        <p className="mt-1 text-xs text-slate-500">
          Shown to customers. The web address is generated from it.
        </p>
      </div>

      <button
        type="submit"
        disabled={apply.isPending}
        className="mt-5 rounded-lg bg-brand-gradient px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
      >
        {apply.isPending ? "Submitting…" : "Apply to sell"}
      </button>
    </form>
  );
}

export function VendorOverview() {
  const { data: vendor, isLoading, error } = useMyVendor();
  // Only an approved vendor may read earnings; asking otherwise is a 403.
  const { data: earnings } = useVendorEarnings(vendor?.status === "APPROVED");

  return (
    <RequireAuth>
      {isLoading && <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>}

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          Couldn&apos;t load your vendor account: {error.message}
        </p>
      )}

      {!isLoading && !error && vendor === null && <ApplyForm />}

      {vendor && (
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{vendor.storeName}</h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">/{vendor.slug}</p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_COPY[vendor.status].tone}`}
              >
                {STATUS_COPY[vendor.status].label}
              </span>
            </div>

            <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
              {STATUS_COPY[vendor.status].detail}
            </p>

            <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
              Commission: <strong>{vendor.commissionPct}%</strong> of each sale.{" "}
              <span className="text-slate-500">
                Orders already placed keep the rate that applied at the time, so a change never
                rewrites what you were owed.
              </span>
            </p>
          </section>

          {vendor.status === "APPROVED" && (
            <>
              {earnings && (
                <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-600 dark:text-slate-400">
                      Gross sales
                    </p>
                    <p className="mt-2 text-2xl font-bold">
                      {formatPrice(earnings.totals.grossCents, earnings.totals.currency)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {earnings.totals.payableLineCount} settled lines
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-600 dark:text-slate-400">
                      Commission
                    </p>
                    <p className="mt-2 text-2xl font-bold">
                      {formatPrice(earnings.totals.commissionCents, earnings.totals.currency)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">platform share</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-600 dark:text-slate-400">
                      Your earnings
                    </p>
                    <p className="mt-2 text-2xl font-bold">
                      {formatPrice(earnings.totals.netCents, earnings.totals.currency)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">settled orders only</p>
                  </div>
                </section>
              )}

              <div className="flex flex-wrap gap-3">
                <Link
                  href="/vendor/products"
                  className="rounded-lg bg-brand-gradient px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                >
                  Manage products
                </Link>
                <Link
                  href="/vendor/earnings"
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium transition hover:border-brand-400 dark:border-slate-700"
                >
                  View earnings
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </RequireAuth>
  );
}
