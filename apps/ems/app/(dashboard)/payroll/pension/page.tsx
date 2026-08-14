"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { errorMessage } from "@/lib/api";
import { usePayrollRuns } from "@/lib/use-payroll";
import { usePensionRegister, useSavePensionSettings } from "@/lib/use-statutory";

/**
 * The contribution schedule filed with the pension administrator.
 *
 * The PFA details sit on this page rather than in a settings section, because
 * they are printed at the top of the document and a schedule with no
 * administrator named cannot be filed. Somebody discovering that should be
 * able to fix it where they found it.
 */
export default function PensionRegisterPage() {
  const { data: runs } = usePayrollRuns();
  const [runId, setRunId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!runId && runs?.[0]) setRunId(runs[0].id);
  }, [runs, runId]);

  const { data, isLoading, error } = usePensionRegister(runId);
  const save = useSavePensionSettings();

  const [form, setForm] = useState({
    providerName: "",
    remittanceBankName: "",
    remittanceAccountNumber: "",
    employerMatchPercent: "100",
  });

  // Seeded from the server once it arrives, so the form starts from what the
  // school actually has rather than blanks that would clear it on save.
  useEffect(() => {
    if (!data) return;
    setForm({
      providerName: data.settings.providerName ?? "",
      remittanceBankName: data.settings.remittanceBankName ?? "",
      remittanceAccountNumber: data.settings.remittanceAccountNumber ?? "",
      employerMatchPercent: String(data.settings.employerMatchPercent),
    });
  }, [data]);

  const money = (cents: number) =>
    (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const submit = async () => {
    setProblem(null);
    const percent = Number(form.employerMatchPercent);
    if (!Number.isFinite(percent) || percent < 0) {
      setProblem("The employer share must be a percentage, e.g. 100 or 125.");
      return;
    }
    try {
      await save.mutateAsync({
        providerName: form.providerName.trim() || null,
        remittanceBankName: form.remittanceBankName.trim() || null,
        remittanceAccountNumber: form.remittanceAccountNumber.trim() || null,
        employerMatchPercent: Math.trunc(percent),
      });
      setEditing(false);
    } catch (err) {
      setProblem(errorMessage(err, "Couldn't save the pension details."));
    }
  };

  const missing = data?.register.missingPin ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pension schedule</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            Contributions for one month, ready to send to the administrator. The employer&apos;s share is
            worked out from the employee&apos;s, so the two always agree.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="rounded-full border border-slate-300 px-4 py-1.5 text-sm transition hover:border-brand-400 dark:border-slate-700"
        >
          {editing ? "Cancel" : "Pension details"}
        </button>
      </div>

      {editing && (
        <div className="space-y-3 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium">Pension administrator (PFA)</span>
              <input
                value={form.providerName}
                onChange={(e) => setForm({ ...form, providerName: e.target.value })}
                placeholder="FCMB Pensions Ltd"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Employer share</span>
              <div className="mt-1 flex items-center gap-2">
                <input
                  value={form.employerMatchPercent}
                  onChange={(e) => setForm({ ...form, employerMatchPercent: e.target.value })}
                  inputMode="numeric"
                  className="w-24 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
                <span className="text-sm text-slate-500">% of what the employee pays</span>
              </div>
              <span className="mt-1 block text-xs text-slate-500">
                100 matches staff pound for pound. 125 is the statutory 10% employer against 8% employee.
              </span>
            </label>
            <label className="block">
              <span className="text-sm font-medium">Remittance bank</span>
              <input
                value={form.remittanceBankName}
                onChange={(e) => setForm({ ...form, remittanceBankName: e.target.value })}
                placeholder="United Bank for Africa"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Remittance account</span>
              <input
                value={form.remittanceAccountNumber}
                onChange={(e) => setForm({ ...form, remittanceAccountNumber: e.target.value })}
                placeholder="1005385514"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={save.isPending}
            className="rounded-full bg-brand-gradient px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {save.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      )}

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

      {problem && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {problem}
        </p>
      )}

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {errorMessage(error, "Couldn't load the pension schedule.")}
        </p>
      )}

      {data && (
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-lg font-bold uppercase">{data.schoolName}</p>
            <p className="text-sm font-semibold">{data.heading}</p>
            {data.remittance.map((line) => (
              <p key={line} className="text-sm text-slate-600 dark:text-slate-400">
                {line}
              </p>
            ))}
          </div>

          {/* A contribution the administrator cannot credit. Shown before the
              table because it must be fixed before filing, not noticed
              afterwards. */}
          {missing.length > 0 && (
            <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <p className="font-medium">
                {missing.length} {missing.length === 1 ? "person has" : "people have"} no RSA PIN on file
              </p>
              <p className="mt-0.5">
                {missing.map((row) => row.staffName).join(", ")} — the administrator cannot credit their
                contribution without it. Add it on the{" "}
                <Link href="/staff" className="underline">
                  staff record
                </Link>
                .
              </p>
            </div>
          )}

          {data.register.rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
              Nobody contributed to a pension in this run.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left dark:bg-slate-900">
                  <tr>
                    <th className="px-3 py-2 font-medium">S/N</th>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">PIN number</th>
                    <th className="px-3 py-2 text-right font-medium">Employer</th>
                    <th className="px-3 py-2 text-right font-medium">Employee</th>
                    <th className="px-3 py-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.register.rows.map((row) => (
                    <tr key={row.staffProfileId} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-3 py-2 text-slate-500">{row.serial}</td>
                      <td className="px-3 py-2">{row.staffName}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {row.pensionPin ?? (
                          <span className="font-sans text-amber-700 dark:text-amber-400">missing</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(row.employerCents)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(row.employeeCents)}</td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">{money(row.totalCents)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300 font-semibold dark:border-slate-700">
                    <td className="px-3 py-2" colSpan={3}>
                      Total to remit
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {money(data.register.employerTotalCents)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {money(data.register.employeeTotalCents)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(data.register.totalCents)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
