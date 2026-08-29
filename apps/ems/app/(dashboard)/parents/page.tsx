"use client";

import Link from "next/link";
import { errorMessage } from "@/lib/api";
import { useParentsOverview, type ParentAlert, type ParentAlertKind } from "@/lib/use-parents-overview";
import { useTranslation } from "@/lib/i18n/i18n-provider";
import type { TranslationKey } from "@/lib/i18n";

/**
 * The school office's morning view of its families.
 *
 * Every row is something somebody can do today. There is deliberately no
 * "engagement score", no trend line and no chart — a dashboard that reports
 * how things are going, rather than what to do about them, gets glanced at
 * once and never opened again.
 */

const TONE: Record<ParentAlertKind, { key: TranslationKey; dot: string; box: string }> = {
  AWAITING_REPLY: {
    key: "parents.alertAWAITING_REPLY",
    dot: "bg-amber-500",
    box: "border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20",
  },
  ABSENT: {
    key: "parents.alertABSENT",
    dot: "bg-red-500",
    box: "border-red-200 bg-red-50/60 dark:border-red-900/50 dark:bg-red-950/20",
  },
  UNPAID: {
    key: "parents.alertUNPAID",
    dot: "bg-sky-500",
    box: "border-slate-200 dark:border-slate-800",
  },
  UNREACHABLE: {
    key: "parents.alertUNREACHABLE",
    dot: "bg-slate-400",
    box: "border-slate-200 dark:border-slate-800",
  },
  NO_PORTAL_ACCESS: {
    key: "parents.alertNO_PORTAL_ACCESS",
    dot: "bg-slate-400",
    box: "border-slate-200 dark:border-slate-800",
  },
};

function Stat({ label, value, href }: { label: string; value: string; href?: string }) {
  const inner = (
    <>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{label}</p>
    </>
  );
  const className =
    "block rounded-xl border border-slate-200 p-4 transition dark:border-slate-800" +
    (href ? " hover:border-brand-400" : "");
  return href ? (
    <Link href={href} className={className}>
      {inner}
    </Link>
  ) : (
    <div className={className}>{inner}</div>
  );
}

function AlertRow({ alert }: { alert: ParentAlert }) {
  const { t } = useTranslation();
  const tone = TONE[alert.kind];
  const body = (
    <div className={`flex items-start gap-3 rounded-xl border p-4 transition ${tone.box}`}>
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{alert.headline}</p>
        <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">{alert.detail}</p>
      </div>
      <span className="shrink-0 text-xs text-slate-500">{t(tone.key)}</span>
    </div>
  );

  return alert.href ? (
    <Link href={alert.href} className="block hover:opacity-90">
      {body}
    </Link>
  ) : (
    body
  );
}

export default function ParentsDashboardPage() {
  const { t } = useTranslation();
  const { data, isLoading, error } = useParentsOverview();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("parents.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          {t("parents.intro")}
        </p>
      </div>

      {isLoading && <p className="text-sm text-slate-500">{t("common.loading")}</p>}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {errorMessage(error, "Couldn't load the family overview.")}
        </p>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Stat label={t("parents.familiesLabel")} value={String(data.familyCount)} href="/guardians" />
            <Stat label={t("parents.waitingReply")} value={String(data.awaitingReplyCount)} href="/parent-messages" />
            <Stat label={t("parents.absentToday")} value={String(data.absentTodayCount)} href="/attendance" />
            <Stat label={t("parents.unpaidInvoices")} value={String(data.unpaidCount)} href="/invoices" />
            <Stat
              label={t("parents.cannotBeReached")}
              value={String(data.unreachableCount + data.noPortalAccessCount)}
              href="/guardians"
            />
          </div>

          {/* One line per currency rather than a single total: a school taking
              fees in two currencies has two answers, and adding them makes a
              third that is true in neither. */}
          {data.outstandingTotals.length > 0 && (
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <p className="text-xs uppercase tracking-wide text-slate-500">{t("parents.outstandingFees")}</p>
              <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1">
                {data.outstandingTotals.map((total) => (
                  <p key={total.currency} className="text-lg font-semibold tabular-nums">
                    {total.currency} {(total.cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {t("parents.needsAttention")}
            </h2>

            {data.alerts.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
                {t("parents.nothingToChase")}
              </p>
            ) : (
              data.alerts.map((alert, i) => <AlertRow key={`${alert.kind}-${i}`} alert={alert} />)
            )}
          </div>
        </>
      )}
    </div>
  );
}
