"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { formatPrice } from "@/lib/catalog";
import { useAuthStore } from "@/store/auth-store";

interface Summary {
  revenue: {
    currencies: string[];
    settledGrossCents: number;
    settledOrderCount: number;
    averageOrderValueCents: number;
    windowDays: number;
    windowGrossCents: number;
    windowOrderCount: number;
  };
  orders: { pending: number; refunded: number; byStatus: Record<string, number> };
  catalog: { publishedProducts: number };
  customers: { total: number };
  vendors: { awaitingApproval: number };
  licenses: { active: number };
}

interface TopProduct {
  id: string;
  title: string;
  slug: string;
  unitsSold: number;
}

export function AdminOverview() {
  const accessToken = useAuthStore((s) => s.accessToken);
  // Built as an explicit Record so the empty case is still Record<string,string>;
  // an inline ternary produces a union TS rejects as HeadersInit.
  const headers: Record<string, string> = accessToken
    ? { Authorization: `Bearer ${accessToken}` }
    : {};

  const { data: summary, isLoading, error } = useQuery({
    queryKey: ["admin-analytics-summary"],
    enabled: Boolean(accessToken),
    queryFn: () => apiFetch<Summary>("/v1/admin/analytics/summary", { headers }),
  });

  const { data: topProducts } = useQuery({
    queryKey: ["admin-analytics-top"],
    enabled: Boolean(accessToken),
    queryFn: () => apiFetch<TopProduct[]>("/v1/admin/analytics/top-products", { headers }),
  });

  if (isLoading) return <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>;

  if (error) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
        Couldn&apos;t load analytics: {error.message}
      </p>
    );
  }

  if (!summary) return null;

  // Totals are only meaningful in one currency. With none settled yet there is
  // nothing to mislabel; with several, say so rather than stamp one symbol on
  // a sum of different monies.
  const { currencies } = summary.revenue;
  const currency = currencies[0] ?? "USD";
  const mixedCurrency = currencies.length > 1;
  const money = (cents: number) =>
    mixedCurrency ? `${(cents / 100).toLocaleString()} (mixed)` : formatPrice(cents, currency);

  const cards = [
    {
      label: "Settled revenue",
      value: money(summary.revenue.settledGrossCents),
      hint: `${summary.revenue.settledOrderCount} orders`,
    },
    {
      label: `Last ${summary.revenue.windowDays} days`,
      value: money(summary.revenue.windowGrossCents),
      hint: `${summary.revenue.windowOrderCount} orders`,
    },
    {
      label: "Average order",
      value: money(summary.revenue.averageOrderValueCents),
      hint: "settled orders only",
    },
    { label: "Awaiting payment", value: String(summary.orders.pending), hint: "pending orders" },
    { label: "Customers", value: String(summary.customers.total), hint: "registered" },
    { label: "Published products", value: String(summary.catalog.publishedProducts), hint: "live" },
    {
      label: "Vendors to review",
      value: String(summary.vendors.awaitingApproval),
      hint: "pending applications",
    },
    { label: "Active licenses", value: String(summary.licenses.active), hint: "issued" },
  ];

  return (
    <div className="space-y-8">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Revenue counts settled orders only — pending orders aren&apos;t paid for, and
        cancelled or refunded money went back to the customer.
      </p>

      {mixedCurrency && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
          Settled orders span {currencies.join(", ")}. The totals below add those
          amounts together, so treat them as a unit count rather than a value.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-600 dark:text-slate-400">
              {card.label}
            </p>
            <p className="mt-2 text-2xl font-bold">{card.value}</p>
            <p className="mt-1 text-xs text-slate-500">{card.hint}</p>
          </div>
        ))}
      </div>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
          Orders by status
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(summary.orders.byStatus).map(([status, count]) => (
            <span
              key={status}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium dark:border-slate-800"
            >
              {status.toLowerCase()}: {count}
            </span>
          ))}
        </div>
      </section>

      {topProducts && topProducts.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
            Best sellers
          </h2>
          <ul className="mt-3 space-y-2">
            {topProducts.map((product) => (
              <li
                key={product.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-2.5 text-sm dark:border-slate-800"
              >
                <Link href={`/products/${product.slug}`} className="hover:underline">
                  {product.title}
                </Link>
                <span className="font-medium">{product.unitsSold} sold</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
