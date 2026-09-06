"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, errorMessage } from "@/lib/api";
import { authHeaders, useAuthQueryState } from "@/lib/api-auth";
import { useStudents } from "@/lib/use-students";
import { PdfButton } from "@/components/pdf-button";
import { useTranslation } from "@/lib/i18n/i18n-provider";

interface TranscriptTerm {
  academicYear: string;
  term: string;
  className: string | null;
  overall: string | null;
  subjectCount: number;
  publishedAt: string | null;
  subjects: { subjectName: string; percentHundredths: number; gradeLabel: string; gradePoint: number | null }[];
}

interface SubjectHistory {
  subjectName: string;
  entries: { academicYear: string; term: string; percent: string; gradeLabel: string }[];
  best: string | null;
  average: string | null;
}

interface Transcript {
  student: { name: string; studentCode: string | null; stillEnrolled: boolean };
  terms: TranscriptTerm[];
  years: string[];
  termsCounted: number;
  cumulativeAverage: string | null;
  gradePointAverage: string | null;
  bySubject: SubjectHistory[];
  notes: string[];
  issuedAt: string;
}

/**
 * A student's whole record, across years.
 *
 * Offered two ways round because two different people ask. A school leaver's
 * parent reads it term by term; a receiving school reads it subject by
 * subject and asks "how did they do at mathematics".
 */
export default function TranscriptsPage() {
  const { t, locale } = useTranslation();
  const { accessToken, enabled } = useAuthQueryState();
  const { data: students } = useStudents();

  const [studentProfileId, setStudent] = useState("");
  const [view, setView] = useState<"terms" | "subjects">("terms");

  const { data, isLoading, error } = useQuery({
    queryKey: ["transcript", studentProfileId],
    enabled: enabled && Boolean(studentProfileId),
    queryFn: () =>
      apiFetch<Transcript>(`/v1/grading/transcripts/${studentProfileId}`, {
        headers: authHeaders(accessToken),
      }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("transcripts.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          {t("transcripts.intro")}
        </p>
      </div>

      <label className="block max-w-md text-sm font-medium">
        {t("shared.student")}
        <select
          value={studentProfileId}
          onChange={(event) => setStudent(event.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="">{t("transcripts.chooseStudent")}</option>
          {(students ?? []).map((student) => (
            <option key={student.id} value={student.id}>
              {student.user.firstName} {student.user.lastName}
              {student.studentCode ? ` · ${student.studentCode}` : ""}
            </option>
          ))}
        </select>
      </label>

      {isLoading && studentProfileId && <p className="text-sm text-slate-500">{t("transcripts.gathering")}</p>}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {errorMessage(error, t("transcripts.buildFailed"))}
        </p>
      )}

      {data && (
        <>
          <div className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-lg font-bold">{data.student.name}</p>
                <p className="text-sm text-slate-500">
                  {data.student.studentCode ?? t("transcripts.noAdmissionNumber")}
                  {!data.student.stillEnrolled && " · has left the school"}
                </p>
              </div>
              <PdfButton
                label={t("transcripts.download")}
                path={`/v1/pdf/report-cards/${studentProfileId}`}
                filename={`transcript-${data.student.name.replace(/\s+/g, "-").toLowerCase()}.pdf`}
              />
            </div>

            <dl className="mt-4 grid gap-4 sm:grid-cols-4">
              <Figure label={t("transcripts.terms")} value={String(data.termsCounted)} />
              <Figure label={t("transcripts.years")} value={data.years.length ? data.years.join(", ") : "—"} />
              <Figure label={t("transcripts.cumulativeAverage")} value={data.cumulativeAverage ?? "—"} />
              {/* Absent rather than zero when the school's scale has no
                  points: an invented GPA is worse than none. */}
              <Figure label={t("transcripts.gpa")} value={data.gradePointAverage ?? t("transcripts.notUsed")} />
            </dl>

            {/* Said out loud: a transcript that silently omits a term looks
                complete and is not. */}
            {data.notes.length > 0 && (
              <ul className="mt-3 space-y-1">
                {data.notes.map((note) => (
                  <li
                    key={note}
                    className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                  >
                    {note}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {data.termsCounted === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
              {t("transcripts.nothingPublished")}
            </p>
          ) : (
            <>
              <div className="flex rounded-lg border border-slate-200 p-1 dark:border-slate-800">
                {(["terms", "subjects"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setView(option)}
                    aria-pressed={view === option}
                    className={
                      view === option
                        ? "rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white"
                        : "rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-900"
                    }
                  >
                    {option === "terms" ? t("transcripts.termByTerm") : t("transcripts.subjectBySubject")}
                  </button>
                ))}
              </div>

              {view === "terms" ? (
                <div className="space-y-3">
                  {data.terms.map((term) => (
                    <section
                      key={`${term.academicYear}-${term.term}`}
                      className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-semibold">
                          {term.academicYear} · {term.term}
                          {term.className && <span className="ms-2 font-normal text-slate-500">{term.className}</span>}
                        </p>
                        <p className="text-sm">
                          <span className="text-slate-500">{t("transcripts.overall")} </span>
                          <span className="font-semibold tabular-nums">{term.overall ?? "—"}</span>
                        </p>
                      </div>

                      <ul className="mt-2 space-y-1 text-sm">
                        {term.subjects.map((subject) => (
                          <li key={subject.subjectName} className="flex justify-between gap-3">
                            <span>{subject.subjectName}</span>
                            <span className="shrink-0 tabular-nums">
                              {(subject.percentHundredths / 100).toFixed(2)}%
                              <span className="ms-2 font-semibold">{subject.gradeLabel}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {data.bySubject.map((subject) => (
                    <section key={subject.subjectName} className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-semibold">{subject.subjectName}</p>
                        <p className="text-sm text-slate-500">
                          {t("transcripts.best")}{" "}
                          <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                            {subject.best}
                          </span>
                          {" · "}
                          {t("transcripts.average")}{" "}
                          <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-300">{subject.average}</span>
                        </p>
                      </div>
                      <ul className="mt-2 space-y-1 text-sm">
                        {subject.entries.map((entry) => (
                          <li key={`${entry.academicYear}-${entry.term}`} className="flex justify-between gap-3">
                            <span className="text-slate-500">
                              {entry.academicYear} · {entry.term}
                            </span>
                            <span className="shrink-0 tabular-nums">
                              {entry.percent}
                              <span className="ms-2 font-semibold">{entry.gradeLabel}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
            </>
          )}

          <p className="text-xs text-slate-500">
            {t("transcripts.producedAt", {
              when: new Date(data.issuedAt).toLocaleString(locale),
            })}
          </p>
        </>
      )}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
