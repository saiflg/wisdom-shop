"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/i18n-provider";
import { useClasses } from "@/lib/use-classes";
import {
  formatMoney,
  parseMoneyToCents,
  useCreateStructure,
  useFeeStructures,
  useFinanceSettings,
  useGenerateInvoices,
  type FeeStructure,
} from "@/lib/use-fees";

const INPUT =
  "mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900";

interface DraftItem {
  label: string;
  /** Kept as the typed string, converted once on submit. Storing a number
   * here would mean parsing on every keystroke and fighting the caret. */
  amount: string;
}

export default function FeeStructuresPage() {
  const { t } = useTranslation();
  const { data: settings } = useFinanceSettings();
  const { data: structures, isLoading } = useFeeStructures();
  const { data: classes } = useClasses();
  const createStructure = useCreateStructure();

  const currency = settings?.currency ?? "NGN";

  const [name, setName] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [term, setTerm] = useState("");
  const [classId, setClassId] = useState("");
  const [items, setItems] = useState<DraftItem[]>([{ label: "", amount: "" }]);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const setItem = (index: number, patch: Partial<DraftItem>) =>
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  const draftTotal = items.reduce((sum, item) => sum + (parseMoneyToCents(item.amount) ?? 0), 0);

  const onCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);

    const filled = items.filter((item) => item.label.trim() && item.amount.trim());
    // Every amount is converted through the string parser, and a single bad
    // one stops the whole submission rather than being silently dropped.
    const parsed = filled.map((item) => ({ label: item.label.trim(), amountCents: parseMoneyToCents(item.amount) }));
    if (parsed.length === 0 || parsed.some((item) => item.amountCents === null)) {
      setMessage({ tone: "error", text: t("fees.structures.badAmount") });
      return;
    }

    try {
      await createStructure.mutateAsync({
        name: name.trim(),
        academicYear: academicYear.trim(),
        term: term.trim(),
        ...(classId ? { classId } : {}),
        items: parsed as { label: string; amountCents: number }[],
      });
      setMessage({ tone: "ok", text: t("fees.structures.created") });
      setName("");
      setTerm("");
      setItems([{ label: "", amount: "" }]);
    } catch (err) {
      setMessage({
        tone: "error",
        text: err instanceof ApiError ? err.message : t("fees.structures.createFailed"),
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("fees.structures.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">{t("fees.structures.intro")}</p>
      </div>

      <form onSubmit={onCreate} className="space-y-4 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium">
              {t("fees.structures.name")}
            </label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} required className={INPUT} />
          </div>
          <div>
            <label htmlFor="academicYear" className="block text-sm font-medium">
              {t("fees.structures.academicYear")}
            </label>
            <input
              id="academicYear"
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              placeholder="2026-2027"
              required
              className={INPUT}
            />
          </div>
          <div>
            <label htmlFor="term" className="block text-sm font-medium">
              {t("fees.structures.term")}
            </label>
            <input
              id="term"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Term 1"
              required
              className={INPUT}
            />
          </div>
          <div>
            <label htmlFor="classId" className="block text-sm font-medium">
              {t("fees.structures.class")}
            </label>
            <select id="classId" value={classId} onChange={(e) => setClassId(e.target.value)} className={INPUT}>
              <option value="">{t("fees.structures.schoolWide")}</option>
              {classes?.map((klass) => (
                <option key={klass.id} value={klass.id}>
                  {klass.name} · {klass.academicYear}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <p className="text-sm font-medium">{t("fees.structures.items")}</p>
          <p className="mt-0.5 text-xs text-slate-500">{t("fees.structures.amountHint")}</p>
          <div className="mt-2 space-y-2">
            {items.map((item, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[1fr,200px]">
                <input
                  value={item.label}
                  onChange={(e) => setItem(index, { label: e.target.value })}
                  placeholder={t("fees.structures.itemLabel")}
                  className={INPUT}
                  aria-label={t("fees.structures.itemLabel")}
                />
                <input
                  value={item.amount}
                  onChange={(e) => setItem(index, { amount: e.target.value })}
                  inputMode="decimal"
                  placeholder="25000.00"
                  className={INPUT}
                  aria-label={t("fees.structures.itemAmount")}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setItems((current) => [...current, { label: "", amount: "" }])}
              className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
            >
              + {t("fees.structures.addItem")}
            </button>
            <p className="text-sm font-semibold">
              {t("fees.structures.total")}: {formatMoney(draftTotal, currency)}
            </p>
          </div>
        </div>

        {message && (
          <p className={message.tone === "ok" ? "text-sm text-emerald-600" : "text-sm text-red-600"}>{message.text}</p>
        )}

        <button
          type="submit"
          disabled={createStructure.isPending}
          className="rounded-full bg-brand-gradient px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {t("fees.structures.create")}
        </button>
      </form>

      {isLoading && <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>}
      {structures?.length === 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-400">{t("fees.structures.none")}</p>
      )}

      <div className="space-y-4">
        {structures?.map((structure) => (
          <StructureCard key={structure.id} structure={structure} currency={currency} />
        ))}
      </div>
    </div>
  );
}

function StructureCard({ structure, currency }: { structure: FeeStructure; currency: string }) {
  const { t } = useTranslation();
  const generate = useGenerateInvoices(structure.id);
  const [dueDate, setDueDate] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const total = structure.items.reduce((sum, item) => sum + item.amountCents, 0);

  const onGenerate = async () => {
    setResult(null);
    setError(null);
    try {
      const outcome = await generate.mutateAsync({ ...(dueDate ? { dueDate } : {}) });
      // Reports both numbers: "0 raised, 12 already invoiced" is a useful,
      // reassuring answer, not a failure.
      setResult(
        `${t("fees.structures.generated")}: ${outcome.invoicesCreated} · ` +
          `${outcome.duplicatesSkipped} ${t("fees.structures.skipped")}`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("fees.structures.generateFailed"));
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{structure.name}</h2>
          <p className="text-sm text-slate-500">
            {structure.academicYear} · {structure.term} ·{" "}
            {structure.class ? structure.class.name : t("fees.structures.schoolWide")}
          </p>
        </div>
        <p className="text-lg font-semibold">{formatMoney(total, currency)}</p>
      </div>

      <ul className="mt-3 space-y-1 text-sm">
        {structure.items.map((item, index) => (
          <li key={item.id ?? index} className="flex justify-between border-b border-dashed border-slate-200 py-1 dark:border-slate-800">
            <span>{item.label}</span>
            <span className="tabular-nums">{formatMoney(item.amountCents, currency)}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-500">{t("fees.structures.dueDate")}</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </div>
        <button
          type="button"
          onClick={onGenerate}
          disabled={generate.isPending}
          className="rounded-full bg-brand-gradient px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {t("fees.structures.generate")}
        </button>
        <p className="text-xs text-slate-500">{t("fees.structures.generateHint")}</p>
      </div>

      {result && <p className="mt-2 text-sm text-emerald-600">{result}</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {structure._count && structure._count.invoices > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          {structure._count.invoices} {t("fees.structures.invoiceCount")}
        </p>
      )}
    </section>
  );
}
