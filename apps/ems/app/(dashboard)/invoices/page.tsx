"use client";

import { useState } from "react";
import clsx from "clsx";
import { ApiError } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/i18n-provider";
import type { TranslationKey } from "@/lib/i18n";
import {
  FEE_PAYMENT_METHODS,
  formatMoney,
  parseMoneyToCents,
  useInvoices,
  useRecordPayment,
  type FeeInvoice,
  type FeeInvoiceStatus,
  type FeePaymentMethod,
} from "@/lib/use-fees";

const STATUS_STYLE: Record<FeeInvoiceStatus, string> = {
  DRAFT: "bg-slate-400 text-white",
  ISSUED: "bg-amber-500 text-white",
  PARTIALLY_PAID: "bg-sky-600 text-white",
  PAID: "bg-emerald-600 text-white",
  VOID: "bg-slate-500 text-white line-through",
};

const statusKey = (status: FeeInvoiceStatus) => `fees.status.${status}` as TranslationKey;
const methodKey = (method: FeePaymentMethod) => `fees.method.${method}` as TranslationKey;

export default function InvoicesPage() {
  const { t } = useTranslation();
  const { data, isLoading } = useInvoices();
  const [openId, setOpenId] = useState<string | null>(null);

  const currency = data?.invoices[0]?.currency ?? data?.summary.currency ?? "NGN";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("fees.invoices.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">{t("fees.invoices.intro")}</p>
      </div>

      {data && data.invoices.length > 0 && (
        <section className="grid gap-4 sm:grid-cols-3">
          {/* Collected and outstanding are shown separately, never merged
              into one "revenue" figure — invoiced is not received. */}
          <Stat label={t("fees.invoices.invoiced")} value={formatMoney(data.summary.invoiced, currency)} />
          <Stat label={t("fees.invoices.collected")} value={formatMoney(data.summary.collected, currency)} tone="ok" />
          <Stat
            label={t("fees.invoices.outstanding")}
            value={formatMoney(data.summary.outstanding, currency)}
            tone={data.summary.outstanding > 0 ? "warn" : "ok"}
          />
        </section>
      )}

      {isLoading && <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>}
      {data?.invoices.length === 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-400">{t("fees.invoices.none")}</p>
      )}

      <div className="space-y-3">
        {data?.invoices.map((invoice) => (
          <InvoiceCard
            key={invoice.id}
            invoice={invoice}
            open={openId === invoice.id}
            onToggle={() => setOpenId((current) => (current === invoice.id ? null : invoice.id))}
          />
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
      <p className="text-sm text-slate-500">{label}</p>
      <p
        className={clsx(
          "mt-1 text-xl font-bold tabular-nums",
          tone === "ok" && "text-emerald-600",
          tone === "warn" && "text-amber-600",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function InvoiceCard({ invoice, open, onToggle }: { invoice: FeeInvoice; open: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const student = invoice.studentProfile?.user;

  return (
    <section className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
      <button type="button" onClick={onToggle} className="flex w-full flex-wrap items-center justify-between gap-3 text-left">
        <div>
          <p className="font-semibold">
            {invoice.invoiceNumber}
            {student && <span className="ml-2 font-normal text-slate-500">{`${student.firstName} ${student.lastName}`}</span>}
          </p>
          <p className="text-sm text-slate-500">
            {invoice.academicYear} · {invoice.term}
            {invoice.dueDate && ` · ${t("fees.invoices.due")} ${new Date(invoice.dueDate).toLocaleDateString()}`}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm text-slate-500">{t("fees.invoices.balance")}</p>
            <p className="font-semibold tabular-nums">{formatMoney(invoice.balanceCents, invoice.currency)}</p>
          </div>
          <span className={clsx("rounded-full px-2.5 py-1 text-xs font-semibold", STATUS_STYLE[invoice.status])}>
            {t(statusKey(invoice.status))}
          </span>
        </div>
      </button>

      {open && <InvoiceDetail invoice={invoice} />}
    </section>
  );
}

function InvoiceDetail({ invoice }: { invoice: FeeInvoice }) {
  const { t } = useTranslation();
  const recordPayment = useRecordPayment(invoice.id);

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<FeePaymentMethod>("CASH");
  const [reference, setReference] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const amountCents = parseMoneyToCents(amount);
  const settled = invoice.balanceCents <= 0 || invoice.status === "VOID";

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    if (amountCents === null) {
      setMessage({ tone: "error", text: t("fees.structures.badAmount") });
      return;
    }
    try {
      await recordPayment.mutateAsync({
        amountCents,
        method,
        ...(reference.trim() ? { reference: reference.trim() } : {}),
      });
      setMessage({ tone: "ok", text: t("fees.invoices.paymentSaved") });
      setAmount("");
      setReference("");
    } catch (err) {
      // Surfaces the API's own wording for overpayment and duplicate
      // references, which say precisely what went wrong.
      setMessage({ tone: "error", text: err instanceof ApiError ? err.message : t("fees.invoices.paymentFailed") });
    }
  };

  return (
    <div className="mt-4 space-y-4 border-t border-slate-200 pt-4 dark:border-slate-800">
      <div>
        <p className="text-sm font-medium">{t("fees.invoices.lines")}</p>
        <ul className="mt-1 space-y-1 text-sm">
          {invoice.lines.map((line, index) => (
            <li key={line.id ?? index} className="flex justify-between">
              <span>{line.label}</span>
              <span className="tabular-nums">{formatMoney(line.amountCents, invoice.currency)}</span>
            </li>
          ))}
          <li className="flex justify-between border-t border-slate-200 pt-1 font-semibold dark:border-slate-800">
            <span>{t("fees.invoices.total")}</span>
            <span className="tabular-nums">{formatMoney(invoice.totalCents, invoice.currency)}</span>
          </li>
        </ul>
      </div>

      <div>
        <p className="text-sm font-medium">{t("fees.invoices.payments")}</p>
        {invoice.payments.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">{t("fees.invoices.noPayments")}</p>
        ) : (
          <ul className="mt-1 space-y-1 text-sm">
            {invoice.payments.map((payment) => (
              <li key={payment.id} className="flex flex-wrap justify-between gap-2">
                <span className="text-slate-600 dark:text-slate-400">
                  {new Date(payment.receivedAt).toLocaleDateString()} · {t(methodKey(payment.method))}
                  {payment.reference && ` · ${payment.reference}`}
                  <span className="ml-1 text-xs text-slate-500">
                    {t("fees.invoices.recordedBy")} {payment.recordedByName}
                  </span>
                </span>
                <span className="tabular-nums">{formatMoney(payment.amountCents, invoice.currency)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!settled && (
        <form onSubmit={onSubmit} className="grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-[1fr,1fr,1fr,auto] dark:bg-slate-900">
          <div>
            <label className="block text-xs font-medium text-slate-500">{t("fees.invoices.amount")}</label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="25000.00"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500">{t("fees.invoices.method")}</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as FeePaymentMethod)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
            >
              {FEE_PAYMENT_METHODS.map((option) => (
                <option key={option} value={option}>
                  {t(methodKey(option))}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500">{t("fees.invoices.reference")}</label>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <button
            type="submit"
            disabled={recordPayment.isPending || !amount.trim()}
            className="self-end rounded-full bg-brand-gradient px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {t("fees.invoices.savePayment")}
          </button>
          <p className="text-xs text-slate-500 sm:col-span-4">{t("fees.invoices.referenceHint")}</p>
        </form>
      )}

      {message && (
        <p className={message.tone === "ok" ? "text-sm text-emerald-600" : "text-sm text-red-600"}>{message.text}</p>
      )}
    </div>
  );
}
