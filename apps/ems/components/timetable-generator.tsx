"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { ApiError } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/i18n-provider";
import { useClasses } from "@/lib/use-classes";
import { useSubjects } from "@/lib/use-subjects";
import { useTeachers } from "@/lib/use-teachers";
import {
  formatMinute,
  parseMinute,
  useAssignments,
  useDeleteAssignment,
  useGenerateTimetable,
  useSaveSettings,
  useTimetableSettings,
  useUpsertAssignment,
  type DayPreview,
  type GenerationSummary,
} from "@/lib/use-timetable";

const INPUT =
  "mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900";
const SOLID =
  "rounded-full bg-brand-gradient px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50";
const OUTLINE =
  "rounded-full border border-slate-300 px-5 py-2 text-sm font-semibold transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800";

const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, String(value)), template);

/**
 * The school day, stated once.
 *
 * Typing eight period start and end times by hand is slower and is how a day
 * ends up with a gap nobody spots. The school says when it runs and how many
 * lessons it holds; the boundaries follow.
 */
export function SchoolHours() {
  const { t } = useTranslation();
  const { data: settings } = useTimetableSettings();
  const save = useSaveSettings();

  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [periodsPerDay, setPeriodsPerDay] = useState("");
  const [breakAfter, setBreakAfter] = useState("");
  const [breakLength, setBreakLength] = useState("");
  const [preview, setPreview] = useState<DayPreview | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!settings || start) return;
    setStart(formatMinute(settings.dayStartMinute));
    setEnd(formatMinute(settings.dayEndMinute));
    setPeriodsPerDay(String(settings.periodsPerDay));
    setBreakAfter(settings.breakAfterPeriod ? String(settings.breakAfterPeriod) : "");
    setBreakLength(String(settings.breakLengthMinutes));
  }, [settings, start]);

  const submit = async (applyToPeriods: boolean) => {
    setMessage(null);
    const dayStartMinute = parseMinute(start);
    const dayEndMinute = parseMinute(end);
    if (dayStartMinute === null || dayEndMinute === null) {
      setMessage({ tone: "error", text: t("timetable.badTime") });
      return;
    }

    try {
      const result = await save.mutateAsync({
        dayStartMinute,
        dayEndMinute,
        periodsPerDay: Number(periodsPerDay),
        ...(breakAfter ? { breakAfterPeriod: Number(breakAfter) } : {}),
        ...(breakLength ? { breakLengthMinutes: Number(breakLength) } : {}),
        applyToPeriods,
      });
      setPreview(result.preview);
      if (applyToPeriods) setMessage({ tone: "ok", text: t("timetable.dayApplied") });
    } catch (err) {
      // The API says exactly why — "8 periods and a 30-minute break do not
      // fit between 08:00 and 09:00" is far more use than a generic failure.
      setMessage({ tone: "error", text: err instanceof ApiError ? err.message : t("timetable.dayFailed") });
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
      <div>
        <h2 className="text-lg font-semibold">{t("timetable.settings")}</h2>
        <p className="text-sm text-slate-500">{t("timetable.settingsIntro")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-5">
        <label className="block text-sm font-medium">
          {t("timetable.dayStart")}
          <input value={start} onChange={(e) => setStart(e.target.value)} placeholder="08:00" className={INPUT} />
        </label>
        <label className="block text-sm font-medium">
          {t("timetable.dayEnd")}
          <input value={end} onChange={(e) => setEnd(e.target.value)} placeholder="14:00" className={INPUT} />
        </label>
        <label className="block text-sm font-medium">
          {t("timetable.periodsPerDay")}
          <input
            value={periodsPerDay}
            onChange={(e) => setPeriodsPerDay(e.target.value)}
            type="number"
            min={1}
            max={20}
            className={INPUT}
          />
        </label>
        <label className="block text-sm font-medium">
          {t("timetable.breakAfter")}
          <select value={breakAfter} onChange={(e) => setBreakAfter(e.target.value)} className={INPUT}>
            <option value="">{t("timetable.noBreak")}</option>
            {Array.from({ length: Number(periodsPerDay) || 0 }, (_, index) => index + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          {t("timetable.breakLength")}
          <input
            value={breakLength}
            onChange={(e) => setBreakLength(e.target.value)}
            type="number"
            min={0}
            max={240}
            disabled={!breakAfter}
            className={INPUT}
          />
        </label>
      </div>

      {preview && (
        <div className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-900/40">
          <p>
            {fill(t("timetable.dayPreview"), {
              count: preview.periods.filter((p) => p.isTeaching).length,
              length: preview.periodLengthMinutes,
            })}
            {/* Leftover minutes are shown rather than absorbed: silently
                stretching the last period is how a timetable stops matching
                the bell. */}
            {preview.leftoverMinutes > 0 && fill(t("timetable.leftover"), { n: preview.leftoverMinutes })}
          </p>
          <p className="mt-2 flex flex-wrap gap-1.5 text-xs">
            {preview.periods.map((period) => (
              <span
                key={period.label}
                className={clsx(
                  "rounded-full px-2 py-0.5",
                  period.isTeaching
                    ? "bg-slate-200 dark:bg-slate-800"
                    : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
                )}
              >
                {period.label} {formatMinute(period.startMinute)}–{formatMinute(period.endMinute)}
              </span>
            ))}
          </p>
        </div>
      )}

      {message && (
        <p className={message.tone === "ok" ? "text-sm text-emerald-600" : "text-sm text-red-600"}>
          {message.text}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => submit(false)} disabled={save.isPending} className={OUTLINE}>
          {t("timetable.previewDay")}
        </button>
        <button type="button" onClick={() => submit(true)} disabled={save.isPending} className={SOLID}>
          {t("timetable.applyDay")}
        </button>
        <span className="text-xs text-amber-600">{t("timetable.applyWarning")}</span>
      </div>
    </section>
  );
}

/**
 * What each class is taught, and the Generate button that turns it into a
 * week.
 */
export function TeachingPlan() {
  const { t } = useTranslation();
  const { data: assignments } = useAssignments();
  const { data: classes } = useClasses();
  const { data: subjects } = useSubjects();
  const { data: teachers } = useTeachers();

  const upsert = useUpsertAssignment();
  const remove = useDeleteAssignment();
  const generate = useGenerateTimetable();

  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [teacherUserId, setTeacherUserId] = useState("");
  const [periodsPerWeek, setPeriodsPerWeek] = useState("4");
  const [summary, setSummary] = useState<GenerationSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setError(null);
    try {
      await upsert.mutateAsync({
        classId,
        subjectId,
        ...(teacherUserId ? { teacherUserId } : {}),
        periodsPerWeek: Number(periodsPerWeek),
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("timetable.assignmentFailed"));
    }
  };

  const run = async (commit: boolean) => {
    setError(null);
    setSummary(null);
    try {
      setSummary(await generate.mutateAsync(commit));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("timetable.generateFailed"));
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
      <div>
        <h2 className="text-lg font-semibold">{t("timetable.assignments")}</h2>
        <p className="text-sm text-slate-500">{t("timetable.assignmentsIntro")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto_auto]">
        <select value={classId} onChange={(e) => setClassId(e.target.value)} aria-label={t("timetable.class")} className={INPUT}>
          <option value="">{t("timetable.class")}</option>
          {classes?.map((klass) => (
            <option key={klass.id} value={klass.id}>
              {klass.name}
            </option>
          ))}
        </select>
        <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} aria-label={t("timetable.subject")} className={INPUT}>
          <option value="">{t("timetable.subject")}</option>
          {subjects?.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </select>
        <select
          value={teacherUserId}
          onChange={(e) => setTeacherUserId(e.target.value)}
          aria-label={t("timetable.teacher")}
          className={INPUT}
        >
          <option value="">{t("timetable.unstaffed")}</option>
          {teachers?.map((teacher) => (
            <option key={teacher.id} value={teacher.id}>
              {teacher.firstName} {teacher.lastName}
            </option>
          ))}
        </select>
        <input
          value={periodsPerWeek}
          onChange={(e) => setPeriodsPerWeek(e.target.value)}
          type="number"
          min={1}
          max={40}
          aria-label={t("timetable.periodsPerWeek")}
          className={clsx(INPUT, "w-24")}
        />
        <button
          type="button"
          onClick={add}
          disabled={!classId || !subjectId || upsert.isPending}
          className={clsx(SOLID, "mt-1.5")}
        >
          {t("timetable.addAssignment")}
        </button>
      </div>

      {assignments?.length === 0 && <p className="text-sm text-slate-500">{t("timetable.noAssignments")}</p>}

      {(assignments?.length ?? 0) > 0 && (
        <ul className="space-y-1 text-sm">
          {assignments?.map((assignment) => (
            <li
              key={assignment.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-slate-200 py-1.5 dark:border-slate-800"
            >
              <span>
                <span className="font-medium">{assignment.class?.name}</span> · {assignment.subject?.name} ·{" "}
                {assignment.teacher
                  ? `${assignment.teacher.firstName} ${assignment.teacher.lastName}`
                  : t("timetable.unstaffed")}
              </span>
              <span className="flex items-center gap-3">
                <span className="tabular-nums text-slate-500">
                  {assignment.periodsPerWeek} {t("timetable.periodsPerWeek").toLowerCase()}
                </span>
                <button
                  type="button"
                  onClick={() => remove.mutate(assignment.id)}
                  className="text-xs text-red-600 hover:underline"
                >
                  {t("timetable.remove")}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-800">
        <p className="text-sm text-slate-500">{t("timetable.generateIntro")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => run(false)}
            disabled={generate.isPending || (assignments?.length ?? 0) === 0}
            className={OUTLINE}
          >
            {generate.isPending ? t("timetable.generating") : t("timetable.generatePreview")}
          </button>
          <button
            type="button"
            onClick={() => run(true)}
            disabled={generate.isPending || (assignments?.length ?? 0) === 0}
            className={SOLID}
          >
            {t("timetable.generate")}
          </button>
          {/* Said out loud, because it is not recoverable. */}
          <span className="text-xs text-amber-600">{t("timetable.generateWarning")}</span>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {summary && (
          <div className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-900/40">
            <p className={summary.committed ? "font-medium text-emerald-600" : "font-medium"}>
              {fill(summary.committed ? t("timetable.didPlace") : t("timetable.wouldPlace"), {
                n: summary.placed,
              })}
            </p>

            {summary.unplaced.length > 0 && (
              <div className="mt-2">
                {/* Named, so a head teacher knows what to change rather than
                    hunting for what went missing. */}
                <p className="font-medium text-amber-700 dark:text-amber-300">{t("timetable.couldNotFit")}</p>
                <ul className="mt-1 space-y-1">
                  {summary.unplaced.map((item) => (
                    <li key={item.assignmentId}>
                      <span className="font-medium">
                        {item.className} · {item.subjectName}
                      </span>{" "}
                      <span className="text-amber-700 dark:text-amber-300">
                        ({fill(t("timetable.short"), { n: item.shortfall })}) — {item.reason}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
