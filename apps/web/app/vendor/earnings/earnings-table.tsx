"use client";

import { formatPrice } from "@/lib/catalog";
import { useVendorEarnings } from "@/lib/use-vendor";

/** Mirrors the server's payable set — see VendorsService.earnings. */
const SETTLED = new Set(["PAID", "PROCESSING", "SHIPPED", "DELIVERED"]);

export function EarningsTable() {
  const { data, isLoading, error } = useVendorEarnings(true);

  if (isLoading) return <p className="text-sm text-slate-600 dark:text-slate-400">Loading earnings…</p>;

  if (error) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
        Couldn&apos;t load earnings: {error.message}
      </p>
    );
  }

  if (!data) return null;

  if (data.lines.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
        <p className="font-medium">No sales yet</p>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Once a customer buys one of your products, the line appears here with its commission.
        </p>
      </div>
    );
  }

  const { totals } = data;

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-600 dark:text-slate-400">Gross</p>
          <p className="mt-2 text-2xl font-bold">{formatPrice(totals.grossCents, totals.currency)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-600 dark:text-slate-400">Commission</p>
          <p className="mt-2 text-2xl font-bold">{formatPrice(totals.commissionCents, totals.currency)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-600 dark:text-slate-400">Net to you</p>
          <p className="mt-2 text-2xl font-bold">{formatPrice(totals.netCents, totals.currency)}</p>
        </div>
      </section>

      <p className="text-sm text-slate-600 dark:text-slate-400">
        Totals count settled orders only — {totals.payableLineCount} line
        {totals.payableLineCount === 1 ? "" : "s"}.
        {totals.excludedLineCount > 0 && (
          <>
            {" "}
            {totals.excludedLineCount} other line{totals.excludedLineCount === 1 ? " is" : "s are"}{" "}
            listed below but excluded: an order that is still pending has not been paid for, and
            cancelled or refunded money went back to the customer.
          </>
        )}
      </p>

      {/* Scrolls inside its own container so a wide table never makes the
          page scroll sideways on a phone. */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
        <table className="w-full min-w-[46rem] text-sm">
          <thead className="bg-slate-50 text-left dark:bg-slate-900">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Order</th>
              <th scope="col" className="px-4 py-3 font-medium">Product</th>
              <th scope="col" className="px-4 py-3 font-medium">Qty</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Gross</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Commission</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Net</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((line, index) => {
              const settled = SETTLED.has(line.orderStatus);
              return (
                <tr
                  key={`${line.orderNumber}-${index}`}
                  className={`border-t border-slate-200 dark:border-slate-800 ${
                    settled ? "" : "text-slate-500 dark:text-slate-500"
                  }`}
                >
                  <td className="px-4 py-3">
                    <span className="font-medium">{line.orderNumber}</span>
                    <span className="ml-2 text-xs uppercase">{line.orderStatus.toLowerCase()}</span>
                    {!settled && (
                      <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] dark:bg-slate-800">
                        not counted
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">{line.title}</td>
                  <td className="px-4 py-3">{line.quantity}</td>
                  <td className="px-4 py-3 text-right">{formatPrice(line.grossCents, line.currency)}</td>
                  <td className="px-4 py-3 text-right">
                    {formatPrice(line.commissionCents, line.currency)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {formatPrice(line.netCents, line.currency)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
