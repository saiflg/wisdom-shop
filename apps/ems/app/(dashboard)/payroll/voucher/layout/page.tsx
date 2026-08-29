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

/**
 * Where a school decides what its salary voucher looks like.
 *
 * Column order is the layout, so the editor is a list you move things up and
 * down in rather than a form — there is no other honest way to show that
 * "third from the left" is the whole meaning of a column's position.
 */

const STAFF_FIELDS: { value: StaffField; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "staffNumber", label: "Staff number" },
  { value: "bankName", label: "Bank" },
  { value: "accountNumber", label: "Account number" },
  { value: "jobTitle", label: "Designation" },
  { value: "qualification", label: "Qualification" },
  { value: "startDate", label: "Date of employment" },
  { value: "remark", label: "Remark" },
];

/** What the column will contain, in words a bursar would use. */
function describe(source: VoucherSource): string {
  switch (source.kind) {
    case "SERIAL":
      return "Row number";
    case "PAGE_TOTAL":
      return "Page subtotal";
    case "STAFF":
      return `Staff · ${STAFF_FIELDS.find((f) => f.value === source.field)?.label ?? source.field}`;
    case "TOTAL":
      return source.of === "GROSS" ? "Gross pay" : source.of === "NET" ? "Net pay" : "Total deductions";
    case "COMPONENT":
      return `Pay item · ${source.label}`;
  }
}

/** Money columns are end-aligned and summed; the rest are text. */
function isMoney(source: VoucherSource): boolean {
  return source.kind === "TOTAL" || source.kind === "COMPONENT" || source.kind === "PAGE_TOTAL";
}

type NewKind = "COMPONENT" | "STAFF" | "TOTAL" | "SERIAL" | "PAGE_TOTAL";

export default function VoucherLayoutPage() {
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
        setProblem("Give the pay item a name — it must match the name on the salary, e.g. Pension.");
        return;
      }
      source = { kind: "COMPONENT", label };
    } else if (newKind === "STAFF") {
      source = { kind: "STAFF", field: newField };
      label = label || STAFF_FIELDS.find((f) => f.value === newField)!.label;
    } else if (newKind === "TOTAL") {
      source = { kind: "TOTAL", of: newTotal };
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
      setProblem(errorMessage(err, "Couldn't save the layout."));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Voucher layout</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            Choose the columns on your salary voucher and the order they appear in. This changes the
            document only — never what anybody is paid.
          </p>
        </div>
        <Link
          href="/payroll/voucher"
          className="rounded-full border border-slate-300 px-4 py-1.5 text-sm transition hover:border-brand-400 dark:border-slate-700"
        >
          Back to the voucher
        </Link>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {errorMessage(error, "Couldn't load the layout.")}
        </p>
      )}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium">Title printed above the table</span>
              <input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setSaved(false);
                }}
                placeholder="GENERAL VOUCHER"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Rows before each subtotal</span>
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
                How many staff fit on one printed page.
              </span>
            </label>
          </div>

          <div className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Columns, left to right
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
                  aria-label={`Heading for column ${index + 1}`}
                  className="min-w-[10rem] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                />

                <span className="min-w-[11rem] text-xs text-slate-500">{describe(column.source)}</span>

                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${column.label} left`}
                    className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-30 dark:border-slate-700"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === columns.length - 1}
                    aria-label={`Move ${column.label} right`}
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
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2 rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
            <h2 className="text-sm font-semibold">Add a column</h2>
            <div className="flex flex-wrap items-end gap-2">
              <label className="block">
                <span className="text-xs text-slate-500">What it shows</span>
                <select
                  value={newKind}
                  onChange={(e) => setNewKind(e.target.value as NewKind)}
                  className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="COMPONENT">A pay item (allowance or deduction)</option>
                  <option value="STAFF">Something about the person</option>
                  <option value="TOTAL">A total</option>
                  <option value="SERIAL">Row number</option>
                  <option value="PAGE_TOTAL">Page subtotal</option>
                </select>
              </label>

              {newKind === "COMPONENT" && (
                <label className="block">
                  <span className="text-xs text-slate-500">Name on the salary</span>
                  <input
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="Pension"
                    className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                  />
                </label>
              )}

              {newKind === "STAFF" && (
                <label className="block">
                  <span className="text-xs text-slate-500">Which detail</span>
                  <select
                    value={newField}
                    onChange={(e) => setNewField(e.target.value as StaffField)}
                    className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                  >
                    {STAFF_FIELDS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {newKind === "TOTAL" && (
                <label className="block">
                  <span className="text-xs text-slate-500">Which total</span>
                  <select
                    value={newTotal}
                    onChange={(e) => setNewTotal(e.target.value as "GROSS" | "DEDUCTIONS" | "NET")}
                    className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                  >
                    <option value="NET">Net pay</option>
                    <option value="GROSS">Gross pay</option>
                    <option value="DEDUCTIONS">Total deductions</option>
                  </select>
                </label>
              )}

              <button
                type="button"
                onClick={addColumn}
                className="rounded-full border border-slate-300 px-4 py-1.5 text-sm dark:border-slate-700"
              >
                Add
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
              Saved. Every voucher from now on uses this layout.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={save.isPending}
              className="rounded-full bg-brand-gradient px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {save.isPending ? "Saving…" : "Save layout"}
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
              Undo my changes
            </button>
          </div>
        </>
      )}
    </div>
  );
}
