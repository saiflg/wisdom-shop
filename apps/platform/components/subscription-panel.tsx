"use client";

import { useState } from "react";
import clsx from "clsx";
import Link from "next/link";
import { ApiError } from "@/lib/api";
import {
  formatMoney,
  useGenerateInvoice,
  useInvoices,
  usePlans,
  useSubscribeSchool,
  useSubscription,
  useSubscriptionAction,
  type SubscriptionStatus,
} from "@/lib/use-billing";

const SUBSCRIPTION_STYLES: Record<SubscriptionStatus, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  TRIALING: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  PAST_DUE: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400",
  CANCELED: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500",
};

export function SubscriptionPanel({ schoolId }: { schoolId: string }) {
  const { data: subscription, isLoading } = useSubscription(schoolId);
  const { data: plans } = usePlans();
  const { data: invoices } = useInvoices(schoolId);
  const subscribe = useSubscribeSchool(schoolId);
  const generateInvoice = useGenerateInvoice(schoolId);
  const markPastDue = useSubscriptionAction(schoolId, "past-due");
  const reactivate = useSubscriptionAction(schoolId, "activate");
  const cancel = useSubscriptionAction(schoolId, "cancel");

  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const report = (err: unknown, fallback: string) =>
    setMessage({ tone: "error", text: err instanceof ApiError ? err.message : fallback });

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-slate-200 p-5 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
        Loading subscription…
      </section>
    );
  }

  const activePlans = plans?.filter((plan) => plan.isActive) ?? [];

  return (
    <section className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Subscription</h2>
        {subscription && (
          <span
            className={clsx(
              "rounded-full px-2.5 py-0.5 text-xs font-medium",
              SUBSCRIPTION_STYLES[subscription.status],
            )}
          >
            {subscription.status.replace("_", " ")}
          </span>
        )}
      </div>

      {!subscription || subscription.status === "CANCELED" ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {subscription?.status === "CANCELED"
              ? "This subscription was cancelled. Subscribing again creates a new one so the cancellation stays on the record."
              : "This school has no subscription."}
          </p>
          {activePlans.length === 0 ? (
            <p className="text-sm text-slate-500">
              No active plans yet — <Link href="/plans" className="underline">create one first</Link>.
            </p>
          ) : (
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={async (event) => {
                event.preventDefault();
                setMessage(null);
                const form = new FormData(event.currentTarget);
                try {
                  await subscribe.mutateAsync({
                    planId: String(form.get("planId") ?? ""),
                    ...(form.get("trialDays") ? { trialDays: Number(form.get("trialDays")) } : {}),
                  });
                  setMessage({ tone: "ok", text: "Subscribed." });
                } catch (err) {
                  report(err, "Couldn't subscribe this school.");
                }
              }}
            >
              <div>
                <label htmlFor="planId" className="block text-sm font-medium">
                  Plan
                </label>
                <select
                  id="planId"
                  name="planId"
                  className="mt-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none dark:border-slate-700 dark:bg-slate-900"
                >
                  {activePlans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} — {formatMoney(plan.priceCents, plan.currency)}/{plan.interval.toLowerCase()}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="trialDays" className="block text-sm font-medium">
                  Trial days
                </label>
                <input
                  id="trialDays"
                  name="trialDays"
                  type="number"
                  min={1}
                  placeholder="none"
                  className="mt-1.5 w-28 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
              <button
                type="submit"
                disabled={subscribe.isPending}
                className="rounded-lg bg-platform-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-platform-800 disabled:opacity-60"
              >
                Subscribe
              </button>
            </form>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-sm">
            <span className="font-medium">{subscription.plan.name}</span>
            <span className="text-slate-500">
              {" "}
              · {formatMoney(subscription.priceCents, subscription.currency)} /{" "}
              {subscription.interval.toLowerCase()}
            </span>
          </p>
          <p className="text-sm text-slate-500">
            Current period {new Date(subscription.currentPeriodStart).toLocaleDateString()} –{" "}
            {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
            {subscription.trialEndsAt && ` · trial ends ${new Date(subscription.trialEndsAt).toLocaleDateString()}`}
          </p>

          <div className="flex flex-wrap gap-2">
            <PanelButton
              label="Generate invoice"
              pending={generateInvoice.isPending}
              onClick={async () => {
                setMessage(null);
                try {
                  const invoice = await generateInvoice.mutateAsync();
                  setMessage({ tone: "ok", text: `Draft ${invoice.number} created.` });
                } catch (err) {
                  report(err, "Couldn't generate an invoice.");
                }
              }}
            />
            {subscription.status === "ACTIVE" && (
              <PanelButton
                label="Mark past due"
                pending={markPastDue.isPending}
                onClick={() => markPastDue.mutateAsync().catch((err) => report(err, "Couldn't update."))}
              />
            )}
            {subscription.status === "PAST_DUE" && (
              <PanelButton
                label="Mark active"
                pending={reactivate.isPending}
                onClick={() => reactivate.mutateAsync().catch((err) => report(err, "Couldn't update."))}
              />
            )}
            <PanelButton
              label="Cancel subscription"
              pending={cancel.isPending}
              onClick={() => cancel.mutateAsync().catch((err) => report(err, "Couldn't cancel."))}
            />
          </div>

          <p className="text-xs text-slate-500">
            Marking a subscription past due does not suspend the school — that stays a separate, recorded decision.
          </p>
        </div>
      )}

      {message && (
        <p
          role={message.tone === "error" ? "alert" : undefined}
          className={clsx(
            "mt-3 text-sm",
            message.tone === "error"
              ? "rounded-lg bg-red-50 px-3 py-2 text-red-700 dark:bg-red-950/40 dark:text-red-400"
              : "text-emerald-600 dark:text-emerald-400",
          )}
        >
          {message.text}
        </p>
      )}

      {invoices && invoices.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
          <p className="text-sm font-medium">Invoices</p>
          <ul className="mt-2 space-y-1 text-sm">
            {invoices.slice(0, 5).map((invoice) => (
              <li key={invoice.number} className="flex justify-between gap-4">
                <span className="font-mono text-xs text-slate-500">{invoice.number}</span>
                <span className="text-slate-600 dark:text-slate-400">{invoice.status}</span>
                <span className="font-mono">{formatMoney(invoice.totalCents, invoice.currency)}</span>
              </li>
            ))}
          </ul>
          <Link href="/billing" className="mt-2 inline-block text-sm text-platform-600 hover:underline">
            All invoices →
          </Link>
        </div>
      )}
    </section>
  );
}

function PanelButton({ label, pending, onClick }: { label: string; pending: boolean; onClick: () => void }) {
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
