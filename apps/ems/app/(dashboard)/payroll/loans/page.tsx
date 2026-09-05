"use client";

import { useState } from "react";
import { errorMessage } from "@/lib/api";
import { useStaff } from "@/lib/use-staff";
import {
  useCloseLoan,
  useCreateLoan,
  useLoans,
  useRecordRepayment,
  type LoanRow,
  type LoanStatus,
} from "@/lib/use-loans";
import { useTranslation } from "@/lib/i18n/i18n-provider";
import type { TranslationKey } from "@/lib/i18n";

/**
 * Loans and salary advances.
 *
 * The register answers two questions a bursar asks every month: who still
 * owes the school money, and what will come off pay this time. Both are shown
 * before any of the editing controls, because reading this page is the common
 * case and adding a loan is the rare one.
 */

const STATUS_LABEL: Record<LoanStatus, TranslationKey> = {
  ACTIVE: "loans.statusACTIVE",
  SETTLED: "loans.statusSETTLED",
  WRITTEN_OFF: "loans.statusWRITTEN_OFF",
  CANCELLED: "loans.statusCANCELLED",
};

const STATUS_STYLE: Record<LoanStatus, string> = {
  ACTIVE: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  SETTLED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  WRITTEN_OFF: "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  CANCELLED: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

const money = (cents: number) =>
  (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Naira in, minor units out. Rejects anything that is not a clean amount. */
function toCents(value: string): number | null {
  const trimmed = value.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  return Math.round(Number(trimmed) * 100);
}

export default function LoansPage() {
  const { t, tPlural } = useTranslation();
  const [includeSettled, setIncludeSettled] = useState(false);
  const { data, isLoading, error } = useLoans(includeSettled);
  const { data: staff } = useStaff();
  const createLoan = useCreateLoan();
  const repay = useRecordRepayment();
  const closeLoan = useCloseLoan();

  const [showForm, setShowForm] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [repaying, setRepaying] = useState<LoanRow | null>(null);
  const [repayAmount, setRepayAmount] = useState("");

  const [form, setForm] = useState({
    staffProfileId: "",
    kind: "LOAN" as "LOAN" | "SALARY_ADVANCE",
    principal: "",
    instalment: "",
    note: "",
  });

  const submitLoan = async () => {
    setProblem(null);
    const principalCents = toCents(form.principal);
    const monthlyDeductionCents = form.instalment.trim() ? toCents(form.instalment) : 0;

    if (principalCents === null || principalCents <= 0) {
      setProblem(t("loans.enterPrincipal"));
      return;
    }
    if (monthlyDeductionCents === null) {
      setProblem(t("loans.enterInstalment"));
      return;
    }

    try {
      await createLoan.mutateAsync({
        staffProfileId: form.staffProfileId,
        kind: form.kind,
        principalCents,
        monthlyDeductionCents,
        note: form.note.trim() || undefined,
      });
      setForm({ staffProfileId: "", kind: "LOAN", principal: "", instalment: "", note: "" });
      setShowForm(false);
    } catch (err) {
      setProblem(errorMessage(err, t("loans.createFailed")));
    }
  };

  const submitRepayment = async () => {
    if (!repaying) return;
    setProblem(null);
    const amountCents = toCents(repayAmount);
    if (amountCents === null || amountCents <= 0) {
      setProblem(t("loans.enterRepayment"));
      return;
    }
    try {
      await repay.mutateAsync({ loanId: repaying.loanId, amountCents });
      setRepaying(null);
      setRepayAmount("");
    } catch (err) {
      setProblem(errorMessage(err, t("loans.repayFailed")));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("loans.title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            {t("loans.intro")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-full bg-brand-gradient px-4 py-1.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          {showForm ? t("common.cancel") : t("loans.newLoan")}
        </button>
      </div>

      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <p className="text-2xl font-bold tabular-nums">{data.totals.count}</p>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{t("loans.count")}</p>
          </div>
          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <p className="text-2xl font-bold tabular-nums">{money(data.totals.outstandingCents)}</p>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{t("loans.stillOwed")}</p>
          </div>
          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <p className="text-2xl font-bold tabular-nums">{money(data.totals.dueThisMonthCents)}</p>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{t("loans.dueThisMonth")}</p>
          </div>
          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <p className="text-2xl font-bold tabular-nums">{money(data.totals.repaidCents)}</p>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{t("loans.repaidToDate")}</p>
          </div>
        </div>
      )}

      {showForm && (
        <div className="space-y-3 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium">{t("loans.staffMember")}</span>
              <select
                value={form.staffProfileId}
                onChange={(e) => setForm({ ...form, staffProfileId: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="">{t("shared.choose")}</option>
                {/* Only people with an employment record can hold a loan, so
                    anyone without one is left out rather than offered and
                    then rejected on save. */}
                {(staff ?? [])
                  .filter((member) => member.staffProfileId)
                  .map((member) => (
                    <option key={member.id} value={member.staffProfileId ?? ""}>
                      {member.firstName} {member.lastName}
                    </option>
                  ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium">{t("loans.type")}</span>
              <select
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value as "LOAN" | "SALARY_ADVANCE" })}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="LOAN">{t("loans.kindLoan")}</option>
                <option value="SALARY_ADVANCE">{t("loans.kindAdvance")}</option>
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium">{t("loans.amountLent")}</span>
              <input
                value={form.principal}
                onChange={(e) => setForm({ ...form, principal: e.target.value })}
                inputMode="decimal"
                placeholder="50000"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium">{t("loans.deductMonthly")}</span>
              <input
                value={form.instalment}
                onChange={(e) => setForm({ ...form, instalment: e.target.value })}
                inputMode="decimal"
                placeholder="5000"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
              <span className="mt-1 block text-xs text-slate-500">
                {t("loans.instalmentHint")}
              </span>
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium">{t("loans.note")}</span>
            <input
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </label>

          <button
            type="button"
            onClick={() => void submitLoan()}
            disabled={!form.staffProfileId || createLoan.isPending}
            className="rounded-full bg-brand-gradient px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {createLoan.isPending ? t("loans.recording") : t("loans.recordLoan")}
          </button>
        </div>
      )}

      {problem && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {problem}
        </p>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={includeSettled}
          onChange={(e) => setIncludeSettled(e.target.checked)}
        />
        {t("loans.showSettled")}
      </label>

      {isLoading && <p className="text-sm text-slate-500">{t("common.loading")}</p>}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {errorMessage(error, t("loans.loadFailed"))}
        </p>
      )}

      {data && data.rows.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
          {t("loans.none")}
        </p>
      )}

      {data && data.rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-start dark:bg-slate-900">
              <tr>
                <th className="px-3 py-2 font-medium">{t("loans.colStaff")}</th>
                <th className="px-3 py-2 font-medium">{t("loans.colReference")}</th>
                <th className="px-3 py-2 text-end font-medium">{t("loans.colLent")}</th>
                <th className="px-3 py-2 text-end font-medium">{t("loans.colRepaid")}</th>
                <th className="px-3 py-2 text-end font-medium">{t("loans.colOutstanding")}</th>
                <th className="px-3 py-2 text-end font-medium">{t("loans.colMonthly")}</th>
                <th className="px-3 py-2 font-medium">{t("loans.colLeft")}</th>
                <th className="px-3 py-2 font-medium">{t("loans.colStatus")}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.loanId} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-2">
                    {row.staffName}
                    {row.kind === "SALARY_ADVANCE" && (
                      <span className="ms-2 text-xs text-slate-500">{t("loans.advanceTag")}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-500">{row.reference}</td>
                  <td className="px-3 py-2 text-end tabular-nums">{money(row.principalCents)}</td>
                  <td className="px-3 py-2 text-end tabular-nums">{money(row.repaidCents)}</td>
                  <td className="px-3 py-2 text-end font-medium tabular-nums">
                    {money(row.outstandingCents)}
                  </td>
                  <td className="px-3 py-2 text-end tabular-nums">
                    {row.monthlyDeductionCents > 0 ? money(row.monthlyDeductionCents) : "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-500">
                    {/* Null means it will never clear at this instalment — a
                        standing arrangement somebody should look at, not a
                        number to render as infinity. */}
                    {row.monthsRemaining === null
                      ? row.status === "ACTIVE"
                        ? t("loans.noSchedule")
                        : "—"
                      : row.monthsRemaining === 0
                        ? "—"
                        : tPlural("loans.monthsLeft", row.monthsRemaining)}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[row.status]}`}>
                      {t(STATUS_LABEL[row.status])}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-end">
                    {row.status === "ACTIVE" && (
                      <div className="flex justify-end gap-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setRepaying(row);
                            setRepayAmount(
                              row.monthlyDeductionCents > 0
                                ? String(Math.min(row.monthlyDeductionCents, row.outstandingCents) / 100)
                                : String(row.outstandingCents / 100),
                            );
                          }}
                          className="text-xs underline"
                        >
                          {t("loans.recordPayment")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (
                              !confirm(
                                t("loans.writeOffConfirm", {
                                  amount: money(row.outstandingCents),
                                  name: row.staffName,
                                }),
                              )
                            )
                              return;
                            closeLoan
                              .mutateAsync({ loanId: row.loanId, status: "WRITTEN_OFF" })
                              .catch((err) => setProblem(errorMessage(err, t("loans.closeFailed"))));
                          }}
                          className="text-xs text-slate-500 underline"
                        >
                          {t("loans.writeOff")}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {repaying && (
        <div className="space-y-3 rounded-2xl border border-brand-300 p-5 dark:border-brand-800">
          <p className="font-medium">
            {t("loans.recordPaymentFrom", { name: repaying.staffName })}
            <span className="ms-2 text-sm font-normal text-slate-500">
              {t("loans.amountOutstanding", { amount: money(repaying.outstandingCents) })}
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              value={repayAmount}
              onChange={(e) => setRepayAmount(e.target.value)}
              inputMode="decimal"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
            <button
              type="button"
              onClick={() => void submitRepayment()}
              disabled={repay.isPending}
              className="rounded-full bg-brand-gradient px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {repay.isPending ? t("shared.saving") : t("shared.save")}
            </button>
            <button
              type="button"
              onClick={() => setRepaying(null)}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm dark:border-slate-700"
            >
              {t("common.cancel")}
            </button>
          </div>
          <p className="text-xs text-slate-500">
            {t("loans.overpaymentHint")}
          </p>
        </div>
      )}
    </div>
  );
}
