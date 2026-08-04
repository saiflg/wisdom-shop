"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { ApiError } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/i18n-provider";
import type { TranslationKey } from "@/lib/i18n";
import { useClasses, useClass } from "@/lib/use-classes";
import { useSubjects } from "@/lib/use-subjects";
import {
  MARK_STATUSES,
  formatScore,
  parseScoreToHundredths,
  useAssessments,
  useCreateAssessment,
  useRecordMarks,
  type Assessment,
  type MarkStatus,
} from "@/lib/use-grading";

const INPUT =
  "mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900";

const statusKey = (status: MarkStatus) => `grading.status.${status}` as TranslationKey;

const STATUS_STYLE: Record<MarkStatus, string> = {
  RECORDED: "bg-emerald-600 text-white",
  ABSENT: "bg-red-600 text-white",
  EXCUSED: "bg-slate-500 text-white",
};

export default function AssessmentsPage() {
  const { t } = useTranslation();
  const { data: classes } = useClasses();
  const { data: subjects } = useSubjects();

  const [classId, setClassId] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [term, setTerm] = useState("Term 1");

  // Default the year from the chosen class rather than making the user retype
  // something the system already knows.
  useEffect(() => {
    const klass = classes?.find((c) => c.id === classId);
    if (klass && !academicYear) setAcademicYear(klass.academicYear);
  }, [classId, classes, academicYear]);

  const { data: assessments } = useAssessments(classId || null, academicYear, term);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("grading.assessments.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          {t("grading.assessments.intro")}
        </p>
      </div>

      <section className="grid gap-4 rounded-2xl border border-slate-200 p-5 sm:grid-cols-3 dark:border-slate-800">
        <div>
          <label htmlFor="classId" className="block text-sm font-medium">
            {t("grading.class")}
          </label>
          <select id="classId" value={classId} onChange={(e) => setClassId(e.target.value)} className={INPUT}>
            <option value="">—</option>
            {classes?.map((klass) => (
              <option key={klass.id} value={klass.id}>
                {klass.name} · {klass.academicYear}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="academicYear" className="block text-sm font-medium">
            {t("grading.academicYear")}
          </label>
          <input
            id="academicYear"
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
            placeholder="2026-2027"
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor="term" className="block text-sm font-medium">
            {t("grading.term")}
          </label>
          <input id="term" value={term} onChange={(e) => setTerm(e.target.value)} className={INPUT} />
        </div>
      </section>

      {classId && academicYear && term && (
        <>
          <NewAssessment classId={classId} academicYear={academicYear} term={term} subjects={subjects ?? []} />
          <WeightSummary assessments={assessments ?? []} />
          {assessments?.length === 0 && (
            <p className="text-sm text-slate-600 dark:text-slate-400">{t("grading.assessments.none")}</p>
          )}
          {assessments?.map((assessment) => (
            <MarkSheet key={assessment.id} assessment={assessment} classId={classId} />
          ))}
        </>
      )}
    </div>
  );
}

/** Surfaces the weights-must-total-100 rule before publication refuses it. */
function WeightSummary({ assessments }: { assessments: Assessment[] }) {
  const { t } = useTranslation();
  if (assessments.length === 0) return null;

  const bySubject = new Map<string, { name: string; total: number }>();
  for (const assessment of assessments) {
    const name = assessment.subject?.name ?? assessment.subjectId;
    const entry = bySubject.get(assessment.subjectId) ?? { name, total: 0 };
    entry.total += assessment.weightPercent;
    bySubject.set(assessment.subjectId, entry);
  }

  return (
    <section className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
      <p className="text-sm font-medium">{t("grading.assessments.weightTotal")}</p>
      <ul className="mt-2 space-y-1 text-sm">
        {[...bySubject.values()].map((entry) => (
          <li key={entry.name} className="flex justify-between">
            <span>{entry.name}</span>
            <span className={clsx("font-semibold tabular-nums", entry.total !== 100 && "text-amber-600")}>
              {entry.total}%
            </span>
          </li>
        ))}
      </ul>
      {[...bySubject.values()].some((entry) => entry.total !== 100) && (
        <p className="mt-2 text-xs text-amber-600">{t("grading.assessments.weightWarning")}</p>
      )}
    </section>
  );
}

function NewAssessment({
  classId,
  academicYear,
  term,
  subjects,
}: {
  classId: string;
  academicYear: string;
  term: string;
  subjects: { id: string; name: string }[];
}) {
  const { t } = useTranslation();
  const create = useCreateAssessment();
  const [subjectId, setSubjectId] = useState("");
  const [name, setName] = useState("");
  const [maxScore, setMaxScore] = useState("");
  const [weight, setWeight] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    const maxScoreHundredths = parseScoreToHundredths(maxScore);
    if (maxScoreHundredths === null || maxScoreHundredths === 0) {
      setMessage({ tone: "error", text: t("grading.assessments.badScore") });
      return;
    }
    try {
      await create.mutateAsync({
        subjectId,
        classId,
        name: name.trim(),
        academicYear,
        term,
        maxScoreHundredths,
        weightPercent: Number(weight),
      });
      setMessage({ tone: "ok", text: t("grading.assessments.created") });
      setName("");
      setMaxScore("");
      setWeight("");
    } catch (err) {
      setMessage({
        tone: "error",
        text: err instanceof ApiError ? err.message : t("grading.assessments.createFailed"),
      });
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
      <div className="grid gap-4 sm:grid-cols-4">
        <div>
          <label className="block text-sm font-medium">{t("grading.subject")}</label>
          <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} required className={INPUT}>
            <option value="">—</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">{t("grading.assessments.name")}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required className={INPUT} />
        </div>
        <div>
          <label className="block text-sm font-medium">{t("grading.assessments.maxScore")}</label>
          <input
            value={maxScore}
            onChange={(e) => setMaxScore(e.target.value)}
            inputMode="decimal"
            placeholder="20"
            required
            className={INPUT}
          />
        </div>
        <div>
          <label className="block text-sm font-medium">{t("grading.assessments.weight")}</label>
          <input
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            type="number"
            min={1}
            max={100}
            placeholder="40"
            required
            className={INPUT}
          />
        </div>
      </div>

      {message && (
        <p className={message.tone === "ok" ? "text-sm text-emerald-600" : "text-sm text-red-600"}>{message.text}</p>
      )}

      <button
        type="submit"
        disabled={create.isPending}
        className="rounded-full bg-brand-gradient px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {t("grading.assessments.create")}
      </button>
    </form>
  );
}

function MarkSheet({ assessment, classId }: { assessment: Assessment; classId: string }) {
  const { t } = useTranslation();
  const { data: klass } = useClass(classId);
  const recordMarks = useRecordMarks(assessment.id);

  const [scores, setScores] = useState<Record<string, string>>({});
  const [statuses, setStatuses] = useState<Record<string, MarkStatus>>({});
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  // Seed from whatever is already recorded, so opening a sheet mid-term shows
  // the existing marks rather than a blank grid inviting them to be retyped.
  useEffect(() => {
    const nextScores: Record<string, string> = {};
    const nextStatuses: Record<string, MarkStatus> = {};
    for (const mark of assessment.marks) {
      nextStatuses[mark.studentProfileId] = mark.status;
      if (mark.scoreHundredths !== null) nextScores[mark.studentProfileId] = formatScore(mark.scoreHundredths);
    }
    setScores(nextScores);
    setStatuses(nextStatuses);
  }, [assessment]);

  const onSave = async () => {
    setMessage(null);
    const payload: { studentProfileId: string; scoreHundredths?: number; status: MarkStatus }[] = [];

    for (const enrollment of klass?.enrollments ?? []) {
      const id = enrollment.studentProfile.id;
      const status = statuses[id] ?? "RECORDED";
      if (status === "RECORDED") {
        const raw = scores[id];
        if (!raw?.trim()) continue;
        const scoreHundredths = parseScoreToHundredths(raw);
        if (scoreHundredths === null) {
          setMessage({ tone: "error", text: t("grading.assessments.badScore") });
          return;
        }
        payload.push({ studentProfileId: id, scoreHundredths, status });
      } else {
        payload.push({ studentProfileId: id, status });
      }
    }

    if (payload.length === 0) return;

    try {
      await recordMarks.mutateAsync(payload);
      setMessage({ tone: "ok", text: t("grading.assessments.marksSaved") });
    } catch (err) {
      setMessage({
        tone: "error",
        text: err instanceof ApiError ? err.message : t("grading.assessments.marksFailed"),
      });
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">
          {assessment.subject?.name} · {assessment.name}
        </h2>
        <p className="text-sm text-slate-500">
          {t("grading.assessments.outOf")} {formatScore(assessment.maxScoreHundredths)} · {assessment.weightPercent}%
        </p>
      </div>

      <div className="mt-3 space-y-2">
        {(klass?.enrollments ?? []).map((enrollment) => {
          const id = enrollment.studentProfile.id;
          const status = statuses[id] ?? "RECORDED";
          return (
            <div key={id} className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-slate-200 py-2 dark:border-slate-800">
              <span className="text-sm">
                {enrollment.studentProfile.user.firstName} {enrollment.studentProfile.user.lastName}
              </span>
              <div className="flex items-center gap-2">
                <input
                  value={scores[id] ?? ""}
                  onChange={(e) => setScores((current) => ({ ...current, [id]: e.target.value }))}
                  disabled={status !== "RECORDED"}
                  inputMode="decimal"
                  placeholder="17.5"
                  aria-label={`${enrollment.studentProfile.user.firstName} ${t("grading.reportCard.score")}`}
                  className="w-24 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900"
                />
                {MARK_STATUSES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setStatuses((current) => ({ ...current, [id]: option }))}
                    className={clsx(
                      "rounded-full px-2.5 py-1 text-xs font-semibold transition",
                      status === option
                        ? STATUS_STYLE[option]
                        : "border border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-400",
                    )}
                  >
                    {t(statusKey(option))}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-xs text-slate-500">{t("grading.status.absentHint")}</p>

      {message && (
        <p className={message.tone === "ok" ? "mt-2 text-sm text-emerald-600" : "mt-2 text-sm text-red-600"}>
          {message.text}
        </p>
      )}

      <button
        type="button"
        onClick={onSave}
        disabled={recordMarks.isPending}
        className="mt-3 rounded-full bg-brand-gradient px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {t("grading.assessments.saveMarks")}
      </button>
    </section>
  );
}
