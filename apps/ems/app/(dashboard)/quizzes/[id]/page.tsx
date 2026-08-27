"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useForm, useFieldArray } from "react-hook-form";
import { ApiError } from "@/lib/api";
import { useQuiz, useUpdateQuiz, usePublishQuiz, QUIZ_QUESTION_TYPES, type QuizQuestionType } from "@/lib/use-quizzes";

interface QuestionFormValues {
  prompt: string;
  type: QuizQuestionType;
  optionsText: string;
  correctAnswer: string;
  marks: number;
}

interface FormValues {
  title: string;
  questions: QuestionFormValues[];
}

const EMPTY_QUESTION: QuestionFormValues = {
  prompt: "",
  type: "SHORT_ANSWER",
  optionsText: "",
  correctAnswer: "",
  marks: 1,
};

function linesToList(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export default function QuizDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: quiz, isLoading, error } = useQuiz(params.id);
  const update = useUpdateQuiz(params.id);
  const publish = usePublishQuiz(params.id);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const form = useForm<FormValues>({ defaultValues: { title: "", questions: [EMPTY_QUESTION] } });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "questions" });

  useEffect(() => {
    if (!quiz) return;
    form.reset({
      title: quiz.title,
      questions: quiz.content.questions.map((question) => ({
        prompt: question.prompt,
        type: question.type,
        optionsText: question.options.join("\n"),
        // Absent for students — the API strips the answer key.
        correctAnswer: question.correctAnswer ?? "",
        marks: question.marks,
      })),
    });
  }, [quiz, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    setSaved(false);
    try {
      await update.mutateAsync({
        title: values.title,
        content: {
          questions: values.questions.map((question, index) => ({
            questionNumber: index + 1,
            prompt: question.prompt,
            type: question.type,
            options: question.type === "MULTIPLE_CHOICE" ? linesToList(question.optionsText) : [],
            correctAnswer: question.correctAnswer,
            marks: Number(question.marks),
          })),
        },
      });
      setSaved(true);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Couldn't save this quiz.");
    }
  });

  const onPublish = async () => {
    setFormError(null);
    try {
      await publish.mutateAsync();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Couldn't publish this quiz.");
    }
  };

  if (isLoading) return <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>;
  if (error) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
        Couldn&apos;t load this quiz: {error.message}
      </p>
    );
  }
  if (!quiz) return null;

  const totalMarks = quiz.content.questions.reduce((sum, question) => sum + (question.marks ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          {quiz.schemeOfWork && (
            <Link
              href={`/schemes-of-work/${quiz.schemeOfWork.id}`}
              className="text-sm text-slate-600 hover:underline dark:text-slate-400"
            >
              ← {quiz.schemeOfWork.subject?.name ?? "Subject"} · {quiz.schemeOfWork.academicYear} ·{" "}
              {quiz.schemeOfWork.term}
            </Link>
          )}
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{quiz.title}</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Week {quiz.weekNumber} · {quiz.source === "AI_GENERATED" ? "Wisdom generated" : "Manual"} · {totalMarks} marks
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={
              quiz.status === "PUBLISHED"
                ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                : "rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400"
            }
          >
            {quiz.status}
          </span>
          {quiz.status !== "PUBLISHED" && (
            <button
              type="button"
              onClick={onPublish}
              disabled={publish.isPending}
              className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              Publish
            </button>
          )}
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
          <label htmlFor="title" className="block text-sm font-medium">
            Title
          </label>
          <input
            id="title"
            {...form.register("title")}
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
          />
        </div>

        {fields.map((field, index) => (
          <div key={field.id} className="space-y-3 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Question {index + 1}</h2>
              {fields.length > 1 && (
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="text-sm text-red-600 hover:underline dark:text-red-400"
                >
                  Remove question
                </button>
              )}
            </div>

            <div>
              <label htmlFor={`question-${index}-prompt`} className="block text-sm font-medium">
                Prompt
              </label>
              <textarea
                id={`question-${index}-prompt`}
                rows={2}
                {...form.register(`questions.${index}.prompt` as const)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor={`question-${index}-type`} className="block text-sm font-medium">
                  Type
                </label>
                <select
                  id={`question-${index}-type`}
                  {...form.register(`questions.${index}.type` as const)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
                >
                  {QUIZ_QUESTION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type === "MULTIPLE_CHOICE" ? "Multiple choice" : "Short answer"}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor={`question-${index}-marks`} className="block text-sm font-medium">
                  Marks
                </label>
                <input
                  id={`question-${index}-marks`}
                  type="number"
                  min={1}
                  {...form.register(`questions.${index}.marks` as const)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
            </div>

            <div>
              <label htmlFor={`question-${index}-options`} className="block text-sm font-medium">
                Options (one per line — multiple choice only)
              </label>
              <textarea
                id={`question-${index}-options`}
                rows={3}
                {...form.register(`questions.${index}.optionsText` as const)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
              />
            </div>

            <div>
              <label htmlFor={`question-${index}-correctAnswer`} className="block text-sm font-medium">
                Correct answer
              </label>
              <input
                id={`question-${index}-correctAnswer`}
                {...form.register(`questions.${index}.correctAnswer` as const)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() => append(EMPTY_QUESTION)}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
        >
          Add question
        </button>

        {formError && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
            {formError}
          </p>
        )}
        {saved && !formError && <p className="text-sm text-emerald-600 dark:text-emerald-400">Saved.</p>}

        <div>
          <button
            type="submit"
            disabled={form.formState.isSubmitting}
            className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            Save changes
          </button>
        </div>
      </form>
    </div>
  );
}
