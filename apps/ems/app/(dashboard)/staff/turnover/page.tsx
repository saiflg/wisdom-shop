"use client";

import Link from "next/link";
import { errorMessage } from "@/lib/api";
import { useTurnover } from "@/lib/use-turnover";

/**
 * Who has left the school.
 *
 * Grouped by section rather than listed by date, because the question this
 * answers is "where are we short" — a head teacher reading it is planning
 * recruitment, not reminiscing.
 */
export default function TurnoverPage() {
  const { data, isLoading, error } = useTurnover();

  const money = (cents: number) =>
    (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const date = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : "—";

  const averageLabel = (months: number | null) => {
    if (months === null) return "—";
    const years = Math.floor(months / 12);
    const rest = months % 12;
    if (years === 0) return `${rest} mo`;
    return rest === 0 ? `${years} yr` : `${years} yr ${rest} mo`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Staff turnover</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          Everyone who has left, by section. Somebody whose last day is still ahead is not here yet —
          their post is not vacant and the school is still paying them.
        </p>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {errorMessage(error, "Couldn't load the turnover register.")}
        </p>
      )}

      {data && data.total === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
          Nobody has left. A staff member is recorded as leaving by setting their end date on their{" "}
          <Link href="/staff" className="underline">
            staff record
          </Link>
          .
        </p>
      )}

      {data && data.total > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <p className="text-2xl font-bold tabular-nums">{data.total}</p>
              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">Left</p>
            </div>
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <p className="text-2xl font-bold tabular-nums">{money(data.monthlyCents)}</p>
              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">Monthly salary to replace</p>
            </div>
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <p className="text-2xl font-bold tabular-nums">{averageLabel(data.averageTenureMonths)}</p>
              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">Average time at the school</p>
            </div>
          </div>

          {/* Said out loud, because a replacement bill that quietly excludes
              people reads as complete and is not. */}
          {data.withoutSalary > 0 && (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              {data.withoutSalary} of these {data.withoutSalary === 1 ? "person was" : "people were"} never
              on a payroll run, so the replacement figure above does not include{" "}
              {data.withoutSalary === 1 ? "them" : "them"}.
            </p>
          )}

          {data.groups.map((group) => (
            <section key={group.section} className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  {group.section}
                </h2>
                <span className="text-sm text-slate-500">
                  {group.rows.length} {group.rows.length === 1 ? "person" : "people"} ·{" "}
                  {money(group.monthlyCents)} monthly
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left dark:bg-slate-900">
                    <tr>
                      <th className="px-3 py-2 font-medium">S/N</th>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Role</th>
                      <th className="px-3 py-2 text-right font-medium">Monthly salary</th>
                      <th className="px-3 py-2 font-medium">Commenced</th>
                      <th className="px-3 py-2 font-medium">Left</th>
                      <th className="px-3 py-2 font-medium">Stayed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row) => (
                      <tr key={row.staffProfileId} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-3 py-2 text-slate-500">{row.serial}</td>
                        <td className="px-3 py-2">{row.name}</td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{row.jobTitle ?? "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.lastMonthlyCents === null ? (
                            <span className="text-slate-400">not known</span>
                          ) : (
                            money(row.lastMonthlyCents)
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{date(row.startDate)}</td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{date(row.endDate)}</td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{row.tenureLabel}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
