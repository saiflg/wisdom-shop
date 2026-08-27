"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { ApiError } from "@/lib/api";
import { useLessonPlan, useUpdateLessonPlan, usePublishLessonPlan } from "@/lib/use-lesson-plans";

interface FormValues {
  objectivesText: string;
  materialsText: string;
  introduction: string;
  developmentStepsText: string;
  conclusion: string;
  assessment: string;
  homework: string;
}

function linesToList(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export default function LessonPlanDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: plan, isLoading, error } = useLessonPlan(params.id);
  const update = useUpdateLessonPlan(params.id);
  const publish = usePublishLessonPlan(params.id);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const form = useForm<FormValues>();

  useEffect(() => {
    if (!plan) return;
    form.reset({
      objectivesText: plan.content.objectives.join("\n"),
      materialsText: plan.content.materials.join("\n"),
      introduction: plan.content.introduction,
      developmentStepsText: plan.content.developmentSteps.join("\n"),
      conclusion: plan.content.conclusion,
      assessment: plan.content.assessment,
      homework: plan.content.homework,
    });
  }, [plan, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    setSaved(false);
    try {
      await update.mutateAsync({
        objectives: linesToList(values.objectivesText),
        materials: linesToList(values.materialsText),
        introduction: values.introduction,
        developmentSteps: linesToList(values.developmentStepsText),
        conclusion: values.conclusion,
        assessment: values.assessment,
        homework: values.homework,
      });
      setSaved(true);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Couldn't save this lesson plan.");
    }
  });

  const onPublish = async () => {
    setFormError(null);
    try {
      await publish.mutateAsync();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Couldn't publish this lesson plan.");
    }
  };

  if (isLoading) return <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>;
  if (error) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
        Couldn&apos;t load this lesson plan: {error.message}
      </p>
    );
  }
  if (!plan) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          {plan.schemeOfWork && (
            <Link href={`/schemes-of-work/${plan.schemeOfWork.id}`} className="text-sm text-slate-600 hover:underline dark:text-slate-400">
              ← {plan.schemeOfWork.subject?.name ?? "Subject"} · {plan.schemeOfWork.academicYear} · {plan.schemeOfWork.term}
            </Link>
          )}
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Week {plan.weekNumber} lesson plan</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {plan.source === "AI_GENERATED" ? "Wisdom generated" : "Manual"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={
              plan.status === "PUBLISHED"
                ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                : "rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400"
            }
          >
            {plan.status}
          </span>
          {plan.status !== "PUBLISHED" && (
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

      <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
        <div>
          <label htmlFor="objectivesText" className="block text-sm font-medium">
            Objectives (one per line)
          </label>
          <textarea
            id="objectivesText"
            rows={2}
            {...form.register("objectivesText")}
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
          />
        </div>

        <div>
          <label htmlFor="materialsText" className="block text-sm font-medium">
            Materials (one per line)
          </label>
          <textarea
            id="materialsText"
            rows={2}
            {...form.register("materialsText")}
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
          />
        </div>

        <div>
          <label htmlFor="introduction" className="block text-sm font-medium">
            Introduction
          </label>
          <textarea
            id="introduction"
            rows={2}
            {...form.register("introduction")}
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
          />
        </div>

        <div>
          <label htmlFor="developmentStepsText" className="block text-sm font-medium">
            Development steps (one per line)
          </label>
          <textarea
            id="developmentStepsText"
            rows={4}
            {...form.register("developmentStepsText")}
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
          />
        </div>

        <div>
          <label htmlFor="conclusion" className="block text-sm font-medium">
            Conclusion
          </label>
          <textarea
            id="conclusion"
            rows={2}
            {...form.register("conclusion")}
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
          />
        </div>

        <div>
          <label htmlFor="assessment" className="block text-sm font-medium">
            Assessment
          </label>
          <textarea
            id="assessment"
            rows={2}
            {...form.register("assessment")}
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
          />
        </div>

        <div>
          <label htmlFor="homework" className="block text-sm font-medium">
            Homework
          </label>
          <textarea
            id="homework"
            rows={2}
            {...form.register("homework")}
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
          />
        </div>

        {formError && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
            {formError}
          </p>
        )}
        {saved && !formError && <p className="text-sm text-emerald-600 dark:text-emerald-400">Saved.</p>}

        <button
          type="submit"
          disabled={form.formState.isSubmitting}
          className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
        >
          Save changes
        </button>
      </form>
    </div>
  );
}
