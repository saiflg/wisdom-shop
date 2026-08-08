"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { useAuthQueryState } from "@/lib/api-auth";
import { useStaff } from "@/lib/use-staff";
import { SalaryEditor } from "@/components/salary-editor";
import {
  downloadPayslipPdf,
  downloadTransferFile,
  useApproveRun,
  useCreatePayrollRun,
  useMarkRunPaid,
  usePayrollRun,
  usePayrollRuns,
  useRefreshRun,
  type PayrollRunStatus,
} from "@/lib/use-payroll";

/** Minor units to a readable amount. Derived, never stored. */
function money(cents: number): string {
  return (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const BADGE = "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold";
const STATUS_BADGE: Record<PayrollRunStatus, string> = {
  DRAFT: `${BADGE} bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300`,
  APPROVED: `${BADGE} bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300`,
  PAID: `${BADGE} bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300`,
};

export default function PayrollPage() {
  const now = new Date();
  const { data: runs, isLoading, error } = usePayrollRuns();
  const createRun = useCreatePayrollRun();

  const [selected, setSelected] = useState<string | null>(null);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const open = async () => {
    setMessage(null);
    try {
      const run = await createRun.mutateAsync({ year, month });
      setSelected(run.id);
    } catch (err) {
      setMessage({
        tone: "error",
        text: err instanceof ApiError ? err.message : "Couldn't open that month.",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Payroll</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          Open a month, check the payslips, approve them, then download the file to take to the bank. Nothing
          here moves money — it produces the instruction, and you record when the bank has acted on it.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
        <label className="text-sm font-medium">
          Year
          <input
            type="number"
            value={year}
            min={2000}
            max={2100}
            onChange={(event) => setYear(Number(event.target.value))}
            className="mt-1.5 block w-28 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        <label className="text-sm font-medium">
          Month
          <select
            value={month}
            onChange={(event) => setMonth(Number(event.target.value))}
            className="mt-1.5 block w-40 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            {Array.from({ length: 12 }, (_, index) => (
              <option key={index + 1} value={index + 1}>
                {new Date(2000, index, 1).toLocaleString(undefined, { month: "long" })}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void open()}
          disabled={createRun.isPending}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
        >
          {createRun.isPending ? "Opening…" : "Open this month"}
        </button>
      </div>

      {message && (
        <p role="alert" className={message.tone === "ok" ? "text-sm text-emerald-600" : "text-sm text-red-600"}>
          {message.text}
        </p>
      )}

      {isLoading && <p className="text-sm text-slate-500">Loading payroll…</p>}
      {error && <p className="text-sm text-red-600">Couldn&apos;t load payroll.</p>}

      {runs && runs.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
          No payroll has been run yet.
        </p>
      )}

      <ul className="space-y-2">
        {runs?.map((run) => (
          <li key={run.id}>
            <button
              type="button"
              onClick={() => setSelected(selected === run.id ? null : run.id)}
              aria-expanded={selected === run.id}
              className="flex w-full items-center justify-between gap-4 rounded-xl border border-slate-200 p-4 text-left transition hover:border-brand-400 dark:border-slate-800"
            >
              <div className="min-w-0">
                <p className="font-semibold">{run.period}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {run.summary.staffCount} staff · net {money(run.summary.netCents)}
                  {run.paidByName ? ` · paid by ${run.paidByName}` : ""}
                </p>
              </div>
              <span className={STATUS_BADGE[run.status]}>{run.status.toLowerCase()}</span>
            </button>

            {selected === run.id && <RunDetail id={run.id} />}
          </li>
        ))}
      </ul>

      <Salaries />
    </div>
  );
}

/**
 * Salaries live here rather than on a staff page because there is no staff
 * page yet, and because payroll is where somebody goes when they are thinking
 * about pay.
 */
function Salaries() {
  const { data: staff, isLoading } = useStaff();
  const [open, setOpen] = useState<string | null>(null);

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Salaries</h2>

      {isLoading && <p className="text-sm text-slate-500">Loading staff…</p>}

      <ul className="space-y-2">
        {staff?.map((member) => (
          <li key={member.id}>
            <button
              type="button"
              onClick={() => setOpen(open === member.id ? null : member.id)}
              aria-expanded={open === member.id}
              className="flex w-full items-center justify-between gap-4 rounded-xl border border-slate-200 p-3 text-left transition hover:border-brand-400 dark:border-slate-800"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold">
                  {member.firstName} {member.lastName}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  {member.jobTitle ?? member.roles.join(", ")}
                  {member.bank.hasAccountNumber
                    ? ` · ${member.bank.bankName ?? "Bank"} ${member.bank.accountNumberMasked}`
                    : " · no bank account on file"}
                </span>
              </span>
              <span className="shrink-0 text-xs font-semibold text-brand-600">
                {open === member.id ? "Close" : "Salary"}
              </span>
            </button>

            {open === member.id && (
              <div className="mt-2">
                <SalaryEditor userId={member.id} />
              </div>
            )}
          </li>
        ))}
      </ul>

      {staff?.length === 0 && <p className="text-sm text-slate-500">No staff records yet.</p>}
    </section>
  );
}

function RunDetail({ id }: { id: string }) {
  const accessToken = useAuthQueryState().accessToken;
  const { data: run, isLoading } = usePayrollRun(id);
  const refresh = useRefreshRun(id);
  const approve = useApproveRun(id);
  const markPaid = useMarkRunPaid(id);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const run_ = async (action: () => Promise<unknown>, fallback: string) => {
    setMessage(null);
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof ApiError ? err.message : fallback });
    } finally {
      setBusy(false);
    }
  };

  const getFile = async () => {
    setMessage(null);
    setBusy(true);
    try {
      const { paidCount, missingCount } = await downloadTransferFile(id, accessToken);
      setMessage({
        tone: missingCount > 0 ? "error" : "ok",
        text:
          missingCount > 0
            ? `${paidCount} in the file. ${missingCount} staff have no account number on file and are not in it — add their bank details and download again.`
            : `${paidCount} payments in the file. Every disclosure has been recorded in the bank-detail access log.`,
      });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof ApiError ? err.message : "Couldn't produce the file." });
    } finally {
      setBusy(false);
    }
  };

  if (isLoading || !run) return <p className="p-4 text-sm text-slate-500">Loading…</p>;

  return (
    <div className="mt-2 space-y-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="grid gap-3 sm:grid-cols-4">
        <Total label="Staff" value={String(run.summary.staffCount)} />
        <Total label="Gross" value={money(run.summary.grossCents)} />
        <Total label="Deductions" value={money(run.summary.deductionsCents)} />
        <Total label="Net" value={money(run.summary.netCents)} emphasis />
      </div>

      <div className="flex flex-wrap gap-2">
        {run.status === "DRAFT" && (
          <>
            <button
              type="button"
              onClick={() => void run_(() => refresh.mutateAsync(), "Couldn't recompute.")}
              disabled={busy}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-900"
            >
              Recompute from current salaries
            </button>
            <button
              type="button"
              onClick={() => void run_(() => approve.mutateAsync(), "Couldn't approve.")}
              disabled={busy}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
            >
              Approve
            </button>
          </>
        )}

        {run.status !== "DRAFT" && (
          <button
            type="button"
            onClick={() => void getFile()}
            disabled={busy}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
          >
            Download bank file
          </button>
        )}

        {run.status === "APPROVED" && (
          <button
            type="button"
            onClick={() => void run_(() => markPaid.mutateAsync(), "Couldn't record payment.")}
            disabled={busy}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-900"
          >
            Record as paid
          </button>
        )}
      </div>

      {run.status === "APPROVED" && (
        <p className="text-xs text-slate-500">
          Approved{run.approvedByName ? ` by ${run.approvedByName}` : ""}. These payslips no longer change if a
          salary is edited.
        </p>
      )}

      {message && (
        <p role="status" className={message.tone === "ok" ? "text-sm text-emerald-600" : "text-sm text-red-600"}>
          {message.text}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="py-2">Staff</th>
              <th className="py-2 text-right">Gross</th>
              <th className="py-2 text-right">Deductions</th>
              <th className="py-2 text-right">Net</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {run.payslips?.map((payslip) => (
              <tr key={payslip.id} className="border-t border-slate-200 dark:border-slate-800">
                <td className="py-2">
                  {payslip.staffName}
                  {payslip.staffNumber ? (
                    <span className="ml-1 text-xs text-slate-500">{payslip.staffNumber}</span>
                  ) : null}
                  {payslip.overDeducted && (
                    <span className="ml-2 text-xs font-semibold text-red-600">deductions exceed pay</span>
                  )}
                </td>
                <td className="py-2 text-right tabular-nums">{money(payslip.grossCents)}</td>
                <td className="py-2 text-right tabular-nums">{money(payslip.deductionsCents)}</td>
                <td className="py-2 text-right font-semibold tabular-nums">{money(payslip.netCents)}</td>
                <td className="py-2 text-right">
                  <button
                    type="button"
                    onClick={() =>
                      void downloadPayslipPdf(payslip.id, accessToken, payslip.staffName).catch(() =>
                        setMessage({ tone: "error", text: "Couldn't produce that payslip." }),
                      )
                    }
                    className="text-xs font-semibold text-brand-600 hover:underline"
                  >
                    Payslip
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {run.payslips?.length === 0 && (
        <p className="text-sm text-slate-500">
          No payslips. Add salaries under a staff member&apos;s record first.
        </p>
      )}
    </div>
  );
}

function Total({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={emphasis ? "mt-1 text-lg font-bold tabular-nums" : "mt-1 text-lg tabular-nums"}>{value}</p>
    </div>
  );
}
