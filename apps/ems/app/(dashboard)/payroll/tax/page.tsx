"use client";

import { useEffect, useState } from "react";
import { errorMessage } from "@/lib/api";
import { usePayrollRuns } from "@/lib/use-payroll";
import { useTaxRegister } from "@/lib/use-statutory";

/**
 * PAYE for one month.
 *
 * The document a school files with the tax authority: who paid, how much, and
 * the total to remit. Only people who actually paid appear — a schedule
 * listing forty staff with a zero against thirty of them invites questions
 * the school has no answer to.
 */
export default function TaxRegisterPage() {
  const { data: runs } = usePayrollRuns();
  const [runId, setRunId] = useState<string | null>(null);

  useEffect(() => {
    if (!runId && runs?.[0]) setRunId(runs[0].id);
  }, [runs, runId]);

  const { data, isLoading, error } = useTaxRegister(runId);

  const money = (cents: number) =>
    (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const notTaxed = data ? data.register.staffConsidered - data.register.rows.length : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">PAYE schedule</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          Tax deducted this month, taken from the approved payroll run. Nothing here is recalculated —
          it says exactly what the voucher said.
        </p>
      </div>

      <label className="block max-w-xs">
        <span className="text-sm font-medium">Payroll run</span>
        <select
          value={runId ?? ""}
          onChange={(e) => setRunId(e.target.value || null)}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        >
          {(runs ?? []).map((run) => (
            <option key={run.id} value={run.id}>
              {run.year}-{String(run.month).padStart(2, "0")} · {run.status}
            </option>
          ))}
        </select>
      </label>

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {errorMessage(error, "Couldn't load the PAYE schedule.")}
        </p>
      )}

      {data && (
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-lg font-bold uppercase">{data.schoolName}</p>
            <p className="text-sm font-semibold">{data.heading}</p>
          </div>

          {data.register.rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
              Nobody paid tax in this run. There is nothing to file.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left dark:bg-slate-900">
                    <tr>
                      <th className="px-3 py-2 font-medium">S/N</th>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 text-right font-medium">Tax/month</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.register.rows.map((row) => (
                      <tr key={row.staffProfileId} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-3 py-2 text-slate-500">{row.serial}</td>
                        <td className="px-3 py-2">{row.staffName}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(row.taxCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 font-semibold dark:border-slate-700">
                      <td className="px-3 py-2" colSpan={2}>
                        Total to remit
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(data.register.totalCents)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Said plainly rather than left to be inferred from a row
                  count: an office checking the schedule wants to know the
                  missing staff are missing on purpose. */}
              {notTaxed > 0 && (
                <p className="text-sm text-slate-500">
                  {notTaxed} other {notTaxed === 1 ? "member" : "members"} of staff paid no tax this month
                  and {notTaxed === 1 ? "is" : "are"} not listed.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
