"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import {
  formatAmount,
  toMinorUnits,
  useBudgets,
  useBudgetWithActual,
  useCreateBudget,
  useDeleteBudget,
  usedPercent,
  type BudgetComparison,
  type BudgetComparisonRow,
  type BudgetLine,
} from "@/lib/use-budgets";

/**
 * What the school meant to spend, beside what it actually spent.
 *
 * The screen's job is to make two things impossible to miss: a line that has
 * been overspent, and money that went out under a category nobody budgeted
 * for. The second is the one a budget report usually hides, and hiding it
 * makes a school look comfortably within budget while it is not.
 */
export default function BudgetPage() {
  const { data: budgets, isLoading } = useBudgets();
  const [selected, setSelected] = useState<string | null>(null);
  const current = selected ?? budgets?.[0]?.id ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Budget</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          What you planned to spend, beside what has actually gone out. Only approved and paid expenses count
          — a request still waiting is not spending yet.
        </p>
      </div>

      <NewBudget />

      {isLoading && <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>}
      {budgets?.length === 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-400">No budgets set yet.</p>
      )}

      {budgets && budgets.length > 1 && (
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Budget
          <select
            value={current ?? ""}
            onChange={(event) => setSelected(event.target.value)}
            className="mt-1 block w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case dark:border-slate-700 dark:bg-slate-900"
          >
            {budgets.map((budget) => (
              <option key={budget.id} value={budget.id}>
                {budget.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {current && <BudgetDetail id={current} />}
    </div>
  );
}

function BudgetDetail({ id }: { id: string }) {
  const { data } = useBudgetWithActual(id);
  const remove = useDeleteBudget();

  if (!data) return null;
  const { budget, comparison } = data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">{budget.name}</p>
          <p className="text-xs text-slate-500">
            {new Date(budget.fromDate).toLocaleDateString()} to {new Date(budget.toDate).toLocaleDateString()}
            {budget.term && ` · ${budget.term} term`}
            {budget.createdByName && ` · set by ${budget.createdByName}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => remove.mutateAsync(budget.id)}
          disabled={remove.isPending}
          className="rounded-lg border border-red-300 px-3 py-1 text-xs font-semibold text-red-600 disabled:opacity-50 dark:border-red-900"
        >
          Withdraw
        </button>
      </div>

      <Totals comparison={comparison} />

      <ul className="space-y-2">
        {comparison.rows.map((row) => (
          <Row key={row.category} row={row} />
        ))}
      </ul>
      {comparison.rows.length === 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-400">This budget has no lines.</p>
      )}
    </div>
  );
}

function Totals({ comparison }: { comparison: BudgetComparison }) {
  const over = comparison.remainingCents < 0;
  return (
    <section className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
      <div className="flex flex-wrap gap-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Budgeted</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{formatAmount(comparison.budgetedCents)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Spent</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{formatAmount(comparison.spentCents)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {over ? "Over by" : "Left"}
          </p>
          <p
            className={`mt-1 text-2xl font-bold tabular-nums ${over ? "text-red-600" : "text-emerald-600"}`}
          >
            {formatAmount(Math.abs(comparison.remainingCents))}
          </p>
        </div>
      </div>

      {/* Called out on its own. This is the number a budget report usually
          loses, and losing it makes a school look comfortably within budget
          while it is not. */}
      {comparison.unbudgetedCents > 0 && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          {formatAmount(comparison.unbudgetedCents)} was spent under categories this budget has no line for.
          It is counted in the totals above and shown in the list below.
        </p>
      )}
    </section>
  );
}

function Row({ row }: { row: BudgetComparisonRow }) {
  const percent = usedPercent(row);

  return (
    <li className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">
          {row.category}
          {row.unbudgeted && (
            <span className="ms-2 text-xs font-normal text-amber-600">not budgeted for</span>
          )}
        </p>
        <p className="text-sm tabular-nums">
          <span className={row.overspent ? "font-semibold text-red-600" : ""}>
            {formatAmount(row.spentCents)}
          </span>
          <span className="text-slate-500"> of {formatAmount(row.budgetedCents)}</span>
        </p>
      </div>

      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div
          className={`h-full rounded-full ${row.overspent ? "bg-red-600" : "bg-emerald-600"}`}
          // The bar is capped at full width; the number beside it is not.
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>

      <p className="mt-1 text-xs text-slate-500">
        {/* Never capped: a line at 140% has to read as 140%, or a badly
            overspent line looks identical to one exactly on budget. */}
        {row.budgetedCents > 0 ? `${percent}% used` : "no allowance set"}
        {row.overspent && row.budgetedCents > 0 && ` · over by ${formatAmount(-row.remainingCents)}`}
      </p>
    </li>
  );
}

function NewBudget() {
  const create = useCreateBudget();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [academicYear, setAcademicYear] = useState("2026-2027");
  const [term, setTerm] = useState("First");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [rows, setRows] = useState<{ category: string; amount: string }[]>([
    { category: "Diesel", amount: "" },
    { category: "Stationery", amount: "" },
  ]);
  const [error, setError] = useState<string | null>(null);

  const lines: BudgetLine[] = rows
    .filter((row) => row.category.trim())
    .map((row) => ({ category: row.category.trim(), amountCents: toMinorUnits(row.amount || "0") }));

  const valid =
    name.trim() && fromDate && toDate && lines.length > 0 && lines.every((l) => Number.isInteger(l.amountCents));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await create.mutateAsync({ name: name.trim(), academicYear, term, fromDate, toDate, lines });
      setOpen(false);
      setName("");
    } catch (err) {
      // Where "there are two lines for X" surfaces.
      setError(err instanceof ApiError ? err.message : "Could not save that budget");
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white"
      >
        New budget
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">New budget</h2>

      <div className="mt-3 flex flex-wrap gap-3">
        <label className="text-xs text-slate-500">
          Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={120}
            placeholder="2026-2027 First term"
            className="mt-1 block w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        <label className="text-xs text-slate-500">
          Year
          <input
            value={academicYear}
            onChange={(event) => setAcademicYear(event.target.value)}
            maxLength={20}
            className="mt-1 block w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        <label className="text-xs text-slate-500">
          Term
          <select
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <option>First</option>
            <option>Second</option>
            <option>Third</option>
          </select>
        </label>
        <label className="text-xs text-slate-500">
          From
          <input
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
            required
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        <label className="text-xs text-slate-500">
          To
          <input
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
            required
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
      </div>

      <ul className="mt-4 space-y-2">
        {rows.map((row, index) => (
          <li key={index} className="flex flex-wrap items-center gap-2">
            <input
              value={row.category}
              onChange={(event) =>
                setRows(rows.map((r, i) => (i === index ? { ...r, category: event.target.value } : r)))
              }
              placeholder="Category"
              aria-label={`Line ${index + 1} category`}
              className="w-40 rounded-lg border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
            <input
              value={row.amount}
              onChange={(event) =>
                setRows(rows.map((r, i) => (i === index ? { ...r, amount: event.target.value } : r)))
              }
              inputMode="decimal"
              placeholder="100000.00"
              aria-label={`Line ${index + 1} amount`}
              className="w-36 rounded-lg border border-slate-300 px-2 py-1 text-sm tabular-nums dark:border-slate-700 dark:bg-slate-900"
            />
            <button
              type="button"
              onClick={() => setRows(rows.filter((_, i) => i !== index))}
              className="text-xs text-slate-500 underline"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => setRows([...rows, { category: "", amount: "" }])}
        className="mt-2 rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold dark:border-slate-700"
      >
        Add line
      </button>

      <p className="mt-3 text-xs text-slate-500">
        Categories are matched to expenses by name, ignoring capitals. Spending under a category with no line
        here still shows up — it is not hidden.
      </p>

      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={create.isPending || !valid}
          className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {create.isPending ? "Saving…" : "Save budget"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-700"
        >
          Cancel
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </form>
  );
}
