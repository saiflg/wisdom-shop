"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { formatPrice } from "@/lib/catalog";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { useAdminOrders, useUpdateOrderStatus } from "@/lib/use-admin";
import type { OrderStatus } from "@/lib/order-types";

const STATUSES: OrderStatus[] = [
  "PENDING",
  "PAID",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
];

export function AdminOrderList() {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState({ status: "", search: "" });
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, isLoading, error } = useAdminOrders(applied);
  const updateStatus = useUpdateOrderStatus();

  const selectClass =
    "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900";

  async function handleTransition(orderNumber: string, next: string) {
    setActionError(null);
    try {
      await updateStatus.mutateAsync({ orderNumber, status: next });
    } catch (err) {
      // 409 here is the transition table refusing an illegal move — surface
      // the server's explanation rather than a generic failure.
      setActionError(
        err instanceof ApiError ? err.message : "Couldn't update that order. Please try again.",
      );
    }
  }

  return (
    <div className="space-y-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setApplied({ status, search });
        }}
        className="flex flex-wrap gap-3"
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Order number or customer email"
          aria-label="Search orders"
          className={`${selectClass} min-w-[16rem] flex-1`}
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filter by status"
          className={selectClass}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.toLowerCase()}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-brand-gradient px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Apply
        </button>
      </form>

      {actionError && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {actionError}
        </p>
      )}

      {isLoading && <p className="text-sm text-slate-600 dark:text-slate-400">Loading orders…</p>}

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          Couldn&apos;t load orders: {error.message}
        </p>
      )}

      {data && data.data.length === 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-400">No orders match those filters.</p>
      )}

      {data && data.data.length > 0 && (
        <ul className="space-y-3">
          {data.data.map((order) => (
            <li key={order.id} className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-sm font-medium">{order.orderNumber}</p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    {order.user.email} · {new Date(order.createdAt).toLocaleDateString()} ·{" "}
                    {order.items.length} {order.items.length === 1 ? "item" : "items"}
                  </p>
                  {order.trackingNumber && (
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                      {order.carrier} · {order.trackingNumber}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <OrderStatusBadge status={order.status} />
                  <span className="font-semibold">
                    {formatPrice(order.totalCents, order.currency)}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500">Move to:</span>
                {STATUSES.filter((s) => s !== order.status).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleTransition(order.orderNumber, s)}
                    disabled={updateStatus.isPending}
                    className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium transition hover:border-brand-400 disabled:opacity-60 dark:border-slate-700"
                  >
                    {s.toLowerCase()}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Illegal transitions are refused by the server, so only valid moves take effect.
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
