"use client";

import clsx from "clsx";
import { ApiError } from "@/lib/api";
import {
  formatMoney,
  useInvoiceAction,
  useInvoices,
  useRevenue,
  type Invoice,
  type InvoiceStatus,
} from "@/lib/use-billing";

const INVOICE_STYLES: Record<InvoiceStatus, string> = {
  PAID: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  OPEN: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  DRAFT: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  VOID: "bg-slate-100 text-slate-500 line-through dark:bg-slate-800 dark:text-slate-500",
  UNCOLLECTIBLE: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400",
};

export default function BillingPage() {
  const { data: revenue } = useRevenue();
  const { data: invoices, isLoading, error } = useInvoices();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Collected and outstanding are shown separately — money invoiced is not money received.
        </p>
      </div>

      {revenue && (
        <div className="grid gap-4 sm:grid-cols-3">
          <SummaryCard
            title="Collected"
            rows={revenue.collected.map((row) => formatMoney(row.amountCents, row.currency))}
            emphasis
          />
          <SummaryCard
            title="Outstanding"
            rows={revenue.outstanding.map((row) => formatMoney(row.amountCents, row.currency))}
          />
          <SummaryCard
            title="Subscriptions"
            rows={revenue.subscriptions.map((row) => `${row.count} ${row.status.toLowerCase().replace("_", " ")}`)}
          />
        </div>
      )}

      {isLoading && <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {error.message}
        </p>
      )}
      {invoices && invoices.length === 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-400">No invoices yet.</p>
      )}

      {invoices && invoices.length > 0 && (
        <ul className="space-y-2">
          {invoices.map((invoice) => (
            <InvoiceRow key={invoice.number} invoice={invoice} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SummaryCard({ title, rows, emphasis }: { title: string; rows: string[]; emphasis?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
      <p className="text-sm text-slate-600 dark:text-slate-400">{title}</p>
      {rows.length === 0 ? (
        <p className="mt-2 text-lg text-slate-400">—</p>
      ) : (
        rows.map((row) => (
          <p key={row} className={clsx("mt-1 font-bold tracking-tight", emphasis ? "text-2xl" : "text-lg")}>
            {row}
          </p>
        ))
      )}
    </div>
  );
}

function InvoiceRow({ invoice }: { invoice: Invoice }) {
  const issue = useInvoiceAction(invoice.number, "issue");
  const pay = useInvoiceAction(invoice.number, "pay");
  const voidIt = useInvoiceAction(invoice.number, "void");

  const report = (err: unknown) => alert(err instanceof ApiError ? err.message : "That didn't work.");

  return (
    <li className="rounded-xl border border-slate-200 px-5 py-4 dark:border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            <span className="font-mono">{invoice.number}</span>
            {invoice.school && <span className="ml-2 text-slate-500">{invoice.school.name}</span>}
          </p>
          <p className="text-sm text-slate-500">
            {formatMoney(invoice.totalCents, invoice.currency)} ·{" "}
            {new Date(invoice.periodStart).toLocaleDateString()} – {new Date(invoice.periodEnd).toLocaleDateString()}
            {invoice.dueAt && ` · due ${new Date(invoice.dueAt).toLocaleDateString()}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={clsx("rounded-full px-2.5 py-0.5 text-xs font-medium", INVOICE_STYLES[invoice.status])}>
            {invoice.status}
          </span>
          {/* Only transitions the API permits are offered; PAID and VOID are
              terminal, so a settled invoice shows no actions at all. */}
          {invoice.status === "DRAFT" && (
            <ActionButton label="Issue" pending={issue.isPending} onClick={() => issue.mutateAsync().catch(report)} />
          )}
          {invoice.status === "OPEN" && (
            <>
              <ActionButton label="Mark paid" pending={pay.isPending} onClick={() => pay.mutateAsync().catch(report)} />
              <ActionButton label="Void" pending={voidIt.isPending} onClick={() => voidIt.mutateAsync().catch(report)} />
            </>
          )}
        </div>
      </div>

      <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm dark:border-slate-800">
        {invoice.lines.map((line) => (
          <li key={line.id} className="flex justify-between gap-4">
            <span className="text-slate-600 dark:text-slate-400">
              {line.description} × {line.quantity}
            </span>
            <span className="font-mono">{formatMoney(line.amountCents, invoice.currency)}</span>
          </li>
        ))}
      </ul>
    </li>
  );
}

function ActionButton({ label, pending, onClick }: { label: string; pending: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={pending}
      onClick={onClick}
      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-900"
    >
      {label}
    </button>
  );
}
