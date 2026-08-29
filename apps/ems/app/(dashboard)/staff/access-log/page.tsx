"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useBankAccessLog } from "@/lib/use-staff";

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Who has read whose bank details, and why.
 *
 * The log is the reason the reveal is allowed to exist at all: an
 * administrator can read any account number in the school, so the control that
 * actually protects staff is that they cannot do it unobserved. Reading this
 * page is therefore something a head or a governor should be able to do
 * without asking anyone — hence its own screen rather than a panel folded away
 * inside a record.
 */
export default function BankAccessLogPage() {
  const { data: entries, isLoading, error } = useBankAccessLog();
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return entries ?? [];
    return (entries ?? []).filter((entry) =>
      [entry.staffName, entry.actorName, entry.reason].some((value) => value.toLowerCase().includes(needle)),
    );
  }, [entries, query]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/staff" className="text-sm font-semibold text-brand-600 hover:underline">
          ← Staff directory
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Bank-detail access log</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          Every time a full account number has been read — on a staff record or by producing a payroll bank
          file — with the reason given at the time. The log records that a number was read, never the number.
        </p>
      </div>

      <label className="block max-w-md text-sm">
        <span className="sr-only">Search the log</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Staff member, who looked, or the reason"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
      </label>

      {isLoading && <p className="text-sm text-slate-500">Loading the log…</p>}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          Couldn&apos;t load the access log: {error.message}
        </p>
      )}

      {entries && entries.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
          Nobody has read anyone&apos;s account number yet.
        </p>
      )}

      {entries && entries.length > 0 && visible.length === 0 && (
        <p className="text-sm text-slate-500">Nothing in the log matches that.</p>
      )}

      {visible.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-start text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pe-4">When</th>
                <th className="py-2 pe-4">Whose details</th>
                <th className="py-2 pe-4">Who looked</th>
                <th className="py-2">Why</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((entry) => (
                <tr key={entry.id} className="border-t border-slate-200 align-top dark:border-slate-800">
                  <td className="whitespace-nowrap py-2 pe-4 text-slate-500">{when(entry.createdAt)}</td>
                  <td className="py-2 pe-4 font-medium">{entry.staffName}</td>
                  <td className="py-2 pe-4">{entry.actorName}</td>
                  <td className="py-2 text-slate-600 dark:text-slate-400">{entry.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-500">
        The most recent 200 entries. Entries are written before the number is returned — if recording the access
        fails, the number is not disclosed.
      </p>
    </div>
  );
}
