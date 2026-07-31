"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { useAdminVendors, useUpdateVendorStatus } from "@/lib/use-admin";

/** Mirrors the server's vendor transition table, so the UI only offers legal moves. */
const NEXT_STATUSES: Record<string, string[]> = {
  PENDING: ["APPROVED", "REJECTED"],
  APPROVED: ["SUSPENDED"],
  SUSPENDED: ["APPROVED"],
  REJECTED: [],
};

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
  APPROVED: "bg-green-100 text-green-900 dark:bg-green-950/50 dark:text-green-200",
  SUSPENDED: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  REJECTED: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

export function AdminVendorList() {
  const [filter, setFilter] = useState("");
  const { data: vendors, isLoading, error } = useAdminVendors(filter || undefined);
  const updateStatus = useUpdateVendorStatus();
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleChange(id: string, status: string) {
    setActionError(null);
    try {
      await updateStatus.mutateAsync({ id, status });
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Couldn't update that vendor.");
    }
  }

  return (
    <div className="space-y-5">
      <select
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        aria-label="Filter by vendor status"
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
      >
        <option value="">All statuses</option>
        {Object.keys(NEXT_STATUSES).map((s) => (
          <option key={s} value={s}>
            {s.toLowerCase()}
          </option>
        ))}
      </select>

      {actionError && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {actionError}
        </p>
      )}

      {isLoading && <p className="text-sm text-slate-600 dark:text-slate-400">Loading vendors…</p>}

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          Couldn&apos;t load vendors: {error.message}
        </p>
      )}

      {vendors && vendors.length === 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-400">No vendors to show.</p>
      )}

      {vendors && vendors.length > 0 && (
        <ul className="space-y-3">
          {vendors.map((vendor) => (
            <li key={vendor.id} className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{vendor.storeName}</p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    {vendor.user.email} · {vendor.commissionPct}% commission
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[vendor.status]}`}>
                  {vendor.status.toLowerCase()}
                </span>
              </div>

              {NEXT_STATUSES[vendor.status]!.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {NEXT_STATUSES[vendor.status]!.map((next) => (
                    <button
                      key={next}
                      type="button"
                      onClick={() => handleChange(vendor.id, next)}
                      disabled={updateStatus.isPending}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium transition hover:border-brand-400 disabled:opacity-60 dark:border-slate-700"
                    >
                      {next.toLowerCase()}
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-2 text-xs text-slate-500">
                Approving grants the VENDOR role; suspending or rejecting revokes it.
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
