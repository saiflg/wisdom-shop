"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, errorMessage } from "@/lib/api";
import { authHeaders, useAuthQueryState } from "@/lib/api-auth";

type AuditCategory =
  | "STAFF_PRIVACY"
  | "CHILD_RECORD"
  | "MONEY"
  | "COMMUNICATION"
  | "ACCESS"
  | "MODERATION";

interface AuditEntry {
  id: string;
  at: string;
  actorName: string;
  actorUserId: string | null;
  category: AuditCategory;
  categoryLabel: string;
  summary: string;
  reason: string | null;
  source: string;
}

interface AuditResponse {
  entries: AuditEntry[];
  sources: string[];
  truncated: boolean;
}

const CATEGORIES: { value: AuditCategory; label: string }[] = [
  { value: "STAFF_PRIVACY", label: "Staff privacy" },
  { value: "CHILD_RECORD", label: "Child's record" },
  { value: "MONEY", label: "Money" },
  { value: "COMMUNICATION", label: "Communication" },
  { value: "ACCESS", label: "Access" },
  { value: "MODERATION", label: "Moderation" },
];

const TONE: Record<AuditCategory, string> = {
  STAFF_PRIVACY: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  CHILD_RECORD: "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  MONEY: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  COMMUNICATION: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
  ACCESS: "bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300",
  MODERATION: "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-300",
};

/**
 * Who did what, and when.
 *
 * Assembled from the trails the product already keeps rather than a separate
 * audit table — those rows are written as part of the operation itself, so an
 * attendance mark cannot be amended without the amendment existing.
 *
 * Read-only by construction: there is no write route to call.
 */
export default function AuditLogPage() {
  const { accessToken, enabled } = useAuthQueryState();

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  if (category) params.set("categories", category);
  if (from) params.set("from", from);
  if (to) params.set("to", to);

  const { data, isLoading, error } = useQuery({
    queryKey: ["audit", params.toString()],
    enabled,
    queryFn: () =>
      apiFetch<AuditResponse>(`/v1/audit?${params.toString()}`, { headers: authHeaders(accessToken) }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit log</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
          Who read a bank account, who changed a mark, who took money, who told the whole school something.
          Names are as they were recorded at the time — nothing here can be edited or added to.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[14rem] flex-1 text-sm">
          <span className="sr-only">Search the log</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="A person, what they did, or why"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </label>

        <label className="text-sm">
          <span className="sr-only">Category</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="">Everything</option>
            {CATEGORIES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="text-xs font-medium">
          From
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="mt-0.5 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        <label className="text-xs font-medium">
          To
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="mt-0.5 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Reading the trails…</p>}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {errorMessage(error, "Couldn't read the audit log.")}
        </p>
      )}

      {data && data.entries.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
          Nothing matches that.
        </p>
      )}

      {data && data.entries.length > 0 && (
        <ul className="space-y-2">
          {data.entries.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800"
            >
              <div className="min-w-0">
                <p className="text-sm">
                  <span className="font-semibold">{entry.actorName}</span>{" "}
                  <span className="text-slate-700 dark:text-slate-300">{entry.summary}</span>
                </p>
                {/* Shown rather than hidden behind a click: on the trails that
                    demand a reason, the reason IS the point of the record. */}
                {entry.reason && (
                  <p className="mt-0.5 text-xs italic text-slate-500">“{entry.reason}”</p>
                )}
                <p className="mt-0.5 font-mono text-[11px] text-slate-400">{entry.source}</p>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${TONE[entry.category]}`}>
                  {entry.categoryLabel}
                </span>
                <time dateTime={entry.at} className="text-xs text-slate-500">
                  {new Date(entry.at).toLocaleString()}
                </time>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Said plainly, because a log that quietly omits things is worse than
          no log: a reader should know exactly what it does and does not see. */}
      {data && (
        <p className="text-xs text-slate-500">
          {data.truncated && "Showing the most recent matches only. Narrow the dates to see further back. "}
          Assembled from {data.sources.length} trails: {data.sources.join(", ")}.
        </p>
      )}
    </div>
  );
}
