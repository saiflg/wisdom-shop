"use client";

import { useState } from "react";
import { errorMessage } from "@/lib/api";
import {
  useGrantDiscount,
  useInvoiceDiscounts,
  useRevokeDiscount,
  type DiscountKind,
} from "@/lib/use-discounts";

function money(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * What has been taken off one bill, and how to take more off.
 *
 * Shown as a subtotal → discounts → payable breakdown rather than a single
 * reduced number, because the commonest question a bursar is asked is "why
 * is this less than my neighbour's", and the answer is the list.
 *
 * The API refuses a discount that would take the payable amount below what
 * has already been paid — that would be a refund, not a discount. This form
 * says so before the button is pressed rather than only afterwards.
 */
export function InvoiceDiscounts({ invoiceId }: { invoiceId: string }) {
  const { data, isLoading } = useInvoiceDiscounts(invoiceId);
  const grant = useGrantDiscount(invoiceId);
  const revoke = useRevokeDiscount(invoiceId);

  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<DiscountKind>("PERCENT");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  if (isLoading || !data) return null;

  const currency = data.currency;
  const room = data.payableCents - data.paidCents;

  // What this would come to, so the figure is on screen before it is granted.
  const parsed = Number(value);
  const worth =
    !value.trim() || Number.isNaN(parsed) || parsed <= 0
      ? null
      : kind === "PERCENT"
        ? Math.round((data.grossCents * parsed) / 100)
        : Math.round(parsed * 100);
  const tooMuch = worth !== null && worth > room;

  const submit = async () => {
    setProblem(null);
    try {
      await grant.mutateAsync({
        label: label.trim(),
        kind,
        // Percentages are whole points; fixed amounts are entered in major
        // units and stored in minor ones.
        value: kind === "PERCENT" ? Math.round(parsed) : Math.round(parsed * 100),
        reason: reason.trim() || undefined,
      });
      setOpen(false);
      setLabel("");
      setValue("");
      setReason("");
    } catch (err) {
      setProblem(errorMessage(err, "Couldn't apply that discount."));
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Discounts</p>
        {!open && room > 0 && (
          <button
            type="button"
            onClick={() => { setOpen(true); setProblem(null); }}
            className="text-xs font-semibold text-brand-600 hover:underline"
          >
            Take money off this bill
          </button>
        )}
      </div>

      {/* The breakdown, always — a single reduced number is what makes a
          parent ring the office. */}
      <dl className="mt-2 space-y-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-500">Fees</dt>
          <dd className="tabular-nums">{money(data.grossCents, currency)}</dd>
        </div>
        {data.discounts.map((discount) => (
          <div key={discount.id} className="flex items-start justify-between gap-3">
            <dt className="min-w-0 text-slate-500">
              {discount.label}
              <span className="text-slate-400"> · {discount.describedAs}</span>
              {discount.fromScholarship && (
                <span className="ms-1 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-800 dark:bg-violet-950/50 dark:text-violet-300">
                  {discount.fromScholarship}
                </span>
              )}
              {discount.reason && (
                <span className="block text-xs italic text-slate-400">“{discount.reason}”</span>
              )}
            </dt>
            <dd className="flex shrink-0 items-center gap-2">
              <span className="tabular-nums text-emerald-700 dark:text-emerald-400">
                −{money(discount.amountCents, currency)}
              </span>
              {/* A scholarship's discount is withdrawn by ending the award,
                  not by deleting one bill's copy of it. */}
              {!discount.fromScholarship && (
                <button
                  type="button"
                  onClick={() => void revoke.mutateAsync(discount.id)}
                  disabled={revoke.isPending}
                  title="Undo this discount"
                  className="text-xs text-slate-400 hover:text-red-600 disabled:opacity-50"
                >
                  ✕
                </button>
              )}
            </dd>
          </div>
        ))}
        <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold dark:border-slate-700">
          <dt>Payable</dt>
          <dd className="tabular-nums">{money(data.payableCents, currency)}</dd>
        </div>
      </dl>

      {open && (
        <div className="mt-3 space-y-2 border-t border-slate-200 pt-3 dark:border-slate-700">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs font-medium">
              What is it for?
              <input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Sibling discount"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </label>

            <div className="flex gap-2">
              <label className="text-xs font-medium">
                Kind
                <select
                  value={kind}
                  onChange={(event) => setKind(event.target.value as DiscountKind)}
                  className="mt-1 block rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="PERCENT">Percentage</option>
                  <option value="FIXED">An amount</option>
                </select>
              </label>
              <label className="flex-1 text-xs font-medium">
                {kind === "PERCENT" ? "Per cent" : `Amount (${currency})`}
                <input
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  inputMode="decimal"
                  placeholder={kind === "PERCENT" ? "10" : "5000"}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
              </label>
            </div>
          </div>

          <label className="block text-xs font-medium">
            Why (optional, shown on the invoice)
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Second child at the school"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </label>

          {/* The figure, before the button. A percentage of a large bill is
              not a number anybody works out in their head. */}
          {worth !== null && !tooMuch && (
            <p className="text-xs text-slate-500">
              That comes to <strong>{money(worth, currency)}</strong> — leaving{" "}
              {money(data.payableCents - worth, currency)} payable.
            </p>
          )}

          {tooMuch && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              That comes to {money(worth, currency)}, which is more than the family still owes. The most that
              can be taken off is <strong>{money(room, currency)}</strong> — anything more would be a refund,
              not a discount.
            </p>
          )}

          {problem && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{problem}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={grant.isPending || !label.trim() || worth === null || tooMuch}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
            >
              {grant.isPending ? "Applying…" : "Apply"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
