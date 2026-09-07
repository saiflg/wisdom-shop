"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useBankAccessLog } from "@/lib/use-staff";
import { useTranslation } from "@/lib/i18n/i18n-provider";
import { formattingLocale } from "@/lib/i18n/formatting";

function when(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(formattingLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Who has read whose bank details, and why.
 *
 * The log is the reason the reveal is allowed to exist at all: an
 * administrator can read any account number in the school, so the control that
 * actually protects staff is that they cannot do it unobserved. Reading this
 * page is therefore something a head or a governor should be able to do
 * without asking anyone — hence its own screen rather than a panel folded away
 * inside a record.
 */
export default function BankAccessLogPage() {
  const { t, locale } = useTranslation();
  const { data: entries, isLoading, error } = useBankAccessLog();
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return entries ?? [];
    return (entries ?? []).filter((entry) =>
      [entry.staffName, entry.actorName, entry.reason].some((value) => value.toLowerCase().includes(needle)),
    );
  }, [entries, query]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/staff" className="text-sm font-semibold text-brand-600 hover:underline">
          ← Staff directory
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{t("accessLog.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          {t("accessLog.intro")}
        </p>
      </div>

      <label className="block max-w-md text-sm">
        <span className="sr-only">{t("accessLog.search")}</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("accessLog.searchPlaceholder")}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
      </label>

      {isLoading && <p className="text-sm text-slate-500">{t("accessLog.loading")}</p>}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          Couldn&apos;t load the access log: {error.message}
        </p>
      )}

      {entries && entries.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
          Nobody has read anyone&apos;s account number yet.
        </p>
      )}

      {entries && entries.length > 0 && visible.length === 0 && (
        <p className="text-sm text-slate-500">{t("accessLog.noMatch")}</p>
      )}

      {visible.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-start text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pe-4">{t("accessLog.when")}</th>
                <th className="py-2 pe-4">{t("accessLog.whose")}</th>
                <th className="py-2 pe-4">{t("accessLog.who")}</th>
                <th className="py-2">{t("accessLog.why")}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((entry) => (
                <tr key={entry.id} className="border-t border-slate-200 align-top dark:border-slate-800">
                  <td className="whitespace-nowrap py-2 pe-4 text-slate-500">{when(entry.createdAt, locale)}</td>
                  <td className="py-2 pe-4 font-medium">{entry.staffName}</td>
                  <td className="py-2 pe-4">{entry.actorName}</td>
                  <td className="py-2 text-slate-600 dark:text-slate-400">{entry.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-500">
        {t("accessLog.writeFirst")}
      </p>
    </div>
  );
}
