"use client";

import { useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api";
import { formatPrice } from "@/lib/catalog";
import { PRODUCT_STATUSES } from "@/lib/product-form";
import { useAdminProducts, useDeleteProduct, useUpdateProduct } from "@/lib/use-catalog-admin";

const STATUS_STYLES: Record<string, string> = {
  PUBLISHED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  DRAFT: "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300",
  ARCHIVED: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400",
};

/**
 * The vendor's own products.
 *
 * Everything goes through the "vendor" scope, which targets
 * `/v1/vendor/products` — the API resolves the vendor id from the token on
 * every request, so this list cannot be made to show another vendor's rows
 * however it is called.
 */
export function VendorProductList() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [applied, setApplied] = useState<{ search?: string; status?: string; page: number }>({ page: 1 });
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, isLoading, error } = useAdminProducts(applied, "vendor");
  const update = useUpdateProduct("vendor");
  const remove = useDeleteProduct("vendor");

  const inputClass =
    "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900";

  async function run(fn: () => Promise<unknown>) {
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "That change was refused.");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/vendor/products/new"
          className="rounded-lg bg-brand-gradient px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Add product
        </Link>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setApplied({ search: search || undefined, status: status || undefined, page: 1 });
        }}
        className="flex flex-wrap gap-3"
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search your products"
          aria-label="Search products"
          className={`${inputClass} min-w-[14rem] flex-1`}
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filter by status"
          className={inputClass}
        >
          <option value="">All statuses</option>
          {PRODUCT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.toLowerCase()}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-brand-gradient px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Filter
        </button>
      </form>

      {actionError && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {actionError}
        </p>
      )}

      {isLoading && <p className="text-sm text-slate-600 dark:text-slate-400">Loading products…</p>}

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          Couldn&apos;t load your products: {error.message}
        </p>
      )}

      {data && data.data.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
          <p className="font-medium">No products yet</p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            {applied.search || applied.status
              ? "None of your products match that filter."
              : "Add your first product. It starts as a draft, so nothing goes live until you publish it."}
          </p>
        </div>
      )}

      {data && data.data.length > 0 && (
        <ul className="space-y-3">
          {data.data.map((product) => (
            <li key={product.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/vendor/products/${product.id}`}
                    className="font-medium hover:text-brand-600 hover:underline dark:hover:text-brand-400"
                  >
                    {product.title}
                  </Link>
                  <p className="mt-1 truncate text-sm text-slate-600 dark:text-slate-400">
                    {product.type.toLowerCase().replace(/_/g, " ")}
                    {product.sku ? ` · ${product.sku}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {product.stockQty === null ? "Unlimited stock" : `${product.stockQty} in stock`}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                      STATUS_STYLES[product.status] ?? STATUS_STYLES.ARCHIVED
                    }`}
                  >
                    {product.status.toLowerCase()}
                  </span>
                  <span className="font-semibold">
                    {formatPrice(product.priceCents, product.currency)}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {product.status !== "PUBLISHED" && (
                  <button
                    type="button"
                    onClick={() =>
                      run(() => update.mutateAsync({ id: product.id, payload: { status: "PUBLISHED" } }))
                    }
                    disabled={update.isPending}
                    className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium transition hover:border-brand-400 disabled:opacity-60 dark:border-slate-700"
                  >
                    Publish
                  </button>
                )}
                {product.status === "PUBLISHED" && (
                  <button
                    type="button"
                    onClick={() =>
                      run(() => update.mutateAsync({ id: product.id, payload: { status: "DRAFT" } }))
                    }
                    disabled={update.isPending}
                    className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium transition hover:border-brand-400 disabled:opacity-60 dark:border-slate-700"
                  >
                    Unpublish
                  </button>
                )}
                <Link
                  href={`/vendor/products/${product.id}`}
                  className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium transition hover:border-brand-400 dark:border-slate-700"
                >
                  Edit
                </Link>
                {product.status === "PUBLISHED" && (
                  <Link
                    href={`/products/${product.slug}`}
                    className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium transition hover:border-brand-400 dark:border-slate-700"
                  >
                    View in shop
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (!window.confirm(`Delete "${product.title}"? It will be removed from the shop.`)) return;
                    void run(() => remove.mutateAsync(product.id));
                  }}
                  disabled={remove.isPending}
                  className="rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-700 transition hover:border-red-400 disabled:opacity-60 dark:border-red-900 dark:text-red-400"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {data && data.meta.totalPages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={applied.page <= 1}
            onClick={() => setApplied({ ...applied, page: applied.page - 1 })}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium transition hover:border-brand-400 disabled:opacity-50 dark:border-slate-700"
          >
            Previous
          </button>
          <span className="text-sm text-slate-600 dark:text-slate-400">
            Page {data.meta.page} of {data.meta.totalPages} · {data.meta.total} products
          </span>
          <button
            type="button"
            disabled={applied.page >= data.meta.totalPages}
            onClick={() => setApplied({ ...applied, page: applied.page + 1 })}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium transition hover:border-brand-400 disabled:opacity-50 dark:border-slate-700"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
