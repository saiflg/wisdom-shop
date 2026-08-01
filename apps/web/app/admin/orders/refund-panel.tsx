"use client";

import { useMemo, useState } from "react";
import { ApiError } from "@/lib/api";
import { formatPrice } from "@/lib/catalog";
import { useIssueRefund, useOrderRefunds, type RefundRecord } from "@/lib/use-admin";

/**
 * Refund controls for one order.
 *
 * Two deliberate choices, both because this sends real money:
 *
 *  - the idempotency key is generated once per *form session* rather than per
 *    click, so a double-click or an impatient retry is one refund. It is
 *    regenerated only after a refund succeeds, which is what makes a genuine
 *    second refund possible;
 *  - the confirm step spells out the amount. An amount typed in minor units
 *    is easy to get wrong by a factor of a hundred, so the confirmation
 *    shows it formatted.
 */
export function RefundPanel({ orderNumber }: { orderNumber: string }) {
  const { data, isLoading, error } = useOrderRefunds(orderNumber);
  const issueRefund = useIssueRefund();

  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [keySeed, setKeySeed] = useState(0);

  // Stable for as long as the form is open; changes only after a success.
  const idempotencyKey = useMemo(
    () => `${orderNumber}:${keySeed}:${typeof crypto !== "undefined" ? crypto.randomUUID() : Date.now()}`,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orderNumber, keySeed],
  );

  if (isLoading) {
    return <div className="h-24 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />;
  }
  if (error || !data) {
    return <p className="text-sm text-red-600 dark:text-red-400">Couldn&apos;t load refund details.</p>;
  }

  const requestedCents = amount.trim() === "" ? data.refundableCents : Math.round(Number(amount) * 100);
  const amountLooksValid =
    amount.trim() === "" ||
    (/^\d+(\.\d{1,2})?$/.test(amount.trim()) && requestedCents > 0 && requestedCents <= data.refundableCents);

  async function handleConfirm() {
    setFormError(null);
    try {
      await issueRefund.mutateAsync({
        orderNumber,
        amountCents: amount.trim() === "" ? undefined : requestedCents,
        reason: reason.trim() || undefined,
        idempotencyKey,
      });
      setAmount("");
      setReason("");
      setConfirming(false);
      // A new key, so the next refund is a new refund rather than a replay.
      setKeySeed((n) => n + 1);
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "The refund could not be issued. Please try again.",
      );
      setConfirming(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <h3 className="text-sm font-semibold">Refunds</h3>

      <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="text-slate-500 dark:text-slate-400">Paid</dt>
          <dd className="font-medium">{formatPrice(data.paidCents, data.currency)}</dd>
        </div>
        <div>
          <dt className="text-slate-500 dark:text-slate-400">Refunded</dt>
          <dd className="font-medium">{formatPrice(data.refundedCents, data.currency)}</dd>
        </div>
        <div>
          <dt className="text-slate-500 dark:text-slate-400">Refundable</dt>
          <dd className="font-medium">{formatPrice(data.refundableCents, data.currency)}</dd>
        </div>
      </dl>

      {data.refundable && data.refundableCents > 0 ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-slate-600 dark:text-slate-400">
                Amount ({data.currency})
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setConfirming(false);
                }}
                placeholder={(data.refundableCents / 100).toFixed(2)}
                aria-label="Refund amount"
                className="w-40 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
            <label className="flex-1 text-sm">
              <span className="mb-1 block text-slate-600 dark:text-slate-400">Reason (optional)</span>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                aria-label="Refund reason"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Leave the amount blank to refund the full remaining balance.
          </p>

          {!amountLooksValid && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              Enter an amount between 0 and {formatPrice(data.refundableCents, data.currency)}.
            </p>
          )}

          {confirming ? (
            <div className="rounded-lg bg-amber-50 p-3 dark:bg-amber-950/40">
              <p className="text-sm font-medium">
                Refund {formatPrice(requestedCents, data.currency)} to the customer? This sends money
                back through {data.refunds[0]?.provider ?? "the original payment provider"} and cannot be
                undone here.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={issueRefund.isPending}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
                >
                  {issueRefund.isPending ? "Refunding…" : "Yes, refund"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={!amountLooksValid}
              className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
            >
              Issue refund
            </button>
          )}

          {formError && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {formError}
            </p>
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          {data.refundedCents > 0
            ? "This order has been fully refunded."
            : "This order can't be refunded — no completed payment remains against it."}
        </p>
      )}

      {data.refunds.length > 0 && (
        <ul className="mt-4 space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
          {data.refunds.map((refund) => (
            <RefundRow key={refund.id} refund={refund} />
          ))}
        </ul>
      )}
    </section>
  );
}

function RefundRow({ refund }: { refund: RefundRecord }) {
  const tone =
    refund.status === "SUCCEEDED"
      ? "text-green-700 dark:text-green-300"
      : refund.status === "FAILED"
        ? "text-red-700 dark:text-red-300"
        : "text-amber-700 dark:text-amber-300";

  return (
    <li className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
      <span>
        {formatPrice(refund.amountCents, refund.currency)}{" "}
        <span className={`font-medium ${tone}`}>{refund.status.toLowerCase()}</span>
        {refund.reason && <span className="text-slate-500 dark:text-slate-400"> — {refund.reason}</span>}
      </span>
      <span className="text-xs text-slate-500 dark:text-slate-400">
        {/* A failed attempt is kept and shown: "we tried and it was declined"
            is what support needs to be able to say. */}
        {refund.failureReason ?? new Date(refund.createdAt).toLocaleDateString()}
      </span>
    </li>
  );
}
