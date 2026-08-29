"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { errorMessage } from "@/lib/api";
import { usePayrollRuns } from "@/lib/use-payroll";
import { useDownloadVoucher, useVoucher } from "@/lib/use-voucher";

/**
 * The salary voucher for one payroll run.
 *
 * The screen shows what the printed sheet will say, so somebody can check it
 * before it goes anywhere — including the page subtotals, which are the part
 * a bursar signs against.
 */
export default function VoucherPage() {
  const { data: runs } = usePayrollRuns();
  const [runId, setRunId] = useState<string | null>(null);
  const [includeAccounts, setIncludeAccounts] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Default to the most recent run rather than making somebody choose before
  // seeing anything.
  useEffect(() => {
    if (!runId && runs?.[0]) setRunId(runs[0].id);
  }, [runs, runId]);

  const { data, isLoading, error } = useVoucher(runId);
  const download = useDownloadVoucher();

  const money = (cents: number) =>
    (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Salary voucher</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            Every member of staff on one sheet, with a subtotal at the foot of each page.
          </p>
        </div>
        <Link
          href="/payroll/voucher/layout"
          className="rounded-full border border-slate-300 px-4 py-1.5 text-sm transition hover:border-brand-400 dark:border-slate-700"
        >
          Change the layout
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-sm font-medium">Payroll run</span>
          <select
            value={runId ?? ""}
            onChange={(e) => setRunId(e.target.value || null)}
            className="mt-1 min-w-[14rem] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            {(runs ?? []).map((run) => (
              <option key={run.id} value={run.id}>
                {run.year}-{String(run.month).padStart(2, "0")} · {run.status}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          disabled={!runId || download.isPending}
          onClick={() => {
            setProblem(null);
            download
              .mutateAsync({ runId: runId!, includeAccountNumbers: includeAccounts })
              .catch((err) => setProblem(errorMessage(err, "Couldn't build the voucher.")));
          }}
          className="rounded-full bg-brand-gradient px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {download.isPending ? "Building…" : "Download spreadsheet"}
        </button>
      </div>

      {/* Off by default. A voucher pinned to a noticeboard must not carry
          fifty account numbers; one going to the bank must. */}
      <label className="flex max-w-2xl items-start gap-2 rounded-xl border border-amber-300 bg-amber-50/60 p-3 text-sm dark:border-amber-900/50 dark:bg-amber-950/20">
        <input
          type="checkbox"
          checked={includeAccounts}
          onChange={(e) => setIncludeAccounts(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          <span className="font-medium">Include full account numbers</span>
          <span className="mt-0.5 block text-slate-600 dark:text-slate-400">
            Only for a copy going to the bank. Every staff member whose number is printed is recorded in
            the{" "}
            <Link href="/staff/access-log" className="underline">
              bank detail access log
            </Link>
            .
          </span>
        </span>
      </label>

      {problem && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {problem}
        </p>
      )}

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {errorMessage(error, "Couldn't load the voucher.")}
        </p>
      )}

      {data && (
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-lg font-bold uppercase">{data.heading.schoolName}</p>
            <p className="text-sm">{data.heading.period}</p>
            <p className="text-sm font-semibold">{data.heading.title}</p>
          </div>

          {data.voucher.staffCount === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
              This run has no payslips yet.
            </p>
          ) : (
            data.voucher.pages.map((page) => (
              <div key={page.pageNumber} className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-start dark:bg-slate-900">
                    <tr>
                      {data.columns.map((column) => (
                        <th key={column.key} className={`whitespace-nowrap px-2 py-2 font-medium ${column.money ? "text-end" : ""}`}>
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {page.rows.map((row) => (
                      <tr key={row.staffProfileId} className="border-t border-slate-100 dark:border-slate-800">
                        {row.cells.map((cell, i) => {
                          // A row always has one cell per column, but the
                          // compiler cannot know that across two arrays, and
                          // asserting it would turn a future mismatch into a
                          // blank crash instead of a blank cell.
                          const column = data.columns[i];
                          return (
                            <td
                              key={column?.key ?? i}
                              className={`whitespace-nowrap px-2 py-1.5 ${column?.money ? "text-end tabular-nums" : ""}`}
                            >
                              {cell.text}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 font-semibold dark:border-slate-700">
                      <td className="px-2 py-2" colSpan={data.columns.length - 1}>
                        Page {page.pageNumber} total
                      </td>
                      <td className="px-2 py-2 text-end tabular-nums">{money(page.subtotalCents)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ))
          )}

          {data.voucher.staffCount > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <span className="text-sm text-slate-600 dark:text-slate-400">
                {data.voucher.staffCount} staff · {data.voucher.pages.length}{" "}
                {data.voucher.pages.length === 1 ? "page" : "pages"}
              </span>
              <span className="text-lg font-bold tabular-nums">
                Total {money(data.voucher.grandTotalCents)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
