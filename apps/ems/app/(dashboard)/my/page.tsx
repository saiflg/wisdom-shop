"use client";

import { useState } from "react";
import Link from "next/link";
import {
  clockTime,
  money,
  toMarks,
  usePortalHome,
  type PortalHomeworkItem,
} from "@/lib/use-portal";

const CARD = "rounded-xl border border-slate-200 p-4 dark:border-slate-800";

export default function MyPage() {
  const [childId, setChildId] = useState<string | null>(null);
  const { data, isLoading, error } = usePortalHome(childId);

  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
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
        <h1 className="text-2xl font-bold tracking-tight">My school</h1>
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
        <h1 className="text-2xl font-bold tracking-tight">My school</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          There is no student linked to your account yet. Ask the school office to link you.
        </p>
      </div>
    );
  }

  const homework = data.homework;
  const dueNow = [...(homework?.overdue ?? []), ...(homework?.today ?? [])];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {data.children.length > 1 ? data.child.name : "My school"}
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {data.child.className ?? "Not in a class yet"}
            {data.child.studentCode ? ` · ${data.child.studentCode}` : ""}
          </p>
        </div>

        {/* Only shown to a family with more than one child — a switcher with
            one option is furniture. */}
        {data.children.length > 1 && (
          <label className="text-sm font-medium">
            <span className="sr-only">Choose a child</span>
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
            <p className="mt-2 text-sm text-slate-500">Nothing timetabled today.</p>
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
            Full timetable
          </Link>
        </section>

        <section className={CARD} aria-labelledby="homework-heading">
          <h2 id="homework-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Homework to do
          </h2>
          {dueNow.length === 0 && (homework?.upcoming.length ?? 0) === 0 ? (
            <p className="mt-2 text-sm text-slate-500">Nothing outstanding. </p>
          ) : (
            <>
              {homework?.overdue.length ? (
                <HomeworkList label="Overdue" items={homework.overdue} tone="overdue" />
              ) : null}
              {homework?.today.length ? <HomeworkList label="Due today" items={homework.today} /> : null}
              {homework?.upcoming.length ? <HomeworkList label="Coming up" items={homework.upcoming} /> : null}
              {homework?.noDeadline.length ? (
                <HomeworkList label="No deadline" items={homework.noDeadline} />
              ) : null}
            </>
          )}
          <Link href="/homework" className="mt-3 inline-block text-xs font-semibold text-brand-600 hover:underline">
            All homework
          </Link>
        </section>

        <section className={CARD} aria-labelledby="marks-heading">
          <h2 id="marks-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Recent marks
          </h2>
          {(homework?.recentlyMarked.length ?? 0) === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No marks released yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {homework?.recentlyMarked.map((mark) => (
                <li key={mark.assignmentId} className="text-sm">
                  <span className="font-medium">{mark.title}</span>
                  <span className="ml-2 tabular-nums">
                    {toMarks(mark.scoreHundredths)} / {toMarks(mark.maxScoreHundredths)}
                  </span>
                  {mark.feedback && (
                    <span className="mt-0.5 block text-xs text-slate-500">{mark.feedback}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/report-cards"
            className="mt-3 inline-block text-xs font-semibold text-brand-600 hover:underline"
          >
            Report cards
          </Link>
        </section>

        <section className={CARD} aria-labelledby="school-heading">
          <h2 id="school-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Attendance and fees
          </h2>
          <dl className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Attendance</dt>
              <dd className="tabular-nums">
                {/* Null, not 0% — "0% attendance" for a child with no
                    registers yet is a lie a parent would panic about. */}
                {data.attendance?.presentRate === null || data.attendance === null
                  ? "Not taken yet"
                  : `${data.attendance.presentRate}%`}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Fees outstanding</dt>
              <dd className="tabular-nums">
                {data.fees ? money(data.fees.outstanding) : "—"}
              </dd>
            </div>
          </dl>
          <div className="mt-3 flex gap-3">
            <Link href="/attendance" className="text-xs font-semibold text-brand-600 hover:underline">
              Attendance
            </Link>
            <Link href="/invoices" className="text-xs font-semibold text-brand-600 hover:underline">
              Invoices
            </Link>
          </div>
        </section>
      </div>

      {data.lessons.length > 0 && (
        <section className={CARD} aria-labelledby="lessons-heading">
          <h2 id="lessons-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            My AI lessons
          </h2>
          <ul className="mt-2 space-y-1.5">
            {data.lessons.map((lesson) => (
              <li key={lesson.id} className="flex items-center justify-between gap-3 text-sm">
                <Link href={`/ai-teacher/${lesson.id}`} className="min-w-0 truncate hover:underline">
                  {lesson.topic}
                  {lesson.subject ? <span className="ml-2 text-xs text-slate-500">{lesson.subject}</span> : null}
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
            {item.subject && <span className="ml-2 text-xs text-slate-500">{item.subject}</span>}
            {item.dueAt && (
              <span className="ml-2 text-xs text-slate-500">
                {new Date(item.dueAt).toLocaleDateString()}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
