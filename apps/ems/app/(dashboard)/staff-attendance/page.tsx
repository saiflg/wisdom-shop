"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { useIsSchoolAdmin } from "@/lib/use-can-author";
import { useAuthStore } from "@/store/auth-store";
import { useStaff } from "@/lib/use-staff";
import {
  STATUS_KEY,
  STATUS_STYLE,
  todayIso,
  useMarkStaffAttendance,
  useStaffAttendanceDay,
  useStaffAttendancePeriod,
  type StaffAttendanceDay,
  type StaffAttendanceStatus,
} from "@/lib/use-staff-attendance";
import { useTranslation } from "@/lib/i18n/i18n-provider";
import { formattingLocale } from "@/lib/i18n/formatting";

const STATUSES: StaffAttendanceStatus[] = ["PRESENT", "LATE", "ABSENT", "ON_LEAVE"];

/**
 * Who was in, day by day.
 *
 * The thing this screen is careful about is leave. A head teacher running
 * down a list on Monday morning does not have everybody's approved leave in
 * their head, so pressing Absent against somebody the school itself signed
 * off records "on leave" instead — and says so, rather than quietly
 * substituting.
 */
export default function StaffAttendancePage() {
  const { t } = useTranslation();
  const isAdmin = useIsSchoolAdmin();
  const [date, setDate] = useState(todayIso());

  if (!isAdmin) return <MyRecord />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("staffAttendance.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          {t("staffAttendance.intro")}
        </p>
      </div>

      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {t("staffAttendance.day")}
        <input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case dark:border-slate-700 dark:bg-slate-900"
        />
      </label>

      <Register date={date} />
    </div>
  );
}

function Register({ date }: { date: string }) {
  const { t } = useTranslation();
  const { data: staff } = useStaff();
  const { data: marks } = useStaffAttendanceDay(date);

  const byUser = new Map((marks ?? []).map((mark) => [mark.userId, mark]));

  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t("staffAttendance.register")}</h2>
      {staff?.length === 0 && <p className="mt-2 text-sm text-slate-600">{t("staffAttendance.noStaff")}</p>}
      <ul className="mt-2 divide-y divide-slate-200 dark:divide-slate-800">
        {staff?.map((member) => (
          <StaffRow
            key={member.id}
            userId={member.id}
            name={`${member.firstName} ${member.lastName}`}
            date={date}
            mark={byUser.get(member.id) ?? null}
          />
        ))}
      </ul>
    </section>
  );
}

function StaffRow({
  userId,
  name,
  date,
  mark,
}: {
  userId: string;
  name: string;
  date: string;
  mark: StaffAttendanceDay | null;
}) {
  const { t, tPlural } = useTranslation();
  const record = useMarkStaffAttendance();
  const [note, setNote] = useState<string | null>(null);

  const press = async (status: StaffAttendanceStatus) => {
    setNote(null);
    try {
      const result = await record.mutateAsync({
        userId,
        date,
        status,
        // A late mark needs a number; 5 minutes is the smallest thing worth
        // recording and is edited afterwards if it was longer.
        minutesLate: status === "LATE" ? (mark?.minutesLate ?? 5) : undefined,
      });
      // Said out loud. Somebody who pressed Absent and got "on leave" needs
      // to know why, or they will press it again.
      if (result.adjusted) setNote(result.adjusted);
    } catch (err) {
      setNote(err instanceof ApiError ? err.message : t("staffAttendance.recordFailed"));
    }
  };

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{name}</p>
        {mark && (
          <p className="text-xs text-slate-500">
            {t(STATUS_KEY[mark.status])}
            {mark.minutesLate
              ? ` · ${tPlural("staffAttendance.minutesLate", mark.minutesLate)}`
              : ""}{" "}
            · {mark.recordedByName}
          </p>
        )}
        {note && <p className="text-xs text-amber-600">{note}</p>}
      </div>

      <div className="flex shrink-0 flex-wrap gap-1">
        {STATUSES.map((status) => {
          const active = mark?.status === status;
          return (
            <button
              key={status}
              type="button"
              onClick={() => press(status)}
              disabled={record.isPending}
              aria-pressed={active}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition disabled:opacity-50 ${
                active
                  ? STATUS_STYLE[status]
                  : "border border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-400"
              }`}
            >
              {t(STATUS_KEY[status])}
            </button>
          );
        })}
      </div>
    </li>
  );
}

/** A teacher reading their own record. Attendance feeds pay; they are entitled to it. */
function MyRecord() {
  const { t } = useTranslation();
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(todayIso());
  // The signed-in person's own id. The API scopes on it too, so this is a
  // convenience rather than the boundary.
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const { data } = useStaffAttendancePeriod(userId, from, to);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("staffAttendance.myTitle")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          {t("staffAttendance.myIntro")}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="text-xs text-slate-500">
          {t("staffAttendance.from")}
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        <label className="text-xs text-slate-500">
          {t("staffAttendance.to")}
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
      </div>

      {data && <PeriodSummary data={data} />}
    </div>
  );
}

function PeriodSummary({ data }: { data: NonNullable<ReturnType<typeof useStaffAttendancePeriod>["data"]> }) {
  const { t, locale, tPlural } = useTranslation();
  return (
    <>
      <section className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
        <div className="flex flex-wrap gap-8">
          <Stat label={t("staffAttendance.present")} value={data.summary.present} />
          <Stat label={t("staffAttendance.late")} value={data.summary.late} />
          <Stat label={t("staffAttendance.absent")} value={data.summary.absent} />
          <Stat label={t("staffAttendance.onLeave")} value={data.summary.onLeave} />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("staffAttendance.rate")}</p>
            {/* Null, not 0% or 100%: a period spent entirely on approved
                leave has no attendance rate, and inventing one puts a number
                no fact supports into a conversation about pay. */}
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {data.rate === null ? "—" : `${data.rate}%`}
            </p>
            {data.rate === null && <p className="text-xs text-slate-500">{t("staffAttendance.nobodyExpected")}</p>}
          </div>
        </div>
        {data.summary.minutesLate > 0 && (
          <p className="mt-4 text-xs text-slate-500">
            {tPlural("staffAttendance.totalMinutesLate", data.summary.minutesLate)}
          </p>
        )}
      </section>

      <ul className="divide-y divide-slate-200 dark:divide-slate-800">
        {data.days.map((day) => (
          <li key={day.id} className="flex items-center justify-between gap-3 py-2">
            <span className="text-sm">{new Date(day.date).toLocaleDateString(formattingLocale(locale))}</span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[day.status]}`}>
              {t(STATUS_KEY[day.status])}
              {day.minutesLate ? ` · ${tPlural("staffAttendance.minutesShort", day.minutesLate)}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
