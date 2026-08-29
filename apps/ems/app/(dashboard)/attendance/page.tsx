"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { ApiError } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/i18n-provider";
import type { TranslationKey } from "@/lib/i18n";
import { useClasses, useClass } from "@/lib/use-classes";
import {
  ATTENDANCE_STATUSES,
  useAmendAttendance,
  useClassRegisters,
  useTakeRegister,
  type AttendanceRecord,
  type AttendanceStatus,
} from "@/lib/use-attendance";

const STATUS_LABEL: Record<AttendanceStatus, TranslationKey> = {
  PRESENT: "attendance.present",
  ABSENT: "attendance.absent",
  LATE: "attendance.late",
  EXCUSED: "attendance.excused",
};

const STATUS_STYLE: Record<AttendanceStatus, string> = {
  PRESENT: "bg-emerald-600 text-white",
  ABSENT: "bg-red-600 text-white",
  LATE: "bg-amber-500 text-white",
  EXCUSED: "bg-slate-500 text-white",
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AttendancePage() {
  const { t } = useTranslation();
  const { data: classes } = useClasses();

  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(todayIso());
  const [session, setSession] = useState("");
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const { data: klass } = useClass(classId || null);
  const { data: registers } = useClassRegisters(classId || null);
  const takeRegister = useTakeRegister();

  const enrolledCount = useMemo(() => klass?.enrollments?.length ?? 0, [klass]);

  // Default everyone to present: in a real register most pupils are, so
  // this makes taking one a matter of flipping the exceptions.
  useEffect(() => {
    if (!klass?.enrollments) return;
    const next: Record<string, AttendanceStatus> = {};
    for (const enrollment of klass.enrollments) next[enrollment.studentProfile.id] = "PRESENT";
    setMarks(next);
  }, [klass]);

  const onSave = async () => {
    setMessage(null);
    const payload = Object.entries(marks).map(([studentProfileId, status]) => ({ studentProfileId, status }));
    if (payload.length === 0) return;
    try {
      await takeRegister.mutateAsync({
        classId,
        date,
        ...(session.trim() ? { session: session.trim() } : {}),
        marks: payload,
      });
      setMessage({ tone: "ok", text: t("attendance.saved") });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof ApiError ? err.message : t("attendance.saveFailed") });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("attendance.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">{t("attendance.intro")}</p>
      </div>

      <section className="grid gap-4 rounded-2xl border border-slate-200 p-5 sm:grid-cols-3 dark:border-slate-800">
        <div>
          <label htmlFor="classId" className="block text-sm font-medium">
            {t("attendance.chooseClass")}
          </label>
          <select
            id="classId"
            value={classId}
            onChange={(event) => setClassId(event.target.value)}
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="">—</option>
            {classes?.map((klass) => (
              <option key={klass.id} value={klass.id}>
                {klass.name} · {klass.academicYear}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="date" className="block text-sm font-medium">
            {t("attendance.date")}
          </label>
          <input
            id="date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
          />
        </div>
        <div>
          <label htmlFor="session" className="block text-sm font-medium">
            {t("attendance.session")}
          </label>
          <input
            id="session"
            value={session}
            onChange={(event) => setSession(event.target.value)}
            placeholder="Afternoon"
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
          />
          <p className="mt-1 text-xs text-slate-500">{t("attendance.sessionHint")}</p>
        </div>
      </section>

      {classId && enrolledCount === 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-400">{t("attendance.noStudents")}</p>
      )}

      {classId && klass?.enrollments && klass.enrollments.length > 0 && (
        <section className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{klass.name}</h2>
            <button
              type="button"
              onClick={() => {
                const next: Record<string, AttendanceStatus> = {};
                for (const e of klass.enrollments ?? []) next[e.studentProfile.id] = "PRESENT";
                setMarks(next);
              }}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
            >
              {t("attendance.markAll")}
            </button>
          </div>

          <ul className="space-y-2">
            {klass.enrollments.map((enrollment) => {
              const profileId = enrollment.studentProfile.id;
              const current = marks[profileId] ?? "PRESENT";
              return (
                <li
                  key={enrollment.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-2 dark:border-slate-800"
                >
                  <span className="text-sm">
                    {enrollment.studentProfile.user.firstName} {enrollment.studentProfile.user.lastName}
                  </span>
                  <div className="flex gap-1">
                    {ATTENDANCE_STATUSES.map((status) => (
                      <button
                        key={status}
                        type="button"
                        aria-pressed={current === status}
                        onClick={() => setMarks((prev) => ({ ...prev, [profileId]: status }))}
                        className={clsx(
                          "rounded-lg px-3 py-1 text-xs font-medium transition",
                          current === status
                            ? STATUS_STYLE[status]
                            : "border border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-900",
                        )}
                      >
                        {t(STATUS_LABEL[status])}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>

          {message && (
            <p
              role={message.tone === "error" ? "alert" : undefined}
              className={clsx(
                "mt-3 text-sm",
                message.tone === "error"
                  ? "rounded-lg bg-red-50 px-3 py-2 text-red-700 dark:bg-red-950/40 dark:text-red-400"
                  : "text-emerald-600 dark:text-emerald-400",
              )}
            >
              {message.text}
            </p>
          )}

          <button
            type="button"
            onClick={onSave}
            disabled={takeRegister.isPending}
            className="mt-4 rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {t("attendance.save")}
          </button>
        </section>
      )}

      {classId && (
        <section className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
          <h2 className="text-lg font-semibold">{t("attendance.history")}</h2>
          {!registers || registers.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{t("attendance.noHistory")}</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {registers.map((register) => (
                <li key={register.id} className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                  <p className="text-sm font-medium">
                    {new Date(register.date).toLocaleDateString()}
                    {register.session && ` · ${register.session}`}
                    {register.takenBy && (
                      <span className="ms-2 text-xs font-normal text-slate-500">
                        {t("attendance.takenBy")} {register.takenBy.firstName} {register.takenBy.lastName}
                      </span>
                    )}
                  </p>
                  <ul className="mt-2 space-y-1">
                    {register.records.map((record) => (
                      <RecordRow key={record.id} record={record} />
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function RecordRow({ record }: { record: AttendanceRecord }) {
  const { t } = useTranslation();
  const amend = useAmendAttendance(record.id);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<AttendanceStatus>(record.status);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const name = record.studentProfile
    ? `${record.studentProfile.user.firstName} ${record.studentProfile.user.lastName}`
    : record.studentProfileId;

  return (
    <li className="text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>{name}</span>
        <div className="flex items-center gap-2">
          <span className={clsx("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_STYLE[record.status])}>
            {t(STATUS_LABEL[record.status])}
          </span>
          {record.amendments.length > 0 && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              {t("attendance.amended")} ×{record.amendments.length}
            </span>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            {t("attendance.amend")}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-2 space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
          <div className="flex flex-wrap gap-1">
            {ATTENDANCE_STATUSES.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={status === option}
                onClick={() => setStatus(option)}
                className={clsx(
                  "rounded-lg px-3 py-1 text-xs font-medium transition",
                  status === option
                    ? STATUS_STYLE[option]
                    : "border border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-400",
                )}
              >
                {t(STATUS_LABEL[option])}
              </button>
            ))}
          </div>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t("attendance.amendReason")}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none dark:border-slate-700 dark:bg-slate-900"
          />
          <p className="text-xs text-slate-500">{t("attendance.amendHint")}</p>
          {error && (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <button
            type="button"
            disabled={amend.isPending || reason.trim().length < 3}
            onClick={async () => {
              setError(null);
              try {
                await amend.mutateAsync({ status, reason: reason.trim() });
                setReason("");
                setOpen(false);
              } catch (err) {
                setError(err instanceof ApiError ? err.message : t("attendance.amendFailed"));
              }
            }}
            className="rounded-lg bg-brand-gradient px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {t("attendance.amendSave")}
          </button>

          {record.amendments.length > 0 && (
            <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2 dark:border-slate-800">
              {record.amendments.map((amendment) => (
                <li key={amendment.id} className="text-xs text-slate-500">
                  {amendment.fromStatus} → {amendment.toStatus} · {amendment.reason} ·{" "}
                  {amendment.actorName}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}
