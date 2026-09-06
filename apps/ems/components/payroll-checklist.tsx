"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import {
  useAddChecklistItem,
  useChecklist,
  useRemoveChecklistItem,
  useSetChecklistItem,
} from "@/lib/use-payroll";
import { useTranslation } from "@/lib/i18n/i18n-provider";

/**
 * The month-end checks, above the approve button.
 *
 * Deliberately not a gate. A school that has done the work in a different
 * order, or that keeps one of these checks in a ledger this software has
 * never seen, must still be able to pay its staff on time. So the list
 * warns and never blocks — a checklist that stops payroll gets ticked
 * without being read, which is worse than no checklist at all.
 */
export function PayrollChecklist({ runId, readOnly = false }: { runId: string; readOnly?: boolean }) {
  const { t } = useTranslation();
  const { data: checklist, isLoading, error } = useChecklist(runId);
  const setItem = useSetChecklistItem(runId);
  const addItem = useAddChecklistItem(runId);
  const removeItem = useRemoveChecklistItem(runId);

  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const attempt = async (action: () => Promise<unknown>, fallback: string) => {
    setMessage(null);
    try {
      await action();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : fallback);
    }
  };

  const add = async () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    setLabel("");
    try {
      await addItem.mutateAsync(trimmed);
      setAdding(false);
    } catch (err) {
      // Put it back rather than making them retype it.
      setLabel(trimmed);
      setMessage(err instanceof ApiError ? err.message : t("payrollChecks.addFailed"));
    }
  };

  if (isLoading) return <p className="text-sm text-slate-500">{t("payrollChecks.loading")}</p>;
  if (error || !checklist) return null;

  const { items, progress } = checklist;

  return (
    <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {readOnly ? t("payrollChecks.title") : t("payrollChecks.beforeApprove")}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {progress.total === 0
              ? t("payrollChecks.none")
              : t("payrollChecklist.progress", { done: progress.done, total: progress.total })}
          </p>
        </div>

        {progress.total > 0 && (
          <div className="flex items-center gap-2">
            <div
              className="h-2 w-32 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
              role="progressbar"
              aria-valuenow={progress.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t("payrollChecks.completed")}
            >
              <div
                className={`h-full transition-all ${progress.complete ? "bg-emerald-500" : "bg-amber-500"}`}
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <span className="text-xs font-semibold tabular-nums text-slate-500">{progress.percent}%</span>
          </div>
        )}
      </div>

      <ul className="mt-3 space-y-1">
        {items.map((item) => (
          <li key={item.id} className="group flex items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-900">
            <input
              id={`check-${item.id}`}
              type="checkbox"
              checked={item.done}
              disabled={readOnly}
              onChange={(event) =>
                void attempt(
                  () => setItem.mutateAsync({ itemId: item.id, done: event.target.checked }),
                  "Couldn't save that.",
                )
              }
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500 disabled:opacity-60 dark:border-slate-600"
            />
            <label
              htmlFor={`check-${item.id}`}
              className={`min-w-0 flex-1 text-sm ${readOnly ? "" : "cursor-pointer"}`}
            >
              <span className={item.done ? "text-slate-500 line-through" : ""}>{item.label}</span>
              {/* Who confirmed it, by name. Stored by value, so it still reads
                  correctly after that person has left the school. */}
              {item.done && item.doneByName && (
                <span className="mt-0.5 block text-xs text-slate-400">Checked by {item.doneByName}</span>
              )}
            </label>

            {!readOnly && (
              <button
                type="button"
                onClick={() => void attempt(() => removeItem.mutateAsync(item.id), t("errs.removeCheck"))}
                aria-label={t("payrollChecklist.removeItem")}
                className="shrink-0 rounded px-1.5 text-xs font-semibold text-slate-400 opacity-0 transition hover:text-red-600 focus:opacity-100 group-hover:opacity-100"
              >
                {t("shared.remove")}
              </button>
            )}
          </li>
        ))}
      </ul>

      {items.length === 0 && (
        <p className="mt-2 rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-xs text-slate-500 dark:border-slate-700">
          {readOnly
            ? t("payrollChecks.noneKept")
            : t("payrollChecks.schoolKeepsNone")}
        </p>
      )}

      {readOnly ? null : adding ? (
        <div className="mt-3 flex gap-2">
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void add();
              }
              if (event.key === "Escape") setAdding(false);
            }}
            autoFocus
            maxLength={200}
            placeholder={t("payrollChecks.addPlaceholder")}
            className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <button
            type="button"
            onClick={() => void add()}
            disabled={addItem.isPending || label.trim().length === 0}
            className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
          >
            {t("payrollChecklist.add")}
          </button>
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
          >
            {t("common.cancel")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-3 text-xs font-semibold text-brand-600 hover:underline"
        >
          + Add a check
        </button>
      )}

      <p className="mt-3 text-xs text-slate-500">
        {readOnly
          ? t("payrollChecks.keptAsRecord")
          : t("payrollChecks.carriesForward")}
      </p>

      {message && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {message}
        </p>
      )}
    </section>
  );
}

/**
 * The one-line version, for reading beside the approve button itself.
 *
 * Separate from the panel because somebody about to approve should not have
 * to scroll back up to find out whether anything is outstanding.
 */
export function ChecklistWarning({ runId }: { runId: string }) {
  const { data: checklist } = useChecklist(runId);
  if (!checklist?.warning) return null;

  return (
    <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
      {checklist.warning}
    </p>
  );
}
