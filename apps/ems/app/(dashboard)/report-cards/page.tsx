"use client";

import { useState } from "react";
import { useTranslation } from "@/lib/i18n/i18n-provider";
import { useStudents } from "@/lib/use-students";
import { PdfButton } from "@/components/pdf-button";
import { formatPercent, useReportCard } from "@/lib/use-grading";

const INPUT =
  "mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900";

export default function ReportCardsPage() {
  const { t } = useTranslation();
  const { data: students } = useStudents();

  const [studentProfileId, setStudentProfileId] = useState("");
  const [academicYear, setAcademicYear] = useState("2026-2027");
  const [term, setTerm] = useState("Term 1");

  const { data: card, isError } = useReportCard(studentProfileId || null, academicYear, term);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("grading.reportCard.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">{t("grading.reportCard.intro")}</p>
      </div>

      <section className="grid gap-4 rounded-2xl border border-slate-200 p-5 sm:grid-cols-3 dark:border-slate-800">
        <div>
          <label htmlFor="studentProfileId" className="block text-sm font-medium">
            {t("grading.student")}
          </label>
          <select
            id="studentProfileId"
            value={studentProfileId}
            onChange={(e) => setStudentProfileId(e.target.value)}
            className={INPUT}
          >
            <option value="">—</option>
            {students?.map((student) => (
              <option key={student.id} value={student.id}>
                {student.user.firstName} {student.user.lastName}
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

      {/* A missing card is a 404 by design — an unpublished result is not
          something a family may read, and staff see the draft instead. */}
      {studentProfileId && isError && (
        <p className="text-sm text-slate-600 dark:text-slate-400">{t("grading.reportCard.none")}</p>
      )}

      {card && (
        <section className="rounded-2xl border border-slate-200 p-6 dark:border-slate-800">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
            <div>
              <h2 className="text-xl font-bold">
                {card.studentProfile?.user.firstName} {card.studentProfile?.user.lastName}
              </h2>
              <p className="text-sm text-slate-500">
                {card.class?.name} · {card.academicYear} · {card.term}
              </p>
            </div>
            <div className="text-end">
              <p className="text-sm text-slate-500">{t("grading.results.overall")}</p>
              <p className="text-2xl font-bold tabular-nums">{formatPercent(card.overallPercentHundredths)}</p>
            </div>
          </div>

          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="text-start text-slate-500">
                <th className="pb-2 font-medium">{t("grading.subject")}</th>
                <th className="pb-2 text-end font-medium">{t("grading.reportCard.score")}</th>
                <th className="pb-2 text-end font-medium">{t("grading.results.grade")}</th>
                <th className="pb-2 text-end font-medium">{t("grading.reportCard.remark")}</th>
              </tr>
            </thead>
            <tbody>
              {card.subjects.map((subject) => (
                <tr key={subject.id} className="border-t border-slate-200 dark:border-slate-800">
                  <td className="py-2">{subject.subject?.name}</td>
                  <td className="py-2 text-end tabular-nums">{formatPercent(subject.percentHundredths)}</td>
                  <td className="py-2 text-end font-semibold">{subject.gradeLabel}</td>
                  <td className="py-2 text-end text-slate-500">{subject.gradeRemark ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {card.publishedByName && (
            <p className="mt-4 text-xs text-slate-500">
              {t("grading.results.publishedBy")} {card.publishedByName}
              {card.publishedAt && ` · ${new Date(card.publishedAt).toLocaleDateString()}`}
            </p>
          )}

          <div className="mt-4">
            <PdfButton
              variant="solid"
              label={t("pdf.reportCard")}
              path={`/v1/pdf/report-cards/${studentProfileId}?academicYear=${encodeURIComponent(
                academicYear,
              )}&term=${encodeURIComponent(term)}`}
              filename={`report-card-${term}.pdf`}
            />
          </div>
        </section>
      )}
    </div>
  );
}
