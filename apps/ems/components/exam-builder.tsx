"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import {
  QUESTION_TYPE_LABELS,
  marksLabel,
  toMarks,
  useAddExamQuestions,
  useCollectExpired,
  useExam,
  useMarkExamAnswer,
  useQuestionBank,
  useReleaseExam,
  useRemoveExamQuestion,
  useStaffAttempt,
  useUpdateExam,
} from "@/lib/use-exams";

const CARD = "rounded-xl border border-slate-200 p-4 dark:border-slate-800";

/** Building a paper, watching it being sat, and marking what is left. */
export function ExamBuilder({ examId }: { examId: string }) {
  const { data: exam, isLoading, error } = useExam(examId);
  const { data: bank } = useQuestionBank(exam?.subjectId);

  const addQuestions = useAddExamQuestions(examId);
  const removeQuestion = useRemoveExamQuestion(examId);
  const update = useUpdateExam(examId);
  const release = useReleaseExam(examId);
  const collect = useCollectExpired(examId);

  const [picked, setPicked] = useState<string[]>([]);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (error || !exam) {
    return (
      <p role="alert" className="text-sm text-red-600 dark:text-red-400">
        {error instanceof ApiError ? error.message : "Couldn't load this exam."}
      </p>
    );
  }

  const onAdd = async () => {
    setActionError(null);
    try {
      await addQuestions.mutateAsync(picked);
      setPicked([]);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Couldn't add those questions.");
    }
  };

  const run = async (action: () => Promise<unknown>, fallback: string) => {
    setActionError(null);
    setNotice(null);
    try {
      await action();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : fallback);
    }
  };

  const alreadyOnPaper = new Set((exam.questions ?? []).map((question) => question.sourceItemId ?? ""));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{exam.title}</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {exam.class?.name} · {exam.subject?.name} · {exam.durationMinutes} minutes ·{" "}
            {toMarks(exam.totalMarksHundredths)} marks
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {exam.status === "DRAFT" && (
            <button
              type="button"
              onClick={() => run(() => update.mutateAsync({ status: "PUBLISHED" }), "Couldn't publish it.")}
              className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white"
            >
              Publish to the class
            </button>
          )}
          {exam.status === "PUBLISHED" && (
            <button
              type="button"
              onClick={() => run(() => update.mutateAsync({ status: "CLOSED" }), "Couldn't close it.")}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-700"
            >
              Close
            </button>
          )}
          {exam.status !== "DRAFT" && (
            <>
              <button
                type="button"
                onClick={() =>
                  run(async () => {
                    const result = await collect.mutateAsync();
                    setNotice(
                      result.collected === 0
                        ? "No papers were left running."
                        : `Marked ${result.collected} paper(s) whose time had run out.`,
                    );
                  }, "Couldn't collect them.")
                }
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-700"
              >
                Collect expired
              </button>
              <button
                type="button"
                onClick={() =>
                  run(async () => {
                    const result = await release.mutateAsync();
                    setNotice(
                      result.heldForReview > 0
                        ? `Released ${result.released}. ${result.heldForReview} still need marking by you.`
                        : `Released ${result.released} result(s).`,
                    );
                  }, "Couldn't release the results.")
                }
                className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white"
              >
                Release results
              </button>
            </>
          )}
        </div>
      </div>

      {notice && <p className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}
      {actionError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {actionError}
        </p>
      )}

      <section className={CARD} aria-labelledby="paper-heading">
        <h2 id="paper-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          The paper
        </h2>
        {(exam.questions ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            No questions yet. Add some from the bank below — an empty paper cannot be published.
          </p>
        ) : (
          <ol className="mt-2 space-y-2">
            {exam.questions?.map((question, index) => (
              <li key={question.id} className="flex items-start justify-between gap-3 text-sm">
                <span>
                  {index + 1}. {question.prompt}
                  <span className="ml-2 text-xs text-slate-500">
                    {QUESTION_TYPE_LABELS[question.type]} · {marksLabel(question.marksHundredths)}
                  </span>
                </span>
                {exam.status === "DRAFT" && (
                  <button
                    type="button"
                    onClick={() => removeQuestion.mutate(question.id)}
                    className="shrink-0 text-xs font-semibold text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      {exam.status === "DRAFT" && (
        <section className={CARD} aria-labelledby="bank-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="bank-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Add from the question bank
            </h2>
            <button
              type="button"
              onClick={onAdd}
              disabled={picked.length === 0 || addQuestions.isPending}
              className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Add {picked.length > 0 ? picked.length : ""} to the paper
            </button>
          </div>

          {bank && bank.length === 0 && (
            <p className="mt-2 text-sm text-slate-500">
              Nothing in the bank for this subject yet.
            </p>
          )}

          <ul className="mt-3 space-y-2">
            {bank?.map((question) => (
              <li key={question.id} className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={picked.includes(question.id)}
                  disabled={alreadyOnPaper.has(question.id)}
                  onChange={(event) =>
                    setPicked((current) =>
                      event.target.checked
                        ? [...current, question.id]
                        : current.filter((id) => id !== question.id),
                    )
                  }
                  className="mt-1 h-4 w-4"
                  aria-label={`Add "${question.prompt}" to the paper`}
                />
                <span className={alreadyOnPaper.has(question.id) ? "text-slate-400" : ""}>
                  {question.prompt}
                  <span className="ml-2 text-xs text-slate-500">
                    {QUESTION_TYPE_LABELS[question.type]} · {marksLabel(question.marksHundredths)}
                    {alreadyOnPaper.has(question.id) ? " · already on the paper" : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {exam.status !== "DRAFT" && (
        <section className={CARD} aria-labelledby="attempts-heading">
          <h2 id="attempts-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            The class
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {exam.progress?.submitted} of {exam.progress?.expected} handed in ·{" "}
            {exam.progress?.needingReview} waiting for you · {exam.progress?.released} released
          </p>

          {(exam.attempts ?? []).length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">Nobody has started yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {exam.attempts?.map((attempt) => (
                <li key={attempt.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <span>
                    {attempt.studentProfile?.user
                      ? `${attempt.studentProfile.user.firstName} ${attempt.studentProfile.user.lastName}`
                      : attempt.studentProfileId}
                    <span className="ml-2 text-xs text-slate-500">
                      {attempt.status.toLowerCase().replace("_", " ")}
                      {attempt.autoSubmitted ? " · time ran out" : ""}
                      {attempt.needsReview ? " · needs you" : ""}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="tabular-nums">
                      {toMarks(attempt.totalScoreHundredths)} / {toMarks(exam.totalMarksHundredths)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setMarkingId(markingId === attempt.id ? null : attempt.id)}
                      className="text-xs font-semibold text-brand-600 hover:underline"
                    >
                      {markingId === attempt.id ? "Close" : "Mark"}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {markingId && <AttemptMarker attemptId={markingId} />}
        </section>
      )}
    </div>
  );
}

/** One student's paper, with the key alongside, for a teacher to mark. */
function AttemptMarker({ attemptId }: { attemptId: string }) {
  const { data: attempt, isLoading, error } = useStaffAttempt(attemptId);
  const mark = useMarkExamAnswer(attemptId);
  const [drafts, setDrafts] = useState<Record<string, { marks: string; feedback: string }>>({});
  const [markError, setMarkError] = useState<string | null>(null);

  if (isLoading) return <p className="mt-4 text-sm text-slate-500">Loading the paper…</p>;
  if (error || !attempt) {
    return (
      <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
        {error instanceof ApiError ? error.message : "Couldn't load that paper."}
      </p>
    );
  }

  const answers = new Map(attempt.answers.map((answer) => [answer.examQuestionId, answer]));

  return (
    <div className="mt-4 space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
      {markError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {markError}
        </p>
      )}
      {attempt.exam.questions.map((question, index) => {
        const answer = answers.get(question.id);
        if (!answer) return null;
        const draft = drafts[answer.id] ?? {
          marks: answer.awardedHundredths === null ? "" : String(answer.awardedHundredths / 100),
          feedback: answer.feedback ?? "",
        };

        return (
          <div key={question.id} className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-900">
            <p className="font-medium">
              {index + 1}. {question.prompt}
            </p>
            <p className="mt-1 text-slate-600 dark:text-slate-400">
              Answered: {answer.response.length > 0 ? answer.response.join(", ") : "nothing"}
            </p>
            {question.answer?.length > 0 && (
              <p className="mt-0.5 text-xs text-slate-500">Key: {question.answer.join(", ")}</p>
            )}

            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="text-xs font-medium">
                Marks (out of {toMarks(question.marksHundredths)})
                <input
                  value={draft.marks}
                  onChange={(event) => {
                    const marks = event.target.value;
                    // Functional update: two fields edited before a re-render
                    // would otherwise close over the same stale object.
                    setDrafts((current) => ({
                      ...current,
                      [answer.id]: { ...draft, marks },
                    }));
                  }}
                  className="mt-1 w-24 rounded-lg border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-950"
                />
              </label>
              <label className="min-w-[12rem] flex-1 text-xs font-medium">
                Feedback
                <input
                  value={draft.feedback}
                  onChange={(event) => {
                    const feedback = event.target.value;
                    setDrafts((current) => ({
                      ...current,
                      [answer.id]: { ...draft, feedback },
                    }));
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-950"
                />
              </label>
              <button
                type="button"
                onClick={async () => {
                  setMarkError(null);
                  try {
                    await mark.mutateAsync({
                      answerId: answer.id,
                      awardedHundredths: Math.round(Number(draft.marks || 0) * 100),
                      feedback: draft.feedback || undefined,
                    });
                  } catch (err) {
                    setMarkError(err instanceof ApiError ? err.message : "Couldn't save that mark.");
                  }
                }}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold dark:border-slate-700"
              >
                Save
              </button>
              {answer.needsReview && (
                <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Needs you</span>
              )}
              {answer.autoMarked && !answer.needsReview && (
                <span className="text-xs text-slate-500">Marked by the machine</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
