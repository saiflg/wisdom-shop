"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { errorMessage } from "@/lib/api";
import {
  useSaveVoucherSettings,
  useVoucherSettings,
  type StaffField,
  type VoucherColumn,
  type VoucherSource,
} from "@/lib/use-voucher";
import { useTranslation } from "@/lib/i18n/i18n-provider";
import type { TranslationKey } from "@/lib/i18n";

/**
 * Where a school decides what its salary voucher looks like.
 *
 * Column order is the layout, so the editor is a list you move things up and
 * down in rather than a form — there is no other honest way to show that
 * "third from the left" is the whole meaning of a column's position.
 */

const STAFF_FIELDS: { value: StaffField; key: TranslationKey }[] = [
  { value: "name", key: "voucherLayout.fieldName" },
  { value: "staffNumber", key: "voucherLayout.fieldStaffNumber" },
  { value: "bankName", key: "voucherLayout.fieldBank" },
  { value: "accountNumber", key: "voucherLayout.fieldAccountNumber" },
  { value: "jobTitle", key: "voucherLayout.fieldDesignation" },
  { value: "qualification", key: "voucherLayout.fieldQualification" },
  { value: "startDate", key: "voucherLayout.fieldStartDate" },
  { value: "remark", key: "voucherLayout.fieldRemark" },
];

/**
 * What the column will contain, in words a bursar would use.
 *
 * `t` is passed in rather than taken from a hook: this is a plain function,
 * not a component, and calling a hook here would break the rules of hooks.
 */
function describe(t: (key: TranslationKey, vars?: Record<string, string | number>) => string, source: VoucherSource): string {
  switch (source.kind) {
    case "SERIAL":
      return t("voucherLayout.rowNumber");
    case "PAGE_TOTAL":
      return t("voucherLayout.pageSubtotal");
    case "STAFF": {
      const field = STAFF_FIELDS.find((f) => f.value === source.field);
      return t("voucherLayout.staffPrefix", { field: field ? t(field.key) : source.field });
    }
    case "TOTAL":
      return t(
        source.of === "GROSS"
          ? "voucherLayout.grossPay"
          : source.of === "NET"
            ? "voucherLayout.netPay"
            : "voucherLayout.totalDeductions",
      );
    case "COMPONENT":
      return t("voucherLayout.payItemPrefix", { label: source.label });
  }
}

/** Money columns are end-aligned and summed; the rest are text. */
function isMoney(source: VoucherSource): boolean {
  return source.kind === "TOTAL" || source.kind === "COMPONENT" || source.kind === "PAGE_TOTAL";
}

type NewKind = "COMPONENT" | "STAFF" | "TOTAL" | "SERIAL" | "PAGE_TOTAL";

export default function VoucherLayoutPage() {
  const { t } = useTranslation();
  const { data, isLoading, error } = useVoucherSettings();
  const save = useSaveVoucherSettings();

  const [title, setTitle] = useState("");
  const [rowsPerPage, setRowsPerPage] = useState(16);
  const [columns, setColumns] = useState<VoucherColumn[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [newKind, setNewKind] = useState<NewKind>("COMPONENT");
  const [newLabel, setNewLabel] = useState("");
  const [newField, setNewField] = useState<StaffField>("name");
  const [newTotal, setNewTotal] = useState<"GROSS" | "DEDUCTIONS" | "NET">("NET");

  useEffect(() => {
    if (!data) return;
    setTitle(data.title);
    setRowsPerPage(data.rowsPerPage);
    setColumns(data.columns);
  }, [data]);

  const move = (index: number, by: number) => {
    setSaved(false);
    setColumns((current) => {
      const target = index + by;
      const a = current[index];
      const b = current[target];
      // Both reads are checked rather than asserted: an index arriving from a
      // stale render is exactly the case a non-null assertion would hide.
      if (!a || !b) return current;
      const next = [...current];
      next[index] = b;
      next[target] = a;
      return next;
    });
  };

  const addColumn = () => {
    setSaved(false);
    setProblem(null);

    let source: VoucherSource;
    let label = newLabel.trim();

    if (newKind === "COMPONENT") {
      if (!label) {
        setProblem(t("errs.payItemName"));
        return;
      }
      source = { kind: "COMPONENT", label };
    } else if (newKind === "STAFF") {
      source = { kind: "STAFF", field: newField };
      label = label || t(STAFF_FIELDS.find((f) => f.value === newField)!.key);
    } else if (newKind === "TOTAL") {
      source = { kind: "TOTAL", of: newTotal };
      // Default heading text, saved into the layout and printed on the
      // spreadsheet. A school edits these to its own wording, so they are
      // data rather than labels — the same call as the budget starter
      // categories and the result-template rows.
      label = label || (newTotal === "NET" ? "Net Salary" : newTotal === "GROSS" ? "Gross Salary" : "Total Deduction");
    } else if (newKind === "SERIAL") {
      source = { kind: "SERIAL" };
      label = label || "S/N";
    } else {
      source = { kind: "PAGE_TOTAL" };
      label = label || "Total";
    }

    // Keys must be unique and are never shown, so they are generated rather
    // than typed — one less thing for an admin to get wrong.
    const key = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    setColumns((current) => [...current, { key, label, source, money: isMoney(source) }]);
    setNewLabel("");
  };

  const onSave = async () => {
    setProblem(null);
    setSaved(false);
    try {
      await save.mutateAsync({ title, rowsPerPage, columns });
      setSaved(true);
    } catch (err) {
      // The API returns every problem at once; showing them all beats fixing
      // one per attempt.
      setProblem(errorMessage(err, t("errs.saveLayout")));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("voucherLayout.title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            {t("voucherLayout.intro")}
          </p>
        </div>
        <Link
          href="/payroll/voucher"
          className="rounded-full border border-slate-300 px-4 py-1.5 text-sm transition hover:border-brand-400 dark:border-slate-700"
        >
          {t("voucherLayout.back")}
        </Link>
      </div>

      {isLoading && <p className="text-sm text-slate-500">{t("common.loading")}</p>}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {errorMessage(error, t("errs.loadLayout"))}
        </p>
      )}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium">{t("voucherLayout.printedTitle")}</span>
              <input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setSaved(false);
                }}
                placeholder={t("voucherLayout.titlePlaceholder")}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">{t("voucherLayout.rowsBeforeSubtotal")}</span>
              <input
                type="number"
                min={1}
                max={500}
                value={rowsPerPage}
                onChange={(e) => {
                  setRowsPerPage(Number(e.target.value));
                  setSaved(false);
                }}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
              <span className="mt-1 block text-xs text-slate-500">
                {t("voucherLayout.rowsHint")}
              </span>
            </label>
          </div>

          <div className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {t("voucherLayout.columns")}
            </h2>

            {columns.map((column, index) => (
              <div
                key={column.key}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800"
              >
                <span className="w-6 text-center text-xs text-slate-400">{index + 1}</span>

                <input
                  value={column.label}
                  onChange={(e) => {
                    setSaved(false);
                    setColumns((current) =>
                      current.map((c, i) => (i === index ? { ...c, label: e.target.value } : c)),
                    );
                  }}
                  aria-label={t("voucher.columnHeading", { number: index + 1 })}
                  className="min-w-[10rem] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                />

                <span className="min-w-[11rem] text-xs text-slate-500">{describe(t, column.source)}</span>

                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={t("voucher.moveLeft", { label: column.label })}
                    className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-30 dark:border-slate-700"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === columns.length - 1}
                    aria-label={t("voucher.moveRight", { label: column.label })}
                    className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-30 dark:border-slate-700"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSaved(false);
                      setColumns((current) => current.filter((_, i) => i !== index));
                    }}
                    aria-label={`Remove ${column.label}`}
                    className="rounded border border-slate-300 px-2 py-1 text-xs text-red-700 dark:border-slate-700 dark:text-red-400"
                  >
                    {t("shared.remove")}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2 rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
            <h2 className="text-sm font-semibold">{t("voucherLayout.addColumn")}</h2>
            <div className="flex flex-wrap items-end gap-2">
              <label className="block">
                <span className="text-xs text-slate-500">{t("voucherLayout.whatItShows")}</span>
                <select
                  value={newKind}
                  onChange={(e) => setNewKind(e.target.value as NewKind)}
                  className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="COMPONENT">{t("voucherLayout.aPayItem")}</option>
                  <option value="STAFF">{t("voucherLayout.aboutPerson")}</option>
                  <option value="TOTAL">{t("voucherLayout.aTotal")}</option>
                  <option value="SERIAL">{t("voucherLayout.rowNumber")}</option>
                  <option value="PAGE_TOTAL">{t("voucherLayout.pageSubtotal")}</option>
                </select>
              </label>

              {newKind === "COMPONENT" && (
                <label className="block">
                  <span className="text-xs text-slate-500">{t("voucherLayout.nameOnSalary")}</span>
                  <input
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder={t("voucherLayout.componentPlaceholder")}
                    className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                  />
                </label>
              )}

              {newKind === "STAFF" && (
                <label className="block">
                  <span className="text-xs text-slate-500">{t("voucherLayout.whichDetail")}</span>
                  <select
                    value={newField}
                    onChange={(e) => setNewField(e.target.value as StaffField)}
                    className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                  >
                    {STAFF_FIELDS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {t(f.key)}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {newKind === "TOTAL" && (
                <label className="block">
                  <span className="text-xs text-slate-500">{t("voucherLayout.whichTotal")}</span>
                  <select
                    value={newTotal}
                    onChange={(e) => setNewTotal(e.target.value as "GROSS" | "DEDUCTIONS" | "NET")}
                    className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                  >
                    <option value="NET">{t("voucherLayout.netPay")}</option>
                    <option value="GROSS">{t("voucherLayout.grossPay")}</option>
                    <option value="DEDUCTIONS">{t("voucherLayout.totalDeductions")}</option>
                  </select>
                </label>
              )}

              <button
                type="button"
                onClick={addColumn}
                className="rounded-full border border-slate-300 px-4 py-1.5 text-sm dark:border-slate-700"
              >
                {t("voucher.addColumn")}
              </button>
            </div>
          </div>

          {problem && (
            <p role="alert" className="whitespace-pre-line rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
              {problem}
            </p>
          )}
          {saved && (
            <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
              {t("voucherLayout.saved")}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={save.isPending}
              className="rounded-full bg-brand-gradient px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {save.isPending ? t("shared.saving") : t("voucherLayout.save")}
            </button>
            <button
              type="button"
              onClick={() => {
                setTitle(data.title);
                setRowsPerPage(data.rowsPerPage);
                setColumns(data.columns);
                setProblem(null);
                setSaved(false);
              }}
              className="rounded-full border border-slate-300 px-5 py-2 text-sm dark:border-slate-700"
            >
              {t("voucherLayout.undo")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
