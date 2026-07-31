"use client";

import { useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  formatBytes,
  useAttachProductFile,
  useProductFiles,
  useRemoveProductFile,
} from "@/lib/use-uploads";

/**
 * Downloadable files attached to a product — what a customer receives when
 * they buy a digital good.
 *
 * Only shown when editing, because a file needs a product to hang off.
 */
export function ProductFiles({ productId }: { productId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: files, isLoading } = useProductFiles(productId);
  const attach = useAttachProductFile(productId);
  const remove = useRemoveProductFile(productId);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That didn't work.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
      <h2 className="text-lg font-semibold">Downloadable files</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        What the customer receives after paying. These are never publicly addressable — a buyer
        reaches them through their account, and only once the order is settled.
      </p>

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </p>
      )}

      {isLoading && <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">Loading files…</p>}

      {files && files.length > 0 && (
        <ul className="mt-4 space-y-2">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-2.5 text-sm dark:border-slate-800"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{file.originalName}</p>
                <p className="text-xs text-slate-500">
                  {formatBytes(file.sizeBytes)} · {file.contentType}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm(`Remove "${file.originalName}"? Buyers will lose access to it.`)) return;
                  void run(() => remove.mutateAsync(file.id));
                }}
                disabled={remove.isPending}
                className="rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-700 transition hover:border-red-400 disabled:opacity-60 dark:border-red-900 dark:text-red-400"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {files && files.length === 0 && (
        <p className="mt-3 text-sm text-slate-500">
          No files yet. A digital product without one has nothing to deliver after checkout.
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        aria-label="Attach a downloadable file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void run(() => attach.mutateAsync(file));
        }}
        className="mt-4 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-gradient file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:opacity-90"
      />
      {attach.isPending && <p className="mt-1 text-xs text-slate-500">Uploading…</p>}
    </section>
  );
}
