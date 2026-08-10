"use client";

import { useEffect, useState } from "react";
import { errorMessage } from "@/lib/api";
import { useSalary, useSetSalary, type PayComponentBasis, type PayComponentKind } from "@/lib/use-payroll";

interface Draft {
  label: string;
  kind: PayComponentKind;
  basis: PayComponentBasis;
  /** Held as text so a half-typed number is not coerced to 0 under the cursor. */
  amount: string;
  isBasic: boolean;
}

function money(cents: number): string {
  return (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Amounts are shown and typed in major units and stored in minor ones.
 *
 * The conversion happens here and nowhere else — a salary that is 2500.5 on
 * screen must be the integer 250050 by the time it reaches the API, and a
 * float must never make it into the request body.
 */
function toMinorUnits(text: string): number {
  return Math.round(Number(text || "0") * 100);
}

/** A percentage is stored in hundredths, so 12.5 becomes 1250. */
function toHundredths(text: string): number {
  return Math.round(Number(text || "0") * 100);
}

export function SalaryEditor({ userId }: { userId: string }) {
  const { data, isLoading, error } = useSalary(userId);
  const save = useSetSalary(userId);

  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!data || drafts) return;
    setDrafts(
      data.components.map((component) => ({
        label: component.label,
        kind: component.kind,
        basis: component.basis,
        amount:
          component.basis === "FIXED"
            ? String(component.amount / 100)
            : String(component.amount / 100),
        isBasic: component.isBasic,
      })),
    );
  }, [data, drafts]);

  if (isLoading) return <p className="text-sm text-slate-500">Loading salary…</p>;

  // The API explains *why* — usually "no employment record yet" — and that
  // sentence is the whole value of the failure. Spinning forever instead
  // would send an administrator hunting for a bug that isn't one.
  if (error || !drafts) {
    return (
      <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        {errorMessage(error, "Couldn't load this salary.")}
      </p>
    );
  }

  // Functional updates throughout, never `setDrafts(drafts.map(...))`. Two
  // fields changed before a re-render would otherwise both close over the
  // same stale array, and the second would silently undo the first.
  const update = (index: number, patch: Partial<Draft>) =>
    setDrafts((current) => (current ?? []).map((draft, i) => (i === index ? { ...draft, ...patch } : draft)));

  const submit = async () => {
    setMessage(null);
    try {
      const result = await save.mutateAsync(
        drafts
          .filter((draft) => draft.label.trim().length > 0)
          .map((draft) => ({
            label: draft.label.trim(),
            kind: draft.kind,
            basis: draft.basis,
            amount: draft.basis === "FIXED" ? toMinorUnits(draft.amount) : toHundredths(draft.amount),
            isBasic: draft.isBasic,
          })),
      );
      setMessage({ tone: "ok", text: `Saved. Net pay is ${money(result.preview.netCents)} a month.` });
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err, "Couldn't save that salary.") });
    }
  };

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Salary</h2>
        {data && (
          <p className="text-xs text-slate-500">
            Gross {money(data.preview.grossCents)} · deductions {money(data.preview.deductionsCents)} · net{" "}
            <strong>{money(data.preview.netCents)}</strong>
          </p>
        )}
      </div>

      <ul className="space-y-2">
        {drafts.map((draft, index) => (
          <li key={index} className="grid items-center gap-2 sm:grid-cols-[1fr_9rem_8rem_auto_auto]">
            <input
              value={draft.label}
              onChange={(event) => update(index, { label: event.target.value })}
              placeholder="Basic"
              aria-label="Component name"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
            <select
              value={draft.kind}
              onChange={(event) => update(index, { kind: event.target.value as PayComponentKind })}
              aria-label="Earning or deduction"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="EARNING">Earning</option>
              <option value="DEDUCTION">Deduction</option>
            </select>
            <select
              value={draft.basis}
              onChange={(event) => update(index, { basis: event.target.value as PayComponentBasis })}
              aria-label="Fixed amount or percentage"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="FIXED">Amount</option>
              <option value="PERCENT_OF_BASIC">% of basic</option>
            </select>
            <input
              value={draft.amount}
              onChange={(event) => update(index, { amount: event.target.value })}
              inputMode="decimal"
              aria-label={draft.basis === "FIXED" ? "Amount" : "Percentage"}
              className="w-28 rounded-lg border border-slate-300 bg-white px-3 py-2 text-right text-sm tabular-nums dark:border-slate-700 dark:bg-slate-900"
            />
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-xs text-slate-500" title="Percentages are taken from this">
                <input
                  type="radio"
                  name="isBasic"
                  checked={draft.isBasic}
                  onChange={() =>
                    setDrafts((current) =>
                      (current ?? []).map((d, i) => ({ ...d, isBasic: i === index && d.kind === "EARNING" })),
                    )
                  }
                  disabled={draft.kind !== "EARNING"}
                />
                basic
              </label>
              <button
                type="button"
                onClick={() => setDrafts((current) => (current ?? []).filter((_, i) => i !== index))}
                aria-label={`Remove ${draft.label || "component"}`}
                className="text-xs font-semibold text-red-600 hover:underline"
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() =>
            setDrafts((current) => [
              ...(current ?? []),
              { label: "", kind: "EARNING", basis: "FIXED", amount: "0", isBasic: false },
            ])
          }
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
        >
          Add a line
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={save.isPending}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
        >
          {save.isPending ? "Saving…" : "Save salary"}
        </button>
      </div>

      {message && (
        <p role="status" className={message.tone === "ok" ? "text-sm text-emerald-600" : "text-sm text-red-600"}>
          {message.text}
        </p>
      )}

      <p className="text-xs text-slate-500">
        Percentages are taken from whichever earning is marked <em>basic</em>, never from gross — a deduction
        that depended on gross, which depends on the deductions, would have no answer.
      </p>
    </section>
  );
}
