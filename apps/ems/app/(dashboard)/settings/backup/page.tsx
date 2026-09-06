"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { authHeaders, useAuthQueryState } from "@/lib/api-auth";
import { useTranslation } from "@/lib/i18n/i18n-provider";
import type { TranslationKey } from "@/lib/i18n";

interface Coverage {
  included: string[];
  excluded: string[];
}

function useCoverage() {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: ["backup", "coverage"],
    enabled,
    queryFn: () => apiFetch<Coverage>("/v1/backup/coverage", { headers: authHeaders(accessToken) }),
  });
}

/**
 * A copy of the school's records, for the school to hold.
 *
 * This screen is careful about what it claims. It is not "back up the
 * school": it cannot see the server's own backups, cannot trigger one and
 * cannot restore anything. Those live on the machine and belong to whoever
 * administers it.
 *
 * What it can do is give a school its own records in a file it keeps
 * somewhere else — and say plainly what that file does not contain, because a
 * download called "backup" that quietly lacked the photographs is worse than
 * no download at all. Somebody would delete the originals.
 */
export default function BackupPage() {
  const { t } = useTranslation();
  const { data } = useCoverage();
  const accessToken = useAuthQueryState().accessToken;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const download = async () => {
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch("/v1/backup/download", {
        headers: authHeaders(accessToken) as HeadersInit,
      });
      if (!response.ok) throw new Error(t("backup.failed"));

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `school-records-${new Date().toISOString().slice(0, 10)}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
      setNote(t("errs.downloaded"));
    } catch (err) {
      setNote(err instanceof Error ? err.message : t("backup.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("backup.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          {t("backup.intro")}
        </p>
      </div>

      {/* Said before the button, not in a footnote after it. */}
      <section className="rounded-2xl border border-amber-300 p-4 dark:border-amber-900">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
          {t("backup.whatThisIsNot")}
        </p>
        <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
          {t("backup.notASystemBackup")}
        </p>
        <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
          {t("backup.readableCopy")}
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
        <button
          type="button"
          onClick={download}
          disabled={busy}
          className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? t("backup.preparing") : t("backup.download")}
        </button>
        {note && <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">{note}</p>}
      </section>

      {data && (
        <div className="grid gap-3 md:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("backup.inTheFile")}</p>
            <ul className="mt-2 space-y-1">
              {data.included.map((item) => (
                <li key={item} className="text-sm">
                  {item}
                </li>
              ))}
            </ul>
          </section>

          {/* As prominent as the list above it. */}
          <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("backup.notInTheFile")}</p>
            <ul className="mt-2 space-y-1">
              {data.excluded.map((item) => (
                <li key={item} className="text-sm text-slate-600 dark:text-slate-400">
                  {item}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
