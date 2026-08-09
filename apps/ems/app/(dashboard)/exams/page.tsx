"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { useClasses } from "@/lib/use-classes";
import { useSubjects } from "@/lib/use-subjects";
import { useAssessments } from "@/lib/use-grading";
import { toMarks, useCreateExam, useExams, type ExamStatus } from "@/lib/use-exams";
import { FormField } from "@/components/form-field";

const INPUT =
  "mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900";
const BADGE = "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold";
const STATUS_BADGE: Record<ExamStatus, string> = {
  DRAFT: `${BADGE} bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400`,
  PUBLISHED: `${BADGE} bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300`,
  CLOSED: `${BADGE} bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300`,
};

const examSchema = z.object({
  classId: z.string().min(1, "Choose a class"),
  subjectId: z.string().min(1, "Choose a subject"),
  title: z.string().min(2, "Give it a title"),
  academicYear: z.string().min(1, "Which year?"),
  term: z.string().min(1, "Which term?"),
  // Kept a string and converted at submit: an untouched number input
  // submits "", which z.coerce.number() turns into 0 and then fails .min(1).
  durationMinutes: z
    .string()
    .refine((value) => /^\d+$/.test(value) && Number(value) >= 1, "How many minutes?"),
  instructions: z.string().optional(),
  assessmentId: z.string().optional(),
});
type ExamValues = z.infer<typeof examSchema>;

export default function ExamsPage() {
  const user = useAuthStore((s) => s.user);
  const isStaff = Boolean(user?.roles.some((r) => r === "SCHOOL_ADMIN" || r === "TEACHER"));

  const { data: exams, isLoading, error } = useExams();
  const { data: classes } = useClasses();
  const { data: subjects } = useSubjects();
  const create = useCreateExam();

  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<ExamValues>({
    resolver: zodResolver(examSchema),
    defaultValues: { academicYear: "2026-2027", term: "Term 1", durationMinutes: "45" },
  });

  // Watched so the assessment list narrows to the class/year/term chosen
  // above it — an assessment from another class is refused by the API, so
  // offering one here would only be a way to fail.
  const chosenClass = form.watch("classId");
  const chosenYear = form.watch("academicYear");
  const chosenTerm = form.watch("term");
  const { data: assessments } = useAssessments(chosenClass || null, chosenYear, chosenTerm);

  const onCreate = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await create.mutateAsync({
        classId: values.classId,
        subjectId: values.subjectId,
        title: values.title,
        academicYear: values.academicYear,
        term: values.term,
        durationMinutes: Number(values.durationMinutes),
        ...(values.instructions ? { instructions: values.instructions } : {}),
        ...(values.assessmentId ? { assessmentId: values.assessmentId } : {}),
      });
      form.reset();
      setOpen(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Couldn't create that exam.");
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Exams</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            {isStaff
              ? "Build a paper from the question bank, publish it, and mark what the machine could not."
              : "Papers set for your class, and how you did once your teacher has released the marks."}
          </p>
        </div>
        {isStaff && (
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          >
            {open ? "Cancel" : "New exam"}
          </button>
        )}
      </div>

      {isStaff && open && (
        <form onSubmit={onCreate} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Class
              <select className={INPUT} {...form.register("classId")}>
                <option value="">Choose…</option>
                {classes?.map((klass) => (
                  <option key={klass.id} value={klass.id}>
                    {klass.name}
                  </option>
                ))}
              </select>
              {form.formState.errors.classId && (
                <span className="mt-1 block text-xs text-red-600">
                  {form.formState.errors.classId.message}
                </span>
              )}
            </label>

            <label className="text-sm font-medium">
              Subject
              <select className={INPUT} {...form.register("subjectId")}>
                <option value="">Choose…</option>
                {subjects?.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
              {form.formState.errors.subjectId && (
                <span className="mt-1 block text-xs text-red-600">
                  {form.formState.errors.subjectId.message}
                </span>
              )}
            </label>

            <FormField
              label="Title"
              placeholder="End of term test"
              error={form.formState.errors.title?.message}
              {...form.register("title")}
            />
            <FormField
              label="Minutes each student gets"
              hint="Counted from the moment they start, not from a fixed time."
              error={form.formState.errors.durationMinutes?.message}
              {...form.register("durationMinutes")}
            />
            <FormField
              label="Academic year"
              error={form.formState.errors.academicYear?.message}
              {...form.register("academicYear")}
            />
            <FormField
              label="Term"
              error={form.formState.errors.term?.message}
              {...form.register("term")}
            />
          </div>

          <label className="mt-4 block text-sm font-medium">
            Counts towards
            <select className={INPUT} {...form.register("assessmentId")}>
              <option value="">Nothing — this is a practice paper</option>
              {assessments?.map((assessment) => (
                <option key={assessment.id} value={assessment.id}>
                  {assessment.name} ({assessment.maxScoreHundredths / 100} marks)
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs font-normal text-slate-500">
              {chosenClass
                ? "A released result is scaled onto this assessment and reaches the report card. Leave it as a practice paper and the marks count towards nothing."
                : "Choose a class first to see its assessments."}
            </span>
          </label>

          <label className="mt-4 block text-sm font-medium">
            Instructions to the class
            <textarea rows={2} className={INPUT} {...form.register("instructions")} />
          </label>

          {formError && (
            <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={create.isPending}
            className="mt-4 rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {create.isPending ? "Creating…" : "Create as a draft"}
          </button>
        </form>
      )}

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error instanceof ApiError ? error.message : "Couldn't load exams."}
        </p>
      )}

      {exams && exams.length === 0 && (
        <p className="text-sm text-slate-500">
          {isStaff ? "No exams yet." : "You have no exams at the moment."}
        </p>
      )}

      <ul className="space-y-3">
        {exams?.map((exam) => (
          <li key={exam.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/exams/${exam.id}`} className="font-medium hover:underline">
                  {exam.title}
                </Link>
                <p className="mt-1 text-xs text-slate-500">
                  {exam.class?.name} · {exam.subject?.name} · {exam.durationMinutes} minutes
                  {exam._count ? ` · ${exam._count.questions} questions` : ""}
                </p>

                {isStaff && exam.progress && (
                  <p className="mt-1 text-xs text-slate-500">
                    {exam.progress.submitted} of {exam.progress.expected} handed in
                    {exam.progress.needingReview > 0
                      ? ` · ${exam.progress.needingReview} waiting for you`
                      : ""}
                  </p>
                )}

                {!isStaff && (
                  <p className="mt-1 text-sm">
                    {exam.attempt === null || exam.attempt === undefined ? (
                      <span className="text-slate-500">Not started</span>
                    ) : exam.attempt.status === "IN_PROGRESS" ? (
                      <span className="font-semibold text-amber-700 dark:text-amber-400">In progress</span>
                    ) : exam.attempt.status === "RELEASED" ? (
                      <span className="font-semibold">
                        {toMarks(exam.attempt.totalScoreHundredths)} marks
                      </span>
                    ) : (
                      // Never "marked" — that is the fact being withheld.
                      <span className="text-slate-500">Handed in. Marks not released yet.</span>
                    )}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-3">
                {isStaff && <span className={STATUS_BADGE[exam.status]}>{exam.status.toLowerCase()}</span>}
                <Link
                  href={`/exams/${exam.id}`}
                  className="text-xs font-semibold text-brand-600 hover:underline"
                >
                  {isStaff
                    ? "Open"
                    : exam.attempt?.status === "IN_PROGRESS"
                      ? "Continue"
                      : exam.attempt
                        ? "See result"
                        : "Start"}
                </Link>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
