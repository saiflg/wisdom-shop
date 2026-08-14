"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { errorMessage } from "@/lib/api";
import { usePayrollRuns } from "@/lib/use-payroll";
import { useApplyStaffFees, useStaffFeesPreview, type AppliedFees } from "@/lib/use-staff-fees";

/**
 * Settling staff children's school fees out of salary.
 *
 * Deliberately a two-step screen: read what would happen, then apply it. This
 * moves real money between two ledgers at once — it reduces a family's bill
 * and takes it from somebody's wages — so it is not something to do with a
 * single click on arrival.
 */
export default function StaffFeesPage() {
  const { data: runs } = usePayrollRuns();
  const { data: rows, isLoading, error } = useStaffFeesPreview();
  const apply = useApplyStaffFees();

  const [runId, setRunId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<AppliedFees | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!runId && runs?.[0]) setRunId(runs[0].id);
  }, [runs, runId]);

  const money = (cents: number) =>
    (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const active = (rows ?? []).filter((row) => row.plan.totalCents > 0);
  const blocked = (rows ?? []).filter((row) => row.blocked);
  const totalCents = active.reduce((total, row) => total + row.plan.totalCents, 0);
  const run = runs?.find((r) => r.id === runId);
  const canApply = Boolean(runId) && run?.status !== "DRAFT" && totalCents > 0;

  const runApply = async () => {
    if (!runId) return;
    setProblem(null);
    try {
      setResult(await apply.mutateAsync(runId));
      setConfirming(false);
    } catch (err) {
      setProblem(errorMessage(err, "Couldn't settle those fees."));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Staff children&apos;s fees</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          Recover school fees for staff members&apos; own children from their salary. Only people who have
          agreed to it appear here — the monthly amount is set on each{" "}
          <Link href="/staff" className="underline">
            staff record
          </Link>
          .
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-sm font-medium">Payroll run</span>
          <select
            value={runId ?? ""}
            onChange={(e) => {
              setRunId(e.target.value || null);
              setResult(null);
            }}
            className="mt-1 min-w-[14rem] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            {(runs ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.year}-{String(r.month).padStart(2, "0")} · {r.status}
              </option>
            ))}
          </select>
        </label>

        {run?.status === "DRAFT" && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Approve this run first — a family should not be credited from a payroll nobody has agreed to.
          </p>
        )}
      </div>

      {problem && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {problem}
        </p>
      )}

      {result && (
        <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
          <p className="font-medium">Settled {money(result.appliedCents)}.</p>
          {result.credited.map((c) => (
            <p key={`${c.invoiceNumber}-${c.studentName}`} className="mt-0.5">
              {c.staffName} → {c.studentName} ({c.invoiceNumber}): {money(c.amountCents)}
            </p>
          ))}
          {/* Not an error. Saying so plainly stops somebody concluding the
              button is broken and pressing it repeatedly. */}
          {result.alreadyDone > 0 && (
            <p className="mt-1">
              {result.alreadyDone} {result.alreadyDone === 1 ? "invoice was" : "invoices were"} already
              settled by this run and {result.alreadyDone === 1 ? "was" : "were"} left alone.
            </p>
          )}
        </div>
      )}

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {errorMessage(error, "Couldn't work out what would be recovered.")}
        </p>
      )}

      {blocked.length > 0 && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <p className="font-medium">
            {blocked.length} {blocked.length === 1 ? "person cannot" : "people cannot"} be recovered against
          </p>
          {blocked.map((row) => (
            <p key={row.staffProfileId} className="mt-0.5">
              {row.staffName}: {row.blocked}
            </p>
          ))}
        </div>
      )}

      {rows && active.length === 0 && blocked.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
          Nothing to recover. Either nobody has agreed to this arrangement, or their children owe nothing.
        </p>
      )}

      {active.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left dark:bg-slate-900">
                <tr>
                  <th className="px-3 py-2 font-medium">Staff member</th>
                  <th className="px-3 py-2 font-medium">Children</th>
                  <th className="px-3 py-2 text-right font-medium">Owed</th>
                  <th className="px-3 py-2 text-right font-medium">Agreed monthly</th>
                  <th className="px-3 py-2 text-right font-medium">This month</th>
                  <th className="px-3 py-2 text-right font-medium">Left after</th>
                </tr>
              </thead>
              <tbody>
                {active.map((row) => (
                  <tr key={row.staffProfileId} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2">{row.staffName}</td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                      {row.children.map((c) => c.studentName).join(", ")}
                      {/* Which bill the money lands on, because oldest-first
                          is not what somebody would assume. */}
                      {row.plan.allocations.length > 0 && (
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {row.plan.allocations
                            .map((a) => `${a.invoiceNumber} ${money(a.amountCents)}`)
                            .join(" · ")}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(row.plan.outstandingCents)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                      {money(row.monthlyCapCents)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {money(row.plan.totalCents)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(row.plan.remainingCents)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 font-semibold dark:border-slate-700">
                  <td className="px-3 py-2" colSpan={4}>
                    Total to settle
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(totalCents)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {confirming ? (
            <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50/60 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
              <p className="text-sm">
                This will take <strong>{money(totalCents)}</strong> from {active.length}{" "}
                {active.length === 1 ? "salary" : "salaries"} and credit it against their children&apos;s
                invoices. Running it twice is safe — the second time settles nothing further.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void runApply()}
                  disabled={apply.isPending}
                  className="rounded-full bg-brand-gradient px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {apply.isPending ? "Settling…" : "Yes, settle these fees"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded-full border border-slate-300 px-5 py-2 text-sm dark:border-slate-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={!canApply}
              className="rounded-full bg-brand-gradient px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              Settle {money(totalCents)} from this run
            </button>
          )}
        </>
      )}
    </div>
  );
}
