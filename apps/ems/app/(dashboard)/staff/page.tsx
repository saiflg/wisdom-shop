"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useStaff } from "@/lib/use-staff";
import { StaffInvite } from "@/components/staff-invite";
import { PersonPhoto } from "@/components/person-photo";
import {
  bankSummary,
  employmentState,
  employmentSummary,
  filterStaff,
  isTeaching,
  missingBankDetails,
  type StaffGroup,
} from "@/lib/staff-directory";
import { useTranslation } from "@/lib/i18n/i18n-provider";
import type { TranslationKey } from "@/lib/i18n";

// Keys, not labels. A label baked in at module scope is fixed in whatever
// language was active at import — which is none — so the filter would stay
// English while the rest of the page translated around it.
const GROUPS: { value: StaffGroup; key: TranslationKey }[] = [
  { value: "all", key: "staff.everyone" },
  { value: "teaching", key: "staff.teaching" },
  { value: "non-teaching", key: "staff.nonTeaching" },
];

const BADGE = "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold";

export default function StaffDirectoryPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const { data: staff, isLoading, error } = useStaff();

  // The nav has a separate "Non-teaching staff" entry, and it lands here with
  // the filter already applied rather than on a near-identical second page.
  const [group, setGroup] = useState<StaffGroup>(
    searchParams.get("group") === "non-teaching" ? "non-teaching" : "all",
  );
  const [query, setQuery] = useState("");

  const today = useMemo(() => new Date(), []);
  const visible = useMemo(() => filterStaff(staff ?? [], { query, group }), [staff, query, group]);
  const unpayable = useMemo(() => missingBankDetails(staff ?? [], today), [staff, today]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("staff.directory")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            {t("staff.intro")}
            an account is on file — the number itself lives behind a reason and a log entry.
          </p>
        </div>
        <Link
          href="/staff/new"
          className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          {t("staff.register")}
        </Link>
      </div>

      {staff && staff.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label={t("staff.countLabel")} value={String(staff.length)} />
          <Stat label={t("staff.teaching")} value={String(staff.filter(isTeaching).length)} />
          <Stat
            label={t("staff.noBankAccount")}
            value={String(unpayable.length)}
            tone={unpayable.length > 0 ? "warn" : "ok"}
            hint={unpayable.length > 0 ? t("staff.payrollWouldSkip") : t("staff.everyoneCanBePaid")}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-slate-200 p-1 dark:border-slate-800">
          {GROUPS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setGroup(option.value)}
              aria-pressed={group === option.value}
              className={
                group === option.value
                  ? "rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white"
                  : "rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-900"
              }
            >
              {t(option.key)}
            </button>
          ))}
        </div>

        <label className="min-w-[14rem] flex-1 text-sm">
          <span className="sr-only">{t("staff.search")}</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("staff.searchPlaceholder")}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
      </div>

      {isLoading && <p className="text-sm text-slate-500">{t("staff.loading")}</p>}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          Couldn&apos;t load the staff directory: {error.message}
        </p>
      )}

      {staff && staff.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
          {t("staff.noneYet")}
        </p>
      )}

      {staff && staff.length > 0 && visible.length === 0 && (
        <p className="text-sm text-slate-500">{t("staff.noMatch")}</p>
      )}

      <ul className="space-y-2">
        {visible.map((member) => {
          const state = employmentState(member, today);
          return (
            <li key={member.id}>
              <Link
                href={`/staff/${member.id}`}
                className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-4 transition hover:border-brand-400 dark:border-slate-800"
              >
                <PersonPhoto userId={member.id} name={`${member.firstName} ${member.lastName}`} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">
                      {member.firstName} {member.lastName}
                    </span>
                    {state === "ENDED" && (
                      <span className={`${BADGE} bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300`}>
                        left
                      </span>
                    )}
                    {state === "FUTURE" && (
                      <span className={`${BADGE} bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300`}>
                        not started
                      </span>
                    )}
                    {!isTeaching(member) && (
                      <span className={`${BADGE} bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300`}>
                        non-teaching
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">{employmentSummary(member)}</span>
                </span>
                <span
                  className={
                    member.bank.hasAccountNumber
                      ? "shrink-0 text-xs text-slate-500"
                      : "shrink-0 text-xs font-semibold text-amber-600 dark:text-amber-400"
                  }
                >
                  {bankSummary(member)}
                </span>
              </Link>

              {/* Outside the Link, not inside it: a button within an anchor is
                  a nested interactive element, which is ambiguous to a screen
                  reader and to a keyboard. Only shown for somebody who has
                  never signed in — the rest are reachable from their record. */}
              {!member.hasPassword && member.email && (
                <div className="mt-1 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                  <span>
                    <strong>{member.firstName}</strong> has never signed in.
                  </span>
                  <StaffInvite member={member} />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-slate-500">
        Looking for who has read someone&apos;s bank details? That is the{" "}
        <Link href="/staff/access-log" className="font-semibold text-brand-600 hover:underline">
          bank-detail access log
        </Link>
        .
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "ok",
  hint,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={
          tone === "warn"
            ? "mt-1 text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400"
            : "mt-1 text-2xl font-bold tabular-nums"
        }
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
