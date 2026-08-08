"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { ApiError } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/i18n-provider";
import { useClasses } from "@/lib/use-classes";
import { formatPercent, usePublishResults, useResults } from "@/lib/use-grading";
import { DataExchangeBar } from "@/components/data-exchange-bar";

const INPUT =
  "mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900";

export default function ResultsPage() {
  const { t } = useTranslation();
  const { data: classes } = useClasses();
  const publish = usePublishResults();

  const [classId, setClassId] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [term, setTerm] = useState("Term 1");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    const klass = classes?.find((c) => c.id === classId);
    if (klass && !academicYear) setAcademicYear(klass.academicYear);
  }, [classId, classes, academicYear]);

  const { data: results } = useResults(classId || null, academicYear, term);

  const run = async (unpublish: boolean) => {
    setMessage(null);
    try {
      const outcome = await publish.mutateAsync({ classId, academicYear, term, unpublish });
      setMessage({
        tone: "ok",
        text: unpublish
          ? `${t("grading.results.unpublished")}: ${outcome.unpublished ?? 0}`
          : `${t("grading.results.published")}: ${outcome.studentsPublished ?? 0}`,
      });
    } catch (err) {
      // Surfaces the API's own wording, which names exactly what is missing
      // or which subject's weights are wrong.
      setMessage({ tone: "error", text: err instanceof ApiError ? err.message : t("grading.results.publishFailed") });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("grading.results.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">{t("grading.results.intro")}</p>
      </div>

      <DataExchangeBar entity="results" />

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
        <section className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => run(false)}
              disabled={publish.isPending}
              className="rounded-full bg-brand-gradient px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {t("grading.results.publish")}
            </button>
            <button
              type="button"
              onClick={() => run(true)}
              disabled={publish.isPending}
              className="rounded-full border border-slate-300 px-5 py-2 text-sm font-semibold transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              {t("grading.results.unpublish")}
            </button>
            <p className="text-xs text-slate-500">{t("grading.results.publishHint")}</p>
          </div>
          {message && (
            <p className={message.tone === "ok" ? "mt-3 text-sm text-emerald-600" : "mt-3 text-sm text-red-600"}>
              {message.text}
            </p>
          )}
        </section>
      )}

      {results?.length === 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-400">{t("grading.results.none")}</p>
      )}

      <div className="space-y-3">
        {results?.map((result) => (
          <section key={result.id} className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">
                  {result.studentProfile?.user.firstName} {result.studentProfile?.user.lastName}
                </p>
                {result.publishedByName && result.status === "PUBLISHED" && (
                  <p className="text-xs text-slate-500">
                    {t("grading.results.publishedBy")} {result.publishedByName}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm text-slate-500">{t("grading.results.overall")}</p>
                  <p className="font-semibold tabular-nums">{formatPercent(result.overallPercentHundredths)}</p>
                </div>
                <span
                  className={clsx(
                    "rounded-full px-2.5 py-1 text-xs font-semibold",
                    result.status === "PUBLISHED" ? "bg-emerald-600 text-white" : "bg-slate-400 text-white",
                  )}
                >
                  {result.status === "PUBLISHED" ? t("grading.results.published") : t("grading.results.draft")}
                </span>
              </div>
            </div>

            <ul className="mt-3 space-y-1 text-sm">
              {result.subjects.map((subject) => (
                <li key={subject.id} className="flex justify-between border-b border-dashed border-slate-200 py-1 dark:border-slate-800">
                  <span>{subject.subject?.name}</span>
                  <span className="tabular-nums">
                    {formatPercent(subject.percentHundredths)}
                    <span className="ml-2 font-semibold">{subject.gradeLabel}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
