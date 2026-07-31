"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, ApiError } from "@/lib/api";
import { formatPrice } from "@/lib/catalog";
import { useAuthStore } from "@/store/auth-store";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { PayOrderButton } from "@/components/pay-order-button";
import type { Order } from "@/lib/order-types";

export function OrderDetail({ orderNumber }: { orderNumber: string }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const status = useAuthStore((s) => s.status);

  const { data: order, isLoading, error } = useQuery({
    queryKey: ["orders", orderNumber],
    enabled: status === "authenticated" && Boolean(accessToken),
    queryFn: () =>
      apiFetch<Order>(`/v1/orders/${encodeURIComponent(orderNumber)}`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      }),
  });

  if (status === "idle" || status === "loading") {
    return <p className="pt-8 text-sm text-slate-600 dark:text-slate-400">Loading…</p>;
  }

  if (status !== "authenticated") {
    return (
      <div className="pt-8">
        <p className="font-medium">Sign in to view this order</p>
        <Link href="/login" className="mt-2 inline-block text-sm text-brand-600 hover:underline dark:text-brand-400">
          Sign in
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return <p className="pt-8 text-sm text-slate-600 dark:text-slate-400">Loading order…</p>;
  }

  if (error) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <div className="pt-8">
        <p className="font-medium">{notFound ? "Order not found" : `Couldn't load order: ${error.message}`}</p>
        <Link href="/orders" className="mt-2 inline-block text-sm text-brand-600 hover:underline dark:text-brand-400">
          Back to your orders
        </Link>
      </div>
    );
  }

  if (!order) return null;

  return (
    <div>
      <nav className="mb-6 text-sm text-slate-600 dark:text-slate-400">
        <Link href="/orders" className="hover:underline">
          Your orders
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-900 dark:text-slate-100">{order.orderNumber}</span>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl font-bold tracking-tight">{order.orderNumber}</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Placed {new Date(order.createdAt).toLocaleString()}
          </p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      {order.status === "PENDING" && (
        <div className="mt-6 rounded-lg bg-amber-50 px-4 py-3 dark:bg-amber-950/40">
          <p className="text-sm text-amber-900 dark:text-amber-200">
            This order is awaiting payment.
          </p>
          <PayOrderButton orderNumber={order.orderNumber} />
        </div>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
          Items
        </h2>
        <ul className="mt-3 divide-y divide-slate-200 dark:divide-slate-800">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between py-3 text-sm">
              <span>
                {item.titleSnapshot} <span className="text-slate-500">× {item.quantity}</span>
              </span>
              <span className="font-medium">
                {formatPrice(item.unitPriceCents * item.quantity, order.currency)}
              </span>
            </li>
          ))}
        </ul>

        <dl className="mt-4 space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-600 dark:text-slate-400">Subtotal</dt>
            <dd>{formatPrice(order.subtotalCents, order.currency)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-600 dark:text-slate-400">Shipping</dt>
            <dd>{formatPrice(order.shippingCents, order.currency)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-600 dark:text-slate-400">Tax</dt>
            <dd>{formatPrice(order.taxCents, order.currency)}</dd>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold dark:border-slate-800">
            <dt>Total</dt>
            <dd>{formatPrice(order.totalCents, order.currency)}</dd>
          </div>
        </dl>
      </section>

      {order.address && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
            Shipping to
          </h2>
          <address className="mt-3 text-sm not-italic leading-relaxed">
            {order.address.fullName}
            <br />
            {order.address.line1}
            {order.address.line2 ? `, ${order.address.line2}` : ""}
            <br />
            {order.address.city}
            {order.address.state ? `, ${order.address.state}` : ""} {order.address.postalCode ?? ""}{" "}
            {order.address.country}
            <br />
            <span className="text-slate-500">{order.address.phone}</span>
          </address>
        </section>
      )}
    </div>
  );
}
