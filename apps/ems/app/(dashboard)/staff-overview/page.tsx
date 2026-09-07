"use client";

import { useState } from "react";
import { useIsSchoolAdmin } from "@/lib/use-can-author";
import { useStaff } from "@/lib/use-staff";
import { useAuthStore } from "@/store/auth-store";
import { formatDuration, useStaffOverview } from "@/lib/use-staff-overview";
import { useTranslation } from "@/lib/i18n/i18n-provider";
import type { TranslationKey } from "@/lib/i18n";
import { formattingLocale } from "@/lib/i18n/formatting";

/**
 * Where one member of staff stands.
 *
 * The same honesty rule as the student dashboard, applied where the cost of
 * getting it wrong is higher: these figures feed conversations about
 * somebody's job. A teacher with no timetable entered is not a teacher with
 * nothing to do, and "no allowance set" is a fact about the school rather
 * than about them.
 */
export default function StaffOverviewPage() {
  const { t } = useTranslation();
  const isAdmin = useIsSchoolAdmin();
  const me = useAuthStore((state) => state.user?.id ?? null);
  const { data: staff } = useStaff();
  const [chosen, setChosen] = useState<string | null>(null);

  // Anybody may read their own; only an administrator may read anyone else's,
  // so only an administrator gets the picker.
  const current = isAdmin ? (chosen ?? me) : me;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{isAdmin ? t("staffOverview.titleStaff") : t("staffOverview.titleMine")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          {t("staffOverview.intro")}
        </p>
      </div>

      {isAdmin && (
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t("staffOverview.memberOfStaff")}
          <select
            value={current ?? ""}
            onChange={(event) => setChosen(event.target.value || null)}
            className="mt-1 block w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case dark:border-slate-700 dark:bg-slate-900"
          >
            {staff?.map((member) => (
              <option key={member.id} value={member.id}>
                {member.firstName} {member.lastName}
              </option>
            ))}
          </select>
        </label>
      )}

      {current && <Overview userId={current} />}
    </div>
  );
}

function Overview({ userId }: { userId: string }) {
  const { t, locale } = useTranslation();
  const { data, isLoading } = useStaffOverview(userId);

  if (isLoading) return <p className="text-sm text-slate-600 dark:text-slate-400">{t("common.loading")}</p>;
  if (!data) return null;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-lg font-semibold">{data.staff.name}</p>
        <p className="text-xs text-slate-500">
          {[data.staff.jobTitle, data.staff.section].filter(Boolean).join(" · ") || "No job title recorded"}
          {data.staff.startDate && ` · since ${new Date(data.staff.startDate).toLocaleDateString(formattingLocale(locale))}`}
        </p>
      </div>

      {/* Prompts to do something, never a rating. A number combining these
          would become a score attached to somebody's employment without
          anybody having decided it should be. */}
      {data.flags.length > 0 && (
        <section className="rounded-2xl border border-amber-300 p-4 dark:border-amber-900">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
            {t("staffOverview.worthALook")}
          </p>
          <ul className="mt-2 space-y-1">
            {data.flags.map((flag) => (
              <li key={flag} className="text-sm text-amber-700 dark:text-amber-300">
                {flag}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label={t("staffOverview.attendance")}>
          {data.attendance.rate === null ? (
            <NotRecorded>{t("staffOverview.nobodyExpected")}</NotRecorded>
          ) : (
            <>
              <Big>{data.attendance.rate}%</Big>
              <Small>
                {data.attendance.attended} of {data.attendance.expected} days
              </Small>
            </>
          )}
        </Card>

        <Card label={t("staffOverview.leave")}>
          {data.leave.untracked ? (
            // A zero entitlement means the school is not tracking allowances,
            // not that this person has none left.
            <>
              <Big>{data.leave.takenDays}</Big>
              <Small>{t("staffOverview.daysTakenNoAllowance")}</Small>
            </>
          ) : (
            <>
              <Big tone={data.leave.remainingDays < 0 ? "bad" : undefined}>{data.leave.remainingDays}</Big>
              <Small>
                of {data.leave.entitlementDays} days left
                {data.leave.pendingDays > 0 && ` · ${data.leave.pendingDays} awaiting a decision`}
              </Small>
            </>
          )}
        </Card>

        <Card label={t("staffOverview.teaching")}>
          <Big>{data.load.periods}</Big>
          <Small>
            {data.load.minutesPerWeek === null
              ? "no timetable entered"
              : `${formatDuration(data.load.minutesPerWeek)} a week`}
          </Small>
        </Card>

        <Card label={t("staffOverview.classesAndSubjects")}>
          {/* Counted distinctly: three subjects with one class is one class,
              and saying "3" would double their apparent load. */}
          <Big>
            {data.load.classes} / {data.load.subjects}
          </Big>
          <Small>{t("staffOverview.classesSubjects")}</Small>
        </Card>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <Panel title={t("staffOverview.notesWaitingOnYou")}>
          {data.notes.mine === 0 ? (
            <p className="text-sm text-slate-500">{t("staffOverview.nothingToDo")}</p>
          ) : (
            <p className="text-sm">
              {data.notes.returned > 0 && (
                <span className="block text-amber-600">
                  {data.notes.returned} sent back to be fixed
                </span>
              )}
              {data.notes.draft > 0 && <span className="block">{data.notes.draft} still in draft</span>}
            </p>
          )}
        </Panel>

        <Panel title={t("staffOverview.waitingOnSomeoneElse")}>
          {/* Kept apart from the above: telling a teacher to chase a note
              they already submitted is telling them to chase themselves. */}
          {data.notes.theirs === 0 ? (
            <p className="text-sm text-slate-500">{t("staffOverview.nothingWaiting")}</p>
          ) : (
            <p className="text-sm">{data.notes.theirs} sent for vetting</p>
          )}
          <p className="mt-1 text-xs text-slate-500">{data.notes.approved} approved so far</p>
        </Panel>
      </section>
    </div>
  );
}

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Big({ children, tone }: { children: React.ReactNode; tone?: "bad" }) {
  return (
    <p className={`text-2xl font-bold tabular-nums ${tone === "bad" ? "text-red-600" : ""}`}>{children}</p>
  );
}

function Small({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-slate-500">{children}</p>;
}

/** Styled so it cannot be mistaken for a figure. */
function NotRecorded({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-sm italic text-slate-400">{children}</p>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}
