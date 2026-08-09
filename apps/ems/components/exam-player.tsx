"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api";
import {
  clock,
  marksLabel,
  toMarks,
  useMyAttempt,
  useSaveAnswer,
  useStartExam,
  useSubmitExam,
  type Paper,
  type StudentQuestion,
} from "@/lib/use-exams";

const CARD = "rounded-xl border border-slate-200 p-4 dark:border-slate-800";

/**
 * Sitting a paper.
 *
 * Three rules shape this component:
 *
 *  1. **Answers are saved as they are given**, one request per answer, so a
 *     dropped connection costs one question rather than a whole paper.
 *  2. **The countdown is advisory.** It is drawn from a number the server
 *     sent and counts down locally; the server decides what is actually in
 *     time. A clock that a student could change by editing their own machine
 *     must never be the one that matters.
 *  3. **Nothing is re-fetched mid-paper.** Re-rendering questions under
 *     someone's cursor while they are writing is its own kind of cruelty.
 */
export function ExamPlayer({ examId }: { examId: string }) {
  const start = useStartExam(examId);
  const save = useSaveAnswer(examId);
  const submit = useSubmitExam(examId);

  const [paper, setPaper] = useState<Paper | null>(null);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState<Record<string, "saving" | "saved" | "failed">>({});
  const [seconds, setSeconds] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const started = useRef(false);

  // The attempt is only loaded once the paper is handed in — while sitting,
  // the paper itself is the source of truth.
  const { data: attempt } = useMyAttempt(examId, { enabled: done || paper === null });

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    start
      .mutateAsync()
      .then((result) => {
        setPaper(result);
        setSeconds(result.remainingSeconds);
        setAnswers(
          Object.fromEntries(result.answers.map((answer) => [answer.examQuestionId, answer.response])),
        );
      })
      .catch((err) => {
        // A student who has already sat it, or whose paper has closed, lands
        // here — and is told which, in the server's own words.
        setError(err instanceof ApiError ? err.message : "Couldn't open this exam.");
      });
    // Deliberately once, on mount: `start` is a new object each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Extracted so the dependency is a plain boolean: the interval is created
  // once when the clock starts, not torn down and rebuilt every second.
  const clockRunning = seconds !== null && !done;

  useEffect(() => {
    if (!clockRunning) return;
    const timer = setInterval(() => setSeconds((current) => (current === null ? null : current - 1)), 1000);
    return () => clearInterval(timer);
  }, [clockRunning]);

  const handSubmit = useCallback(async () => {
    try {
      await submit.mutateAsync();
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't hand your paper in.");
    }
  }, [submit]);

  // When the local clock runs out, hand the paper in rather than leaving a
  // child staring at a dead screen wondering whether their work was kept.
  useEffect(() => {
    if (seconds !== null && seconds <= 0 && !done && paper) void handSubmit();
  }, [seconds, done, paper, handSubmit]);

  const record = (question: StudentQuestion, response: string[]) => {
    setAnswers((current) => ({ ...current, [question.id]: response }));
    setSaving((current) => ({ ...current, [question.id]: "saving" }));
    save
      .mutateAsync({ examQuestionId: question.id, response })
      .then(() => setSaving((current) => ({ ...current, [question.id]: "saved" })))
      .catch(() => setSaving((current) => ({ ...current, [question.id]: "failed" })));
  };

  // A student who has already sat this is not looking at an error — they came
  // back for their result. "You have already sat this exam" in red above a
  // perfectly good mark reads as something having gone wrong.
  if (attempt && attempt.status !== "IN_PROGRESS") {
    return (
      <div className="space-y-4">
        <ReleasedResult examId={examId} />
        <Link href="/exams" className="text-sm font-semibold text-brand-600 hover:underline">
          Back to exams
        </Link>
      </div>
    );
  }

  if (error && !paper) {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
        <Link href="/exams" className="text-sm font-semibold text-brand-600 hover:underline">
          Back to exams
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-4">
        <div className={CARD}>
          <h1 className="text-xl font-bold">Handed in</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Your paper is with your teacher. Your marks will appear here once they release them.
          </p>
        </div>
        <Link href="/exams" className="text-sm font-semibold text-brand-600 hover:underline">
          Back to exams
        </Link>
      </div>
    );
  }

  if (!paper) return <p className="text-sm text-slate-500">Opening your paper…</p>;

  const answered = paper.questions.filter((question) => (answers[question.id] ?? []).length > 0).length;

  return (
    <div className="space-y-5">
      <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div>
          <h1 className="text-lg font-bold tracking-tight">{paper.title}</h1>
          <p className="text-xs text-slate-500">
            {answered} of {paper.questions.length} answered · {toMarks(paper.totalMarksHundredths)} marks
          </p>
        </div>
        <div className="flex items-center gap-4">
          <p
            className={`tabular-nums text-lg font-bold ${
              (seconds ?? 0) < 60 ? "text-red-600 dark:text-red-400" : ""
            }`}
            // Announced politely, not assertively: a screen reader
            // interrupting every second would make the paper unsittable.
            aria-live="polite"
            aria-atomic="true"
          >
            {seconds === null ? "—" : clock(seconds)}
          </p>
          <button
            type="button"
            onClick={handSubmit}
            disabled={submit.isPending}
            className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {submit.isPending ? "Handing in…" : "Hand in"}
          </button>
        </div>
      </div>

      {paper.instructions && (
        <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm dark:bg-slate-900">{paper.instructions}</p>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <ol className="space-y-4">
        {paper.questions.map((question, index) => (
          <li key={question.id} className={CARD}>
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium">
                {index + 1}. {question.prompt}
              </p>
              <span className="shrink-0 text-xs text-slate-500">
                {marksLabel(question.marksHundredths)}
              </span>
            </div>

            <div className="mt-3">
              {(question.type === "SINGLE_CHOICE" || question.type === "TRUE_FALSE") && (
                <fieldset className="space-y-2">
                  <legend className="sr-only">Choose one answer</legend>
                  {question.options.map((option) => (
                    <label key={option.key} className="flex items-center gap-3 text-sm">
                      <input
                        type="radio"
                        name={question.id}
                        checked={(answers[question.id] ?? []).includes(option.key)}
                        onChange={() => record(question, [option.key])}
                        className="h-4 w-4"
                      />
                      <span>
                        {option.key}. {option.text}
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}

              {question.type === "MULTI_CHOICE" && (
                <fieldset className="space-y-2">
                  <legend className="text-xs text-slate-500">
                    Choose every correct answer — part marks are not given.
                  </legend>
                  {question.options.map((option) => (
                    <label key={option.key} className="flex items-center gap-3 text-sm">
                      <input
                        type="checkbox"
                        checked={(answers[question.id] ?? []).includes(option.key)}
                        onChange={(event) => {
                          const current = answers[question.id] ?? [];
                          record(
                            question,
                            event.target.checked
                              ? [...current, option.key]
                              : current.filter((key) => key !== option.key),
                          );
                        }}
                        className="h-4 w-4"
                      />
                      <span>
                        {option.key}. {option.text}
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}

              {(question.type === "SHORT_ANSWER" || question.type === "ESSAY") && (
                <label className="block">
                  <span className="sr-only">Your answer</span>
                  <textarea
                    rows={question.type === "ESSAY" ? 6 : 1}
                    defaultValue={(answers[question.id] ?? [""])[0]}
                    // Saved on blur rather than on every keystroke: a
                    // request per character would flood the connection an
                    // exam hall is least likely to have.
                    onBlur={(event) => record(question, [event.target.value])}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  />
                </label>
              )}
            </div>

            <p className="mt-2 h-4 text-xs text-slate-500" aria-live="polite">
              {saving[question.id] === "saving" && "Saving…"}
              {saving[question.id] === "saved" && "Saved"}
              {saving[question.id] === "failed" && (
                <span className="text-red-600 dark:text-red-400">
                  Not saved — check your connection and change it again.
                </span>
              )}
            </p>
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={handSubmit}
        disabled={submit.isPending}
        className="w-full rounded-lg bg-brand-gradient px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
      >
        {submit.isPending ? "Handing in…" : "Hand in my paper"}
      </button>
    </div>
  );
}

/** A student's own released result: their answers, their marks, no key. */
export function ReleasedResult({ examId }: { examId: string }) {
  const { data: attempt, isLoading, error } = useMyAttempt(examId);

  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (error || !attempt) {
    return (
      <p role="alert" className="text-sm text-red-600 dark:text-red-400">
        {error instanceof ApiError ? error.message : "Couldn't load your result."}
      </p>
    );
  }

  if (attempt.status !== "RELEASED") {
    return (
      <div className={CARD}>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          You handed this in. Your marks will appear once your teacher releases them.
        </p>
      </div>
    );
  }

  const marked = new Map(attempt.answers.map((answer) => [answer.examQuestionId, answer]));

  return (
    <div className="space-y-4">
      <div className={CARD}>
        <p className="text-2xl font-bold tabular-nums">
          {toMarks(attempt.totalScoreHundredths)} / {toMarks(attempt.totalMarksHundredths)}
        </p>
        {attempt.markedByName && (
          <p className="mt-1 text-xs text-slate-500">Marked by {attempt.markedByName}</p>
        )}
      </div>

      <ol className="space-y-3">
        {attempt.questions.map((question, index) => {
          const answer = marked.get(question.id);
          const chosen = answer?.response ?? [];
          return (
            <li key={question.id} className={CARD}>
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium">
                  {index + 1}. {question.prompt}
                </p>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {toMarks(answer?.awardedHundredths)} / {toMarks(question.marksHundredths)}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                You answered: {chosen.length > 0 ? chosen.join(", ") : "nothing"}
              </p>
              {answer?.feedback && (
                <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{answer.feedback}</p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
