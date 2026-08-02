"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { ApiError } from "@/lib/api";
import { useSchemeOfWork, useUpdateSchemeOfWork, usePublishSchemeOfWork } from "@/lib/use-schemes-of-work";

interface WeekFormValues {
  topic: string;
  objectivesText: string;
  activitiesText: string;
}

interface FormValues {
  weeks: WeekFormValues[];
}

function linesToList(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

const EMPTY_WEEK: WeekFormValues = { topic: "", objectivesText: "", activitiesText: "" };

export default function SchemeOfWorkDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: sow, isLoading, error } = useSchemeOfWork(params.id);
  const update = useUpdateSchemeOfWork(params.id);
  const publish = usePublishSchemeOfWork(params.id);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const form = useForm<FormValues>({ defaultValues: { weeks: [EMPTY_WEEK] } });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "weeks" });

  useEffect(() => {
    if (!sow) return;
    form.reset({
      weeks: sow.content.weeks.map((week) => ({
        topic: week.topic,
        objectivesText: week.objectives.join("\n"),
        activitiesText: week.activities.join("\n"),
      })),
    });
  }, [sow, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    setSaved(false);
    try {
      await update.mutateAsync({
        weeks: values.weeks.map((week, index) => ({
          weekNumber: index + 1,
          topic: week.topic,
          objectives: linesToList(week.objectivesText),
          activities: linesToList(week.activitiesText),
        })),
      });
      setSaved(true);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Couldn't save this scheme of work.");
    }
  });

  const onPublish = async () => {
    setFormError(null);
    try {
      await publish.mutateAsync();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Couldn't publish this scheme of work.");
    }
  };

  if (isLoading) return <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>;
  if (error) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
        Couldn&apos;t load this scheme of work: {error.message}
      </p>
    );
  }
  if (!sow) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {sow.subject?.name ?? "Subject"} · {sow.academicYear} · {sow.term}
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {sow.source === "AI_GENERATED" ? "AI generated" : "Manual"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={
              sow.status === "PUBLISHED"
                ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                : "rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400"
            }
          >
            {sow.status}
          </span>
          {sow.status !== "PUBLISHED" && (
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
        {fields.map((field, index) => (
          <div key={field.id} className="space-y-3 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Week {index + 1}</h2>
              {fields.length > 1 && (
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="text-sm text-red-600 hover:underline dark:text-red-400"
                >
                  Remove week
                </button>
              )}
            </div>

            <div>
              <label htmlFor={`week-${index}-topic`} className="block text-sm font-medium">
                Topic
              </label>
              <input
                id={`week-${index}-topic`}
                {...form.register(`weeks.${index}.topic` as const)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
              />
            </div>

            <div>
              <label htmlFor={`week-${index}-objectives`} className="block text-sm font-medium">
                Objectives (one per line)
              </label>
              <textarea
                id={`week-${index}-objectives`}
                rows={3}
                {...form.register(`weeks.${index}.objectivesText` as const)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
              />
            </div>

            <div>
              <label htmlFor={`week-${index}-activities`} className="block text-sm font-medium">
                Activities (one per line)
              </label>
              <textarea
                id={`week-${index}-activities`}
                rows={3}
                {...form.register(`weeks.${index}.activitiesText` as const)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() => append(EMPTY_WEEK)}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
        >
          Add week
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
