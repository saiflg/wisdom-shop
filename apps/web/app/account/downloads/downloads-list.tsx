"use client";

import { useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { downloadFile, formatBytes, useMyDownloads } from "@/lib/use-uploads";
import { RequireAuth } from "@/components/require-auth";

export function DownloadsList() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const { data, isLoading, error } = useMyDownloads();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleDownload(fileId: string, filename: string) {
    setActionError(null);
    setBusyId(fileId);
    try {
      await downloadFile(fileId, filename, accessToken);
    } catch (err) {
      // The API distinguishes "never bought it" from "the order isn't paid
      // for", and the difference is exactly what the customer needs to know.
      setActionError(err instanceof ApiError ? err.message : "That download couldn't be started.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <RequireAuth>
      {isLoading && <p className="text-sm text-slate-600 dark:text-slate-400">Loading your downloads…</p>}

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          Couldn&apos;t load your downloads: {error.message}
        </p>
      )}

      {actionError && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {actionError}
        </p>
      )}

      {data && data.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
          <p className="font-medium">Nothing to download yet</p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Files appear here once an order containing a downloadable product has been paid for.
          </p>
          <Link
            href="/products"
            className="mt-4 inline-block rounded-full bg-brand-gradient px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Browse the shop
          </Link>
        </div>
      )}

      {data && data.length > 0 && (
        <ul className="space-y-4">
          {data.map((item) => (
            <li key={item.productId} className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link
                    href={`/products/${item.productSlug}`}
                    className="font-medium hover:text-brand-600 hover:underline dark:hover:text-brand-400"
                  >
                    {item.productTitle}
                  </Link>
                  <p className="mt-1 text-xs text-slate-500">
                    Order {item.orderNumber} · {new Date(item.purchasedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <ul className="mt-4 space-y-2">
                {item.files.map((file) => (
                  <li
                    key={file.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-2.5 text-sm dark:border-slate-800"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{file.originalName}</p>
                      <p className="text-xs text-slate-500">{formatBytes(file.sizeBytes)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDownload(file.id, file.originalName)}
                      disabled={busyId === file.id}
                      className="rounded-lg bg-brand-gradient px-4 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                    >
                      {busyId === file.id ? "Preparing…" : "Download"}
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </RequireAuth>
  );
}
