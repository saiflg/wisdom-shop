"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { authHeaders, useAuthQueryState } from "@/lib/api-auth";

interface MoneyLine {
  label: string;
  amountCents: number;
  count: number;
}

interface Statement {
  income: MoneyLine[];
  outgoings: MoneyLine[];
  incomeCents: number;
  outgoingsCents: number;
  netCents: number;
  committedNotPaidCents: number;
  owedToSchoolCents: number;
  excludes: string[];
}

function formatAmount(cents: number): string {
  const major = Math.floor(Math.abs(cents) / 100).toLocaleString("en-NG");
  return `${cents < 0 ? "-" : ""}${major}.${String(Math.abs(cents) % 100).padStart(2, "0")}`;
}

function useStatement(from: string, to: string) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: ["accounting", from, to],
    enabled: enabled && Boolean(from && to),
    queryFn: () =>
      apiFetch<Statement>(`/v1/accounting/statement?from=${from}&to=${to}`, {
        headers: authHeaders(accessToken),
      }),
  });
}

/**
 * What money did over a period.
 *
 * Not double-entry bookkeeping, and the screen says so where somebody will
 * read it rather than in a footnote. A page called "Accounting" that quietly
 * omitted a category would produce a figure somebody puts in front of a
 * board, so what is not counted is listed as prominently as what is.
 */
export default function AccountingPage() {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() - 3);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const { data, isLoading } = useStatement(from, to);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Accounting</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          What came in and what went out over a period, from what the school has recorded. This is a summary,
          not a set of books — there is no ledger, no journal and no trial balance here.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="text-xs text-slate-500">
          From
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        <label className="text-xs text-slate-500">
          To
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
      </div>

      {isLoading && <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>}

      {data && (
        <>
          <section className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
            <div className="flex flex-wrap gap-8">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">In</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-600">
                  {formatAmount(data.incomeCents)}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Out</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">{formatAmount(data.outgoingsCents)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Net</p>
                {/* A negative term is a real fact and is shown as one. */}
                <p
                  className={`mt-1 text-2xl font-bold tabular-nums ${
                    data.netCents < 0 ? "text-red-600" : "text-emerald-600"
                  }`}
                >
                  {formatAmount(data.netCents)}
                </p>
              </div>
            </div>
          </section>

          <div className="grid gap-3 md:grid-cols-2">
            <Lines title="Money in" lines={data.income} />
            <Lines title="Money out" lines={data.outgoings} />
          </div>

          {/* Kept out of the net, and said so. This is a record of what moved,
              not a forecast. */}
          <section className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Committed, not yet paid
              </p>
              <p className="mt-1 text-xl font-bold tabular-nums">
                {formatAmount(data.committedNotPaidCents)}
              </p>
              <p className="text-xs text-slate-500">Not in the net figure above.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Owed to the school</p>
              <p className="mt-1 text-xl font-bold tabular-nums">{formatAmount(data.owedToSchoolCents)}</p>
              <p className="text-xs text-slate-500">Fees invoiced and not collected, across all time.</p>
            </div>
          </section>

          {/* As prominent as the figures. Somebody acting on the net number
              needs to know what is not in it. */}
          <section className="rounded-2xl border border-amber-300 p-4 dark:border-amber-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
              What this does not count
            </p>
            <ul className="mt-2 space-y-1">
              {data.excludes.map((line) => (
                <li key={line} className="text-sm text-amber-700 dark:text-amber-300">
                  {line}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function Lines({ title, lines }: { title: string; lines: MoneyLine[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      {lines.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">Nothing in this period.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {lines.map((line) => (
            <li key={line.label} className="flex items-baseline justify-between gap-2 text-sm">
              <span>
                {line.label}
                <span className="ms-2 text-xs text-slate-500">{line.count}</span>
              </span>
              <span className="tabular-nums">{formatAmount(line.amountCents)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
