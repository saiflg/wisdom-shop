"use client";

import { useState } from "react";
import Link from "next/link";
import {
  clockTime,
  toMarks,
  usePortalHome,
  type PortalHomeworkItem,
} from "@/lib/use-portal";
import { PersonPhoto } from "@/components/person-photo";
import { ParentThread } from "@/components/parent-thread";
import { MyContactDetails } from "@/components/my-contact-details";
import { ReportAbsence } from "@/components/report-absence";
import { useAuthStore } from "@/store/auth-store";
import { useTranslation } from "@/lib/i18n/i18n-provider";
import { useMoney } from "@/lib/i18n/use-money";
import { formattingLocale } from "@/lib/i18n/formatting";

const CARD = "rounded-xl border border-slate-200 p-4 dark:border-slate-800";

export default function MyPage() {
  const money = useMoney();
  const { t, locale } = useTranslation();
  const [childId, setChildId] = useState<string | null>(null);
  const { data, isLoading, error } = usePortalHome(childId);
  const isGuardian = useAuthStore((state) => state.user?.roles.includes("GUARDIAN")) ?? false;

  if (isLoading) return <p className="text-sm text-slate-500">{t("common.loading")}</p>;
  if (error || !data) {
    return (
      <p role="alert" className="text-sm text-red-600 dark:text-red-400">
        Couldn&apos;t load your home page. Please try again, or ask the school office.
      </p>
    );
  }

  // Staff have the whole ERP and land on the dashboard; saying so plainly
  // beats showing them an empty page that looks broken.
  if (data.isStaff && data.children.length === 0) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold tracking-tight">{t("my.title")}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          This page is for students and parents. Your own overview is on the{" "}
          <Link href="/dashboard" className="font-semibold text-brand-600 hover:underline">
            dashboard
          </Link>
          .
        </p>
      </div>
    );
  }

  if (!data.child) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold tracking-tight">{t("my.title")}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {t("my.noStudentLinked")}
        </p>
      </div>
    );
  }

  const homework = data.homework;
  const dueNow = [...(homework?.overdue ?? []), ...(homework?.today ?? [])];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <PersonPhoto userId={data.child.userId} name={data.child.name} size="lg" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {data.children.length > 1 ? data.child.name : t("my.title")}
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {/* The class name is a link now: it is the way to the class
                  list and the class conversation, and a child looking for
                  their classmates looks for their class. */}
              {data.child.classId ? (
                <Link href={`/classes/${data.child.classId}`} className="font-medium text-brand-600 hover:underline">
                  {data.child.className}
                </Link>
              ) : (
                "Not in a class yet"
              )}
              {data.child.studentCode ? ` · ${data.child.studentCode}` : ""}
            </p>
          </div>
        </div>

        {/* Only shown to a family with more than one child — a switcher with
            one option is furniture. */}
        {data.children.length > 1 && (
          <label className="text-sm font-medium">
            <span className="sr-only">{t("my.chooseChild")}</span>
            <select
              value={data.child.studentProfileId}
              onChange={(event) => setChildId(event.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              {data.children.map((child) => (
                <option key={child.studentProfileId} value={child.studentProfileId}>
                  {child.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={CARD} aria-labelledby="today-heading">
          <h2 id="today-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Today&apos;s lessons
          </h2>
          {data.today.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">{t("my.nothingToday")}</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {data.today.map((lesson, index) => (
                <li key={`${lesson.period}-${index}`} className="flex items-baseline gap-3 text-sm">
                  <span className="w-14 shrink-0 tabular-nums text-slate-500">
                    {clockTime(lesson.startMinute)}
                  </span>
                  <span className="font-medium">{lesson.subject}</span>
                  {lesson.teacher && <span className="text-xs text-slate-500">{lesson.teacher}</span>}
                </li>
              ))}
            </ul>
          )}
          <Link href="/timetable" className="mt-3 inline-block text-xs font-semibold text-brand-600 hover:underline">
            {t("my.fullTimetable")}
          </Link>
        </section>

        <section className={CARD} aria-labelledby="homework-heading">
          <h2 id="homework-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {t("my.homeworkToDo")}
          </h2>
          {dueNow.length === 0 && (homework?.upcoming.length ?? 0) === 0 ? (
            <p className="mt-2 text-sm text-slate-500">{t("my.nothingOutstanding")}</p>
          ) : (
            <>
              {homework?.overdue.length ? (
                <HomeworkList label={t("my.overdue")} items={homework.overdue} tone="overdue" />
              ) : null}
              {homework?.today.length ? <HomeworkList label={t("my.dueToday")} items={homework.today} /> : null}
              {homework?.upcoming.length ? <HomeworkList label={t("my.comingUp")} items={homework.upcoming} /> : null}
              {homework?.noDeadline.length ? (
                <HomeworkList label={t("my.noDeadline")} items={homework.noDeadline} />
              ) : null}
            </>
          )}
          <Link href="/homework" className="mt-3 inline-block text-xs font-semibold text-brand-600 hover:underline">
            {t("my.allHomework")}
          </Link>
        </section>

        {/* Exams first among the new sections, and only when there are any:
            sitting a paper is time-critical in a way nothing else on this
            page is. An empty "no exams" card would push the things that do
            need attention further down for no reason. */}
        {(data.exams?.length ?? 0) > 0 && (
          <section className={CARD} aria-labelledby="exams-heading">
            <h2 id="exams-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {t("my.examsToSit")}
            </h2>
            <ul className="mt-2 space-y-2">
              {data.exams?.map((exam) => (
                <li key={exam.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <Link href={`/exams/${exam.id}`} className="font-medium text-brand-600 hover:underline">
                    {exam.title}
                  </Link>
                  {exam.subject && <span className="text-slate-500">{exam.subject}</span>}
                  {exam.open ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                      {exam.started ? "carry on" : "open now"}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500">
                      {exam.opensAt
                        ? t("my.opensAt", {
                            when: new Date(exam.opensAt).toLocaleString(formattingLocale(locale)),
                          })
                        : t("my.notOpenYet")}
                    </span>
                  )}
                  {exam.closesAt && exam.open && (
                    <span className="w-full text-xs text-slate-500">
                      {t("my.closesAt", {
                        when: new Date(exam.closesAt).toLocaleString(formattingLocale(locale)),
                      })}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Guardians only. A student's portal should not carry a channel
            their parent uses to raise concerns about them. */}
        {isGuardian && (
          <section className={`${CARD} lg:col-span-2`} aria-labelledby="school-messages-heading">
            <h2
              id="school-messages-heading"
              className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500"
            >
              {t("my.messageSchool")}
            </h2>
            <ParentThread studentProfileId={data.child.studentProfileId} />
          </section>
        )}

        {/* Guardians only. A child telling the school they will be away is
            not a message the school can act on. */}
        {isGuardian && (
          <ReportAbsence studentProfileId={data.child.studentProfileId} childName={data.child.name} />
        )}

        {/* Guardians only, for the same reason: a child has no business
            editing the number the school rings when they are taken ill. */}
        {isGuardian && <MyContactDetails />}

        <section className={CARD} aria-labelledby="results-heading">
          <h2 id="results-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {t("my.reportCards")}
          </h2>
          {(data.results?.length ?? 0) === 0 ? (
            // Says why rather than looking broken: a family whose school has
            // not published yet should know that is the reason.
            <p className="mt-2 text-sm text-slate-500">
              {t("my.nothingPublished")}
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {data.results?.map((result) => (
                <li key={result.id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span>
                    <span className="font-medium">{result.term}</span>
                    <span className="ms-1 text-slate-500">{result.academicYear}</span>
                    {result.className && <span className="ms-1 text-slate-500">· {result.className}</span>}
                  </span>
                  <span className="tabular-nums">
                    {(result.overallPercent / 100).toFixed(2)}%
                    {result.grade && <span className="ms-2 font-semibold">{result.grade}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/report-cards"
            className="mt-3 inline-block text-xs font-semibold text-brand-600 hover:underline"
          >
            {t("my.openReportCards")}
          </Link>
        </section>

        <section className={CARD} aria-labelledby="marks-heading">
          <h2 id="marks-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {t("my.recentMarks")}
          </h2>
          {(homework?.recentlyMarked.length ?? 0) === 0 ? (
            <p className="mt-2 text-sm text-slate-500">{t("my.noMarks")}</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {homework?.recentlyMarked.map((mark) => (
                <li key={mark.assignmentId} className="text-sm">
                  <span className="font-medium">{mark.title}</span>
                  <span className="ms-2 tabular-nums">
                    {toMarks(mark.scoreHundredths)} / {toMarks(mark.maxScoreHundredths)}
                  </span>
                  {mark.feedback && (
                    <span className="mt-0.5 block text-xs text-slate-500">{mark.feedback}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={CARD} aria-labelledby="school-heading">
          <h2 id="school-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {t("my.attendanceAndFees")}
          </h2>
          <dl className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">{t("my.attendance")}</dt>
              <dd className="tabular-nums">
                {/* Null, not 0% — "0% attendance" for a child with no
                    registers yet is a lie a parent would panic about. */}
                {data.attendance?.presentRate === null || data.attendance === null
                  ? t("my.notTakenYet")
                  : `${data.attendance.presentRate}%`}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">{t("my.feesOutstanding")}</dt>
              <dd className="tabular-nums">
                {data.fees ? money(data.fees.outstanding) : "—"}
              </dd>
            </div>
          </dl>
          <div className="mt-3 flex gap-3">
            <Link href="/attendance" className="text-xs font-semibold text-brand-600 hover:underline">
              {t("my.attendance")}
            </Link>
            <Link href="/invoices" className="text-xs font-semibold text-brand-600 hover:underline">
              {t("my.invoices")}
            </Link>
          </div>
        </section>
      </div>

      {data.lessons.length > 0 && (
        <section className={CARD} aria-labelledby="lessons-heading">
          <h2 id="lessons-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {t("my.wisdomLessons")}
          </h2>
          <ul className="mt-2 space-y-1.5">
            {data.lessons.map((lesson) => (
              <li key={lesson.id} className="flex items-center justify-between gap-3 text-sm">
                <Link href={`/ai-teacher/${lesson.id}`} className="min-w-0 truncate hover:underline">
                  {lesson.topic}
                  {lesson.subject ? <span className="ms-2 text-xs text-slate-500">{lesson.subject}</span> : null}
                  {lesson.askedAbout ? (
                    <span className="ms-2 text-xs text-slate-500">· asked about {lesson.askedAbout}</span>
                  ) : null}
                </Link>
                <span className="shrink-0 text-xs text-slate-500">
                  {lesson.status === "ENDED" ? "finished" : `${lesson.percent}%`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function HomeworkList({
  label,
  items,
  tone,
}: {
  label: string;
  items: PortalHomeworkItem[];
  tone?: "overdue";
}) {
  const { locale } = useTranslation();
  return (
    <div className="mt-2">
      <p
        className={
          tone === "overdue"
            ? "text-xs font-semibold uppercase tracking-wide text-red-600"
            : "text-xs font-semibold uppercase tracking-wide text-slate-500"
        }
      >
        {label}
      </p>
      <ul className="mt-1 space-y-1">
        {items.map((item) => (
          <li key={item.id} className="text-sm">
            <Link href="/homework" className="font-medium hover:underline">
              {item.title}
            </Link>
            {item.subject && <span className="ms-2 text-xs text-slate-500">{item.subject}</span>}
            {item.dueAt && (
              <span className="ms-2 text-xs text-slate-500">
                {new Date(item.dueAt).toLocaleDateString(formattingLocale(locale))}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
