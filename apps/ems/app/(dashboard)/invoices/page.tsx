"use client";

import { useState } from "react";
import clsx from "clsx";
import { ApiError, errorMessage } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/i18n-provider";
import { PdfButton } from "@/components/pdf-button";
import type { TranslationKey } from "@/lib/i18n";
import { InvoiceDiscounts } from "@/components/invoice-discounts";
import {
  FEE_PAYMENT_METHODS,
  formatMoney,
  parseMoneyToCents,
  useInvoices,
  useRecordPayment,
  useStartCheckout,
  usePaymentOptions,
  type FeeProvider,
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

      {open && (
        <>
          <div className="mt-3">
            <PdfButton
              label={t("pdf.invoice")}
              path={`/v1/pdf/invoices/${invoice.id}`}
              filename={`invoice-${invoice.invoiceNumber}.pdf`}
            />
          </div>
          <InvoiceDetail invoice={invoice} />
        </>
      )}
    </section>
  );
}

/**
 * Paying online.
 *
 * Offered to everyone who can see the invoice — a parent paying their own
 * child's fees is the point, and a bursar taking a card payment at the desk
 * is the same button.
 *
 * The gateway is the payer's choice when there is one to make. A school may
 * run several, and which one a family uses is not an implementation detail
 * to them: one may add a card fee, another may be the one they already have
 * an account with. Before this, whichever row the database returned first
 * won, silently.
 *
 * One gateway means no chooser at all. A choice between one thing is not a
 * choice, and making somebody click it is a step for nothing.
 *
 * When the school has not configured a gateway the API says so in words a
 * parent can act on, and that sentence is shown as-is: "online payment is not
 * set up, pay the office" is useful, "payment failed" is not.
 */
function PayOnline({ invoice }: { invoice: FeeInvoice }) {
  const startCheckout = useStartCheckout(invoice.id);
  const { data, isLoading } = usePaymentOptions(invoice.id);
  const [chosen, setChosen] = useState<FeeProvider | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const options = data?.options ?? [];
  const soleOption = options.length === 1 ? options[0] : null;
  const onlyOne = soleOption !== null;
  // With one gateway there is nothing to pick, so it is picked already.
  const provider = chosen ?? soleOption?.provider ?? null;

  const pay = async () => {
    setProblem(null);
    try {
      const { url } = await startCheckout.mutateAsync(provider ?? undefined);
      // A full navigation, not a new tab: the family is leaving to pay and
      // comes back through the callback URL. A popup here is what gets
      // blocked on the phone most of them will use.
      window.location.href = url;
    } catch (err) {
      setProblem(errorMessage(err, "Couldn't start that payment."));
    }
  };

  if (isLoading) {
    return <p className="px-4 py-3 text-sm text-slate-500">Checking how this can be paid…</p>;
  }

  // Said plainly and without a dead button. A school that takes only cash is
  // not broken, and a parent needs to know to go to the office.
  if (options.length === 0) {
    return (
      <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-400">
        This school does not take online payments yet. Please pay the school office directly.
      </p>
    );
  }

  return (
    <div className="space-y-3 rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-900">
      {!onlyOne && (
        <fieldset>
          <legend className="text-sm font-semibold">How would you like to pay?</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {options.map((option) => (
              <label
                key={option.provider}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${
                  provider === option.provider
                    ? "border-brand-600 bg-white ring-1 ring-brand-600 dark:bg-slate-950"
                    : "border-slate-300 hover:border-slate-400 dark:border-slate-700"
                }`}
              >
                <input
                  type="radio"
                  name={`gateway-${invoice.id}`}
                  value={option.provider}
                  checked={provider === option.provider}
                  onChange={() => setChosen(option.provider)}
                  className="h-4 w-4 accent-brand-600"
                />
                <span className="font-medium">{option.label}</span>
                {/* A sandbox gateway takes a real-looking payment that is not
                    real. Nobody should discover that afterwards. */}
                {option.sandbox && (
                  <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                    test mode
                  </span>
                )}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void pay()}
          disabled={startCheckout.isPending || !provider}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
        >
          {startCheckout.isPending
            ? "Opening the payment page…"
            : `Pay ${formatMoney(invoice.balanceCents, invoice.currency)} online`}
        </button>
        <span className="text-xs text-slate-500">
          {provider
            ? `You will be taken to ${options.find((o) => o.provider === provider)?.label ?? "the payment provider"}.`
            : "Choose a payment method to continue."}
        </span>
      </div>

      {problem && (
        <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">
          {problem}
        </p>
      )}
    </div>
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
      {!settled && <PayOnline invoice={invoice} />}

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

      {/* Beneath the lines and above the payments, which is the order the
          question is asked in: what were we charged, what came off, what did
          we pay. Renders its own breakdown, including when nothing has been
          taken off — a bill with no discount should look the same as one
          whose discount was removed. */}
      <InvoiceDiscounts invoiceId={invoice.id} />

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
