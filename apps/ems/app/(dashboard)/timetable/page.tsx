"use client";

import { useState } from "react";
import clsx from "clsx";
import { ApiError } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/i18n-provider";
import type { TranslationKey } from "@/lib/i18n";
import { useClasses } from "@/lib/use-classes";
import { useSubjects } from "@/lib/use-subjects";
import { useTeachers } from "@/lib/use-teachers";
import {
  WEEKDAYS,
  formatMinute,
  parseMinute,
  useClassTimetable,
  useDeleteEntry,
  usePeriods,
  useReplacePeriods,
  useUpsertEntry,
  type PeriodDraft,
  type TimetableEntry,
  type TimetablePeriod,
  type Weekday,
} from "@/lib/use-timetable";

const INPUT =
  "mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900";

const dayKey = (day: Weekday) => `timetable.${day}` as TranslationKey;

interface DraftPeriod {
  id?: string;
  label: string;
  start: string;
  end: string;
  isTeaching: boolean;
}

export default function TimetablePage() {
  const { t } = useTranslation();
  const { data: classes } = useClasses();
  const { data: periods } = usePeriods();
  const [classId, setClassId] = useState("");
  const { data: entries } = useClassTimetable(classId || null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("timetable.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">{t("timetable.intro")}</p>
      </div>

      <PeriodEditor periods={periods ?? []} />

      <section className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
        <label htmlFor="classId" className="block text-sm font-medium">
          {t("timetable.class")}
        </label>
        <select
          id="classId"
          value={classId}
          onChange={(event) => setClassId(event.target.value)}
          className={clsx(INPUT, "max-w-sm")}
        >
          <option value="">—</option>
          {classes?.map((klass) => (
            <option key={klass.id} value={klass.id}>
              {klass.name} · {klass.academicYear}
            </option>
          ))}
        </select>
      </section>

      {(periods?.length ?? 0) === 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-400">{t("timetable.noPeriods")}</p>
      )}

      {classId && (periods?.length ?? 0) > 0 && (
        <WeekGrid classId={classId} periods={periods ?? []} entries={entries ?? []} />
      )}
    </div>
  );
}

/**
 * The whole day is edited and saved together, because "no two periods
 * overlap" is a property of the set rather than of any one row.
 */
function PeriodEditor({ periods }: { periods: TimetablePeriod[] }) {
  const { t } = useTranslation();
  const replace = useReplacePeriods();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DraftPeriod[]>([]);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const start = () => {
    setDraft(
      periods.map((period) => ({
        id: period.id,
        label: period.label,
        start: formatMinute(period.startMinute),
        end: formatMinute(period.endMinute),
        isTeaching: period.isTeaching,
      })),
    );
    setMessage(null);
    setOpen(true);
  };

  const save = async () => {
    setMessage(null);
    const payload: PeriodDraft[] = [];
    for (const row of draft) {
      const startMinute = parseMinute(row.start);
      const endMinute = parseMinute(row.end);
      if (startMinute === null || endMinute === null) {
        setMessage({ tone: "error", text: t("timetable.badTime") });
        return;
      }
      payload.push({
        ...(row.id ? { id: row.id } : {}),
        label: row.label.trim(),
        startMinute,
        endMinute,
        isTeaching: row.isTeaching,
      });
    }

    try {
      await replace.mutateAsync(payload);
      setMessage({ tone: "ok", text: t("timetable.periodsSaved") });
      setOpen(false);
    } catch (err) {
      // The API names which two periods overlap, which is more use than a
      // generic failure.
      setMessage({ tone: "error", text: err instanceof ApiError ? err.message : t("timetable.periodsFailed") });
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{t("timetable.periods")}</h2>
          <p className="text-sm text-slate-500">{t("timetable.periodsIntro")}</p>
        </div>
        {!open && (
          <button
            type="button"
            onClick={start}
            className="rounded-full border border-slate-300 px-4 py-1.5 text-sm font-semibold transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            {periods.length > 0 ? t("timetable.editPeriods") : t("timetable.addPeriod")}
          </button>
        )}
      </div>

      {!open && periods.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2 text-sm">
          {periods.map((period) => (
            <li
              key={period.id}
              className={clsx(
                "rounded-full px-3 py-1",
                period.isTeaching
                  ? "bg-slate-100 dark:bg-slate-800"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
              )}
            >
              {period.label} · {formatMinute(period.startMinute)}–{formatMinute(period.endMinute)}
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="mt-4 space-y-2">
          {draft.map((row, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto_auto]">
              <input
                value={row.label}
                onChange={(e) =>
                  setDraft((cur) => cur.map((r, i) => (i === index ? { ...r, label: e.target.value } : r)))
                }
                placeholder={t("timetable.periodLabel")}
                aria-label={t("timetable.periodLabel")}
                className={INPUT}
              />
              <input
                value={row.start}
                onChange={(e) =>
                  setDraft((cur) => cur.map((r, i) => (i === index ? { ...r, start: e.target.value } : r)))
                }
                placeholder="08:30"
                aria-label={t("timetable.start")}
                className={INPUT}
              />
              <input
                value={row.end}
                onChange={(e) =>
                  setDraft((cur) => cur.map((r, i) => (i === index ? { ...r, end: e.target.value } : r)))
                }
                placeholder="09:10"
                aria-label={t("timetable.end")}
                className={INPUT}
              />
              <label className="mt-1.5 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={row.isTeaching}
                  onChange={(e) =>
                    setDraft((cur) =>
                      cur.map((r, i) => (i === index ? { ...r, isTeaching: e.target.checked } : r)),
                    )
                  }
                />
                {t("timetable.teaching")}
              </label>
              <button
                type="button"
                onClick={() => setDraft((cur) => cur.filter((_, i) => i !== index))}
                className="mt-1.5 text-sm text-red-600 hover:underline"
              >
                {t("timetable.remove")}
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={() =>
              setDraft((cur) => [...cur, { label: "", start: "", end: "", isTeaching: true }])
            }
            className="text-sm font-medium text-brand-600 hover:underline"
          >
            + {t("timetable.addPeriod")}
          </button>

          {message && (
            <p className={message.tone === "ok" ? "text-sm text-emerald-600" : "text-sm text-red-600"}>
              {message.text}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={save}
              disabled={replace.isPending}
              className="rounded-full bg-brand-gradient px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {t("timetable.savePeriods")}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border border-slate-300 px-5 py-2 text-sm font-semibold dark:border-slate-700"
            >
              {t("timetable.cancel")}
            </button>
          </div>
        </div>
      )}

      {!open && message && message.tone === "ok" && (
        <p className="mt-2 text-sm text-emerald-600">{message.text}</p>
      )}
    </section>
  );
}

function WeekGrid({
  classId,
  periods,
  entries,
}: {
  classId: string;
  periods: TimetablePeriod[];
  entries: TimetableEntry[];
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<{ weekday: Weekday; period: TimetablePeriod } | null>(null);

  const find = (weekday: Weekday, periodId: string) =>
    entries.find((entry) => entry.weekday === weekday && entry.periodId === periodId);

  return (
    <section className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
      <table className="w-full min-w-[46rem] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left dark:border-slate-800">
            <th className="p-3 font-medium text-slate-500">{t("timetable.periods")}</th>
            {WEEKDAYS.map((day) => (
              <th key={day} className="p-3 font-medium">
                {t(dayKey(day))}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((period) => (
            <tr key={period.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
              <td className="p-3 align-top">
                <p className="font-medium">{period.label}</p>
                <p className="text-xs text-slate-500">
                  {formatMinute(period.startMinute)}–{formatMinute(period.endMinute)}
                </p>
              </td>

              {WEEKDAYS.map((day) => {
                // Break and lunch hold no lesson, so the grid doesn't offer one.
                if (!period.isTeaching) {
                  return (
                    <td key={day} className="bg-amber-50/60 p-3 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
                      {period.label}
                    </td>
                  );
                }

                const entry = find(day, period.id);
                return (
                  <td key={day} className="p-2 align-top">
                    <button
                      type="button"
                      onClick={() => setEditing({ weekday: day, period })}
                      className={clsx(
                        "w-full rounded-lg border p-2 text-left transition",
                        entry
                          ? "border-brand-300 bg-brand-50 hover:bg-brand-100 dark:border-brand-800 dark:bg-brand-900/30"
                          : "border-dashed border-slate-300 text-slate-400 hover:border-slate-400 dark:border-slate-700",
                      )}
                    >
                      {entry ? (
                        <>
                          <span className="block font-medium">{entry.subject?.name}</span>
                          <span className="block text-xs text-slate-500">
                            {entry.teacher
                              ? `${entry.teacher.firstName} ${entry.teacher.lastName}`
                              : t("timetable.unstaffed")}
                            {entry.room ? ` · ${entry.room}` : ""}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs">{t("timetable.free")}</span>
                      )}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {editing && (
        <SlotEditor
          classId={classId}
          weekday={editing.weekday}
          period={editing.period}
          entry={find(editing.weekday, editing.period.id)}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

function SlotEditor({
  classId,
  weekday,
  period,
  entry,
  onClose,
}: {
  classId: string;
  weekday: Weekday;
  period: TimetablePeriod;
  entry?: TimetableEntry;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { data: subjects } = useSubjects();
  const { data: teachers } = useTeachers();
  const upsert = useUpsertEntry();
  const remove = useDeleteEntry();

  const [subjectId, setSubjectId] = useState(entry?.subjectId ?? "");
  const [teacherUserId, setTeacherUserId] = useState(entry?.teacherUserId ?? "");
  const [room, setRoom] = useState(entry?.room ?? "");
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    try {
      await upsert.mutateAsync({
        ...(entry ? { id: entry.id } : {}),
        classId,
        subjectId,
        ...(teacherUserId ? { teacherUserId } : {}),
        weekday,
        periodId: period.id,
        ...(room.trim() ? { room: room.trim() } : {}),
      });
      onClose();
    } catch (err) {
      // The API's 409 names the class or teacher already in that slot, and
      // what they are doing — far more use than "conflict".
      setError(err instanceof ApiError ? err.message : t("timetable.saveFailed"));
    }
  };

  return (
    <div className="border-t border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900/40">
      <p className="text-sm font-semibold">
        {t(dayKey(weekday))} · {period.label} · {formatMinute(period.startMinute)}–
        {formatMinute(period.endMinute)}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-sm font-medium">{t("timetable.subject")}</label>
          <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className={INPUT}>
            <option value="">—</option>
            {subjects?.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">{t("timetable.teacher")}</label>
          <select value={teacherUserId} onChange={(e) => setTeacherUserId(e.target.value)} className={INPUT}>
            <option value="">{t("timetable.unstaffed")}</option>
            {teachers?.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.firstName} {teacher.lastName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">{t("timetable.room")}</label>
          <input value={room} onChange={(e) => setRoom(e.target.value)} className={INPUT} />
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!subjectId || upsert.isPending}
          className="rounded-full bg-brand-gradient px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {t("timetable.save")}
        </button>
        {entry && (
          <button
            type="button"
            onClick={async () => {
              await remove.mutateAsync(entry.id);
              onClose();
            }}
            className="rounded-full border border-red-300 px-5 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/30"
          >
            {t("timetable.remove")}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-slate-300 px-5 py-2 text-sm font-semibold dark:border-slate-700"
        >
          {t("timetable.cancel")}
        </button>
      </div>
    </div>
  );
}
