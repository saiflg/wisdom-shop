"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import {
  formatAmount,
  STATUS_LABEL,
  STATUS_STYLE,
  toMinorUnits,
  TRANSITION_LABEL,
  useCreateExpense,
  useDecideExpense,
  useExpenses,
  type Expense,
  type ExpenseStatus,
  type ExpenseSummary,
} from "@/lib/use-expenses";

/**
 * Money going out.
 *
 * The control the screen is built around is that nobody approves their own
 * spending — the oldest rule in bookkeeping and the first one a school with
 * three administrators loses, because the person who needs the diesel and the
 * person who can approve it are often the same person. The buttons come from
 * the API, so the person who asked never sees an Approve button on their own
 * request.
 */
export default function ExpensesPage() {
  const [status, setStatus] = useState<ExpenseStatus | undefined>(undefined);
  const { data, isLoading } = useExpenses(status ? { status } : {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Expenses</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          What the school spends. A request nobody has approved is not spending yet, and is counted
          separately.
        </p>
      </div>

      <NewExpense />

      {data && <Summary summary={data.summary} />}

      <div className="flex flex-wrap gap-2">
        <Filter label="All" active={status === undefined} onClick={() => setStatus(undefined)} />
        {(["REQUESTED", "APPROVED", "PAID", "REJECTED"] as ExpenseStatus[]).map((option) => (
          <Filter
            key={option}
            label={STATUS_LABEL[option]}
            active={status === option}
            onClick={() => setStatus(option)}
          />
        ))}
      </div>

      {isLoading && <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>}
      {data?.expenses.length === 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-400">Nothing here for that choice.</p>
      )}

      <div className="space-y-3">
        {data?.expenses.map((expense) => (
          <ExpenseRow key={expense.id} expense={expense} />
        ))}
      </div>
    </div>
  );
}

function Filter({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
        active
          ? "bg-brand-gradient text-white"
          : "border border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-400"
      }`}
    >
      {label}
    </button>
  );
}

function Summary({ summary }: { summary: ExpenseSummary }) {
  return (
    <section className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
      <div className="flex flex-wrap gap-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Committed</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{formatAmount(summary.committedCents)}</p>
          <p className="text-xs text-slate-500">approved and paid</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Paid</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-600">
            {formatAmount(summary.paidCents)}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Outstanding</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-amber-600">
            {formatAmount(summary.outstandingCents)}
          </p>
          <p className="text-xs text-slate-500">approved, not yet paid</p>
        </div>
        <div>
          {/* Kept out of every other figure. A request nobody approved is
              somebody asking, not money the school has spent, and folding it
              in would overstate spending in the direction that makes
              somebody cut what they did not need to. */}
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Waiting</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-500">
            {formatAmount(summary.pendingCents)}
          </p>
          <p className="text-xs text-slate-500">not spending yet</p>
        </div>
      </div>

      {summary.byCategory.length > 0 && (
        <p className="mt-4 text-xs text-slate-500">
          Going on: {summary.byCategory.map((c) => `${c.category} ${formatAmount(c.amountCents)}`).join(" · ")}
        </p>
      )}
    </section>
  );
}

function NewExpense() {
  const create = useCreateExpense();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    category: "",
    description: "",
    amount: "",
    incurredOn: new Date().toISOString().slice(0, 10),
    payee: "",
  });
  const [error, setError] = useState<string | null>(null);

  const minor = toMinorUnits(form.amount);
  const valid = form.category.trim() && form.description.trim() && Number.isInteger(minor) && minor > 0;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await create.mutateAsync({
        category: form.category.trim(),
        description: form.description.trim(),
        amountCents: minor,
        incurredOn: form.incurredOn,
        payee: form.payee.trim() || undefined,
      });
      setForm({ ...form, category: "", description: "", amount: "", payee: "" });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save that");
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white"
      >
        Ask for money
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">New expense</h2>

      <div className="mt-3 flex flex-wrap gap-3">
        <label className="text-xs text-slate-500">
          Category
          <input
            value={form.category}
            onChange={(event) => setForm({ ...form, category: event.target.value })}
            required
            maxLength={80}
            placeholder="Diesel"
            className="mt-1 block w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        <label className="text-xs text-slate-500">
          Amount
          <input
            value={form.amount}
            onChange={(event) => setForm({ ...form, amount: event.target.value })}
            inputMode="decimal"
            placeholder="50000.00"
            className="mt-1 block w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        <label className="text-xs text-slate-500">
          When {/* Not today by default in spirit: a receipt from last Tuesday
                    belongs in last Tuesday. */}
          <input
            type="date"
            value={form.incurredOn}
            onChange={(event) => setForm({ ...form, incurredOn: event.target.value })}
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        <label className="text-xs text-slate-500">
          Paid to
          <input
            value={form.payee}
            onChange={(event) => setForm({ ...form, payee: event.target.value })}
            maxLength={200}
            placeholder="Ikeja Fuels Ltd"
            className="mt-1 block w-48 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
      </div>

      <label className="mt-3 block text-xs text-slate-500">
        What for
        <input
          value={form.description}
          onChange={(event) => setForm({ ...form, description: event.target.value })}
          required
          maxLength={500}
          placeholder="Generator diesel for September"
          className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
      </label>

      <p className="mt-2 text-xs text-slate-500">
        Somebody else has to approve this. You will not be able to approve it yourself.
      </p>

      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={create.isPending || !valid}
          className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {create.isPending ? "Saving…" : "Submit"}
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

function ExpenseRow({ expense }: { expense: Expense }) {
  const decide = useDecideExpense(expense.id);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const moves = expense.availableTransitions ?? [];

  const move = async (to: ExpenseStatus) => {
    setMessage(null);
    try {
      await decide.mutateAsync({ to, note: note.trim() || undefined });
      setNote("");
    } catch (err) {
      // Where "spending cannot be approved by the person who asked for it"
      // surfaces, if somebody reaches it another way.
      setMessage(err instanceof ApiError ? err.message : "Could not do that");
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            {expense.category}
            <span className="ms-2 tabular-nums text-slate-600 dark:text-slate-400">
              {formatAmount(expense.amountCents)}
            </span>
          </p>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">{expense.description}</p>
          <p className="mt-1 text-xs text-slate-500">
            {new Date(expense.incurredOn).toLocaleDateString()}
            {expense.payee && ` · ${expense.payee}`} · asked by {expense.requestedByName}
            {expense.decidedByName && ` · decided by ${expense.decidedByName}`}
            {expense.reference && ` · ref ${expense.reference}`}
          </p>
          {expense.decisionNote && <p className="mt-1 text-xs text-amber-600">{expense.decisionNote}</p>}
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[expense.status]}`}>
          {STATUS_LABEL[expense.status]}
        </span>
      </div>

      {moves.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
          {moves.includes("REJECTED") && (
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
              placeholder="Why? (required to turn down)"
              className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          )}
          <div className="flex flex-wrap gap-2">
            {moves.map((to) => (
              <button
                key={to}
                type="button"
                onClick={() => move(to)}
                disabled={decide.isPending}
                className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 ${
                  to === "APPROVED" || to === "PAID"
                    ? "bg-brand-gradient text-white"
                    : "border border-slate-300 dark:border-slate-700"
                }`}
              >
                {TRANSITION_LABEL[to]}
              </button>
            ))}
          </div>
        </div>
      )}

      {moves.length === 0 && expense.status === "REQUESTED" && (
        // Said plainly rather than leaving somebody hunting for a button that
        // was never going to be there.
        <p className="mt-2 text-xs text-slate-500">
          Waiting for somebody else. Spending cannot be approved by the person who asked for it.
        </p>
      )}

      {message && <p className="mt-2 text-xs text-red-600">{message}</p>}
    </section>
  );
}
