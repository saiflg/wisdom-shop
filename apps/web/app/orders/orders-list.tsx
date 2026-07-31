"use client";

import Link from "next/link";
import { formatPrice } from "@/lib/catalog";
import { useOrders } from "@/lib/use-checkout";
import { useAuthStore } from "@/store/auth-store";
import { OrderStatusBadge } from "@/components/order-status-badge";

export function OrdersList() {
  const status = useAuthStore((s) => s.status);
  const { data: orders, isLoading, error } = useOrders();

  if (status === "idle" || status === "loading") {
    return <p className="mt-8 text-sm text-slate-600 dark:text-slate-400">Loading…</p>;
  }

  if (status !== "authenticated") {
    return (
      <div className="mt-8 rounded-2xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-700">
        <p className="font-medium">Sign in to see your orders</p>
        <Link
          href="/login"
          className="mt-4 inline-block rounded-full bg-brand-gradient px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return <p className="mt-8 text-sm text-slate-600 dark:text-slate-400">Loading your orders…</p>;
  }

  if (error) {
    return (
      <p role="alert" className="mt-8 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
        Couldn&apos;t load your orders: {error.message}
      </p>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <div className="mt-8 rounded-2xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-700">
        <p className="font-medium">You haven&apos;t placed any orders yet</p>
        <Link
          href="/products"
          className="mt-4 inline-block rounded-full bg-brand-gradient px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Browse the shop
        </Link>
      </div>
    );
  }

  return (
    <ul className="mt-8 space-y-3">
      {orders.map((order) => (
        <li key={order.id}>
          <Link
            href={`/orders/${order.orderNumber}`}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 p-5 transition hover:border-brand-400 dark:border-slate-800"
          >
            <div>
              <p className="font-mono text-sm font-medium">{order.orderNumber}</p>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {new Date(order.createdAt).toLocaleDateString()} ·{" "}
                {order.items.length} {order.items.length === 1 ? "item" : "items"}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <OrderStatusBadge status={order.status} />
              <span className="font-semibold">{formatPrice(order.totalCents, order.currency)}</span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
