"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { useClasses } from "@/lib/use-classes";
import { useSubjects } from "@/lib/use-subjects";
import {
  toMarks,
  useAssignment,
  useAssignments,
  useCreateAssignment,
  useMarkSubmission,
  useReleaseMarks,
  useSubmitWork,
  useUpdateAssignment,
  type Assignment,
  type AssignmentStatus,
} from "@/lib/use-homework";
import { FormField } from "@/components/form-field";

const setSchema = z.object({
  classId: z.string().min(1, "Choose a class"),
  subjectId: z.string().min(1, "Choose a subject"),
  title: z.string().min(2, "Give it a title"),
  instructions: z.string().min(1, "Say what to do"),
  dueAt: z.string().optional(),
  maxMarks: z.string().optional(),
});
type SetValues = z.infer<typeof setSchema>;

const INPUT =
  "mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900";
const BADGE = "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold";
const STATUS_BADGE: Record<AssignmentStatus, string> = {
  DRAFT: `${BADGE} bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400`,
  SET: `${BADGE} bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300`,
  CLOSED: `${BADGE} bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300`,
};

export default function HomeworkPage() {
  const user = useAuthStore((s) => s.user);
  const isStaff = Boolean(user?.roles.some((r) => r === "SCHOOL_ADMIN" || r === "TEACHER"));

  const { data: assignments, isLoading, error } = useAssignments();
  const { data: classes } = useClasses();
  const { data: subjects } = useSubjects();
  const create = useCreateAssignment();

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<SetValues>({ resolver: zodResolver(setSchema) });

  const onSet = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await create.mutateAsync({
        classId: values.classId,
        subjectId: values.subjectId,
        title: values.title,
        instructions: values.instructions,
        ...(values.dueAt ? { dueAt: new Date(values.dueAt).toISOString() } : {}),
        // Typed in marks, stored in hundredths — the conversion happens here
        // and nowhere else.
        ...(values.maxMarks ? { maxScoreHundredths: Math.round(Number(values.maxMarks) * 100) } : {}),
      });
      form.reset();
      setOpen(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Couldn't set that work.");
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Homework</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            {isStaff
              ? "Set work, see who has handed in, mark it, and release the marks when the whole class is done."
              : "What you have been set, and what you have handed in."}
          </p>
        </div>
        {isStaff && (
          <button
            type="button"
            onClick={() => {
              setFormError(null);
              setOpen(!open);
            }}
            className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500"
          >
            {open ? "Cancel" : "Set work"}
          </button>
        )}
      </div>

      {open && (
        <form onSubmit={onSet} className="space-y-4 rounded-xl border border-slate-200 p-5 dark:border-slate-800">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="classId" className="block text-sm font-medium">
                Class
              </label>
              <select id="classId" {...form.register("classId")} defaultValue="" className={INPUT}>
                <option value="" disabled>
                  Choose a class
                </option>
                {classes?.map((klass) => (
                  <option key={klass.id} value={klass.id}>
                    {klass.name}
                  </option>
                ))}
              </select>
              {form.formState.errors.classId && (
                <p className="mt-1 text-xs text-red-600">{form.formState.errors.classId.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="subjectId" className="block text-sm font-medium">
                Subject
              </label>
              <select id="subjectId" {...form.register("subjectId")} defaultValue="" className={INPUT}>
                <option value="" disabled>
                  Choose a subject
                </option>
                {subjects?.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
              {form.formState.errors.subjectId && (
                <p className="mt-1 text-xs text-red-600">{form.formState.errors.subjectId.message}</p>
              )}
            </div>
          </div>

          <FormField
            label="Title"
            placeholder="Fractions worksheet"
            error={form.formState.errors.title?.message}
            {...form.register("title")}
          />

          <div>
            <label htmlFor="instructions" className="block text-sm font-medium">
              What to do
            </label>
            <textarea
              id="instructions"
              rows={3}
              placeholder="Questions 1 to 12 on page 43."
              {...form.register("instructions")}
              className={INPUT}
            />
            {form.formState.errors.instructions && (
              <p className="mt-1 text-xs text-red-600">{form.formState.errors.instructions.message}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Due (optional)"
              type="datetime-local"
              hint="Leave blank for 'before next lesson' — work is then never counted late."
              {...form.register("dueAt")}
            />
            <FormField label="Out of (optional)" type="number" placeholder="10" {...form.register("maxMarks")} />
          </div>

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <button
            type="submit"
            disabled={create.isPending}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
          >
            {create.isPending ? "Saving…" : "Save as draft"}
          </button>
          <p className="text-xs text-slate-500">
            Saved as a draft. Students see nothing until you set it.
          </p>
        </form>
      )}

      {isLoading && <p className="text-sm text-slate-500">Loading homework…</p>}
      {error && <p className="text-sm text-red-600">Couldn&apos;t load homework.</p>}

      {assignments && assignments.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
          {isStaff ? "No work set yet." : "Nothing has been set for you yet."}
        </p>
      )}

      <ul className="space-y-2">
        {assignments?.map((assignment) => (
          <li key={assignment.id}>
            <button
              type="button"
              onClick={() => setSelected(selected === assignment.id ? null : assignment.id)}
              aria-expanded={selected === assignment.id}
              className="flex w-full items-center justify-between gap-4 rounded-xl border border-slate-200 p-4 text-start transition hover:border-brand-400 dark:border-slate-800"
            >
              <span className="min-w-0">
                <span className="block font-semibold">{assignment.title}</span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  {assignment.subject?.name}
                  {assignment.class ? ` · ${assignment.class.name}` : ""}
                  {assignment.dueAt
                    ? ` · due ${new Date(assignment.dueAt).toLocaleString()}`
                    : " · no deadline"}
                  {isStaff && assignment._count ? ` · ${assignment._count.submissions} handed in` : ""}
                </span>
              </span>
              <span className={STATUS_BADGE[assignment.status]}>{assignment.status.toLowerCase()}</span>
            </button>

            {selected === assignment.id && (
              <Detail id={assignment.id} isStaff={isStaff} summary={assignment} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Detail({
  id,
  isStaff,
  summary,
}: {
  id: string;
  isStaff: boolean;
  summary: Assignment;
}) {
  const { data: assignment, isLoading, error } = useAssignment(id);
  const update = useUpdateAssignment(id);
  const release = useReleaseMarks(id);
  const submit = useSubmitWork(id);
  const mark = useMarkSubmission();

  const [content, setContent] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const act = async (action: () => Promise<unknown>, fallback: string, ok?: string) => {
    setMessage(null);
    try {
      await action();
      if (ok) setMessage({ tone: "ok", text: ok });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof ApiError ? err.message : fallback });
    }
  };

  if (isLoading) return <p className="p-4 text-sm text-slate-500">Loading…</p>;
  if (error || !assignment) {
    return (
      <p role="alert" className="p-4 text-sm text-red-600">
        Couldn&apos;t open that piece of work.
      </p>
    );
  }

  const mine = assignment.submissions?.[0];

  return (
    <div className="mt-2 space-y-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <p className="whitespace-pre-wrap text-sm">{assignment.instructions}</p>
      <p className="text-xs text-slate-500">Out of {toMarks(assignment.maxScoreHundredths)} marks.</p>

      {isStaff ? (
        <>
          <div className="flex flex-wrap gap-2">
            {summary.status === "DRAFT" && (
              <button
                type="button"
                onClick={() => void act(() => update.mutateAsync({ status: "SET" }), "Couldn't set that.")}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500"
              >
                Set for the class
              </button>
            )}
            {summary.status === "SET" && (
              <button
                type="button"
                onClick={() => void act(() => update.mutateAsync({ status: "CLOSED" }), "Couldn't close that.")}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
              >
                Close to new submissions
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                void act(
                  async () => {
                    const { released } = await release.mutateAsync();
                    setMessage({
                      tone: "ok",
                      text:
                        released === 0
                          ? "Nothing to release — mark some work first."
                          : `Released ${released} mark${released === 1 ? "" : "s"}.`,
                    });
                  },
                  "Couldn't release those marks.",
                )
              }
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
            >
              Release marks
            </button>
          </div>

          {assignment.progress && (
            <p className="text-xs text-slate-500">
              {assignment.progress.submitted} of {assignment.progress.expected} handed in ·{" "}
              {assignment.progress.marked} marked · {assignment.progress.late} late ·{" "}
              {assignment.progress.outstanding} still to come
            </p>
          )}

          {message && (
            <p role="status" className={message.tone === "ok" ? "text-sm text-emerald-600" : "text-sm text-red-600"}>
              {message.text}
            </p>
          )}

          <ul className="space-y-2">
            {assignment.submissions?.map((submission) => (
              <li key={submission.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold">
                    {submission.studentProfile?.user
                      ? `${submission.studentProfile.user.firstName} ${submission.studentProfile.user.lastName}`
                      : "Student"}
                    {submission.isLate && <span className="ms-2 text-xs font-semibold text-amber-600">late</span>}
                  </span>
                  <span className="text-xs text-slate-500">{submission.status.toLowerCase()}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
                  {submission.content}
                </p>
                <MarkRow
                  submissionId={submission.id}
                  maxScoreHundredths={assignment.maxScoreHundredths}
                  current={submission.scoreHundredths ?? null}
                  onMark={(input) =>
                    act(() => mark.mutateAsync({ submissionId: submission.id, ...input }), "Couldn't save that mark.", "Marked.")
                  }
                />
              </li>
            ))}
          </ul>

          {assignment.submissions?.length === 0 && (
            <p className="text-sm text-slate-500">Nobody has handed in yet.</p>
          )}
        </>
      ) : (
        <>
          {mine ? (
            <div className="space-y-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                What you handed in
                {mine.isLate && <span className="ms-2 text-amber-600">late</span>}
              </p>
              <p className="whitespace-pre-wrap text-sm">{mine.content}</p>

              {mine.status === "RELEASED" ? (
                <div className="mt-2 border-t border-slate-200 pt-2 dark:border-slate-800">
                  <p className="text-sm font-semibold">
                    {toMarks(mine.scoreHundredths)} out of {toMarks(assignment.maxScoreHundredths)}
                  </p>
                  {mine.feedback && <p className="mt-1 text-sm">{mine.feedback}</p>}
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  {mine.status === "MARKED" ? "Marked — your teacher will release it soon." : "Not marked yet."}
                </p>
              )}
            </div>
          ) : null}

          {summary.status === "SET" && (!mine || mine.status === "SUBMITTED") && (
            <div className="space-y-2">
              <label htmlFor="work" className="block text-sm font-medium">
                {mine ? "Change what you handed in" : "Your answer"}
              </label>
              <textarea
                id="work"
                rows={4}
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="Type your answer here…"
                className={INPUT}
              />
              <button
                type="button"
                disabled={submit.isPending || content.trim().length === 0}
                onClick={() =>
                  void act(
                    async () => {
                      await submit.mutateAsync(content.trim());
                      setContent("");
                    },
                    "Couldn't hand that in.",
                    "Handed in.",
                  )
                }
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
              >
                {submit.isPending ? "Handing in…" : "Hand in"}
              </button>
            </div>
          )}

          {message && (
            <p role="status" className={message.tone === "ok" ? "text-sm text-emerald-600" : "text-sm text-red-600"}>
              {message.text}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function MarkRow({
  submissionId,
  maxScoreHundredths,
  current,
  onMark,
}: {
  submissionId: string;
  maxScoreHundredths: number;
  current: number | null;
  onMark: (input: { scoreHundredths?: number; feedback?: string }) => Promise<void>;
  }) {
  const [score, setScore] = useState(current === null ? "" : String(current / 100));
  const [feedback, setFeedback] = useState("");

  return (
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <label className="text-xs font-medium">
        Mark
        <input
          value={score}
          onChange={(event) => setScore(event.target.value)}
          inputMode="decimal"
          aria-label={`Mark out of ${maxScoreHundredths / 100}`}
          className="mt-1 block w-24 rounded-lg border border-slate-300 bg-white px-2 py-1 text-end text-sm tabular-nums dark:border-slate-700 dark:bg-slate-900"
        />
      </label>
      <label className="min-w-0 flex-1 text-xs font-medium">
        Feedback
        <input
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
          placeholder="Good work, check question 7."
          className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
      </label>
      <button
        type="button"
        onClick={() =>
          void onMark({
            ...(score.trim() ? { scoreHundredths: Math.round(Number(score) * 100) } : {}),
            ...(feedback.trim() ? { feedback: feedback.trim() } : {}),
          })
        }
        aria-label={`Save mark for submission ${submissionId}`}
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
      >
        Save mark
      </button>
    </div>
  );
}
