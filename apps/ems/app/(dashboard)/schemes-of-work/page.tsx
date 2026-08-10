"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import { useSubjects } from "@/lib/use-subjects";
import { useCurriculumSettings } from "@/lib/use-curriculum-settings";
import { useSchemesOfWork, useCreateSchemeOfWork, useGenerateSchemeOfWork } from "@/lib/use-schemes-of-work";
import { useCanAuthor } from "@/lib/use-can-author";
import { FormField } from "@/components/form-field";
import { DataExchangeBar } from "@/components/data-exchange-bar";

const createSchema = z.object({
  subjectId: z.string().min(1, "Choose a subject"),
  academicYear: z.string().min(1, "Academic year is required"),
  term: z.string().min(1, "Term is required"),
  topic: z.string().min(1, "Give week 1 a topic"),
  objectives: z.string().min(1, "At least one objective"),
  activities: z.string().min(1, "At least one activity"),
});
type CreateValues = z.infer<typeof createSchema>;

const generateSchema = z.object({
  subjectId: z.string().min(1, "Choose a subject"),
  academicYear: z.string().min(1, "Academic year is required"),
  term: z.string().min(1, "Term is required"),
});
type GenerateValues = z.infer<typeof generateSchema>;

function linesToList(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export default function SchemesOfWorkPage() {
  const searchParams = useSearchParams();
  const subjectId = searchParams.get("subjectId") ?? undefined;

  const { data: subjects } = useSubjects();
  const { data: settings } = useCurriculumSettings();
  const { data: schemes, isLoading, error } = useSchemesOfWork(subjectId);
  const createSow = useCreateSchemeOfWork();
  const generateSow = useGenerateSchemeOfWork();

  const [mode, setMode] = useState<"none" | "manual" | "generate">("none");
  const [formError, setFormError] = useState<string | null>(null);

  // Read by students, written by staff. See use-can-author.ts.
  const canAuthor = useCanAuthor();
  const canGenerate = canAuthor && (settings ? settings.mode !== "MANUAL" : false);

  const createForm = useForm<CreateValues>({ resolver: zodResolver(createSchema) });
  const generateForm = useForm<GenerateValues>({ resolver: zodResolver(generateSchema) });

  // The <select> can't show a prefilled option until its option list has
  // loaded — a native `defaultValue` set before that finishes silently
  // falls back to the first option, so we set it explicitly once the
  // subject list actually arrives.
  useEffect(() => {
    if (!subjectId || !subjects) return;
    createForm.setValue("subjectId", subjectId);
    generateForm.setValue("subjectId", subjectId);
  }, [subjectId, subjects, createForm, generateForm]);

  const onCreate = createForm.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await createSow.mutateAsync({
        subjectId: values.subjectId,
        academicYear: values.academicYear,
        term: values.term,
        content: {
          weeks: [
            {
              weekNumber: 1,
              topic: values.topic,
              objectives: linesToList(values.objectives),
              activities: linesToList(values.activities),
            },
          ],
        },
      });
      createForm.reset();
      setMode("none");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Couldn't create that scheme of work.");
    }
  });

  const onGenerate = generateForm.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await generateSow.mutateAsync(values);
      generateForm.reset();
      setMode("none");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Couldn't generate that scheme of work.");
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Schemes of work</h1>
        <div className="flex gap-2">
          {canAuthor && (
            <button
              type="button"
              onClick={() => {
                setFormError(null);
                setMode(mode === "manual" ? "none" : "manual");
              }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
            >
              {mode === "manual" ? "Cancel" : "Create manually"}
            </button>
          )}
          {canGenerate && (
            <button
              type="button"
              onClick={() => {
                setFormError(null);
                setMode(mode === "generate" ? "none" : "generate");
              }}
              className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            >
              {mode === "generate" ? "Cancel" : "Generate with AI"}
            </button>
          )}
        </div>
      </div>

      <DataExchangeBar entity="curriculum" />

      {mode === "manual" && (
        <form onSubmit={onCreate} className="space-y-4 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
          <div>
            <label htmlFor="create-subjectId" className="block text-sm font-medium">
              Subject
            </label>
            <select
              id="create-subjectId"
              {...createForm.register("subjectId")}
              defaultValue={subjectId ?? ""}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="" disabled>
                Choose a subject
              </option>
              {subjects?.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                  {subject.gradeLevel ? ` (${subject.gradeLevel})` : ""}
                </option>
              ))}
            </select>
            {createForm.formState.errors.subjectId && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{createForm.formState.errors.subjectId.message}</p>
            )}
          </div>
          <FormField
            label="Academic year"
            placeholder="2026-2027"
            error={createForm.formState.errors.academicYear?.message}
            {...createForm.register("academicYear")}
          />
          <FormField label="Term" placeholder="Term 1" error={createForm.formState.errors.term?.message} {...createForm.register("term")} />
          <FormField
            label="Week 1 topic"
            placeholder="Introduction to fractions"
            error={createForm.formState.errors.topic?.message}
            {...createForm.register("topic")}
          />
          <div>
            <label htmlFor="create-objectives" className="block text-sm font-medium">
              Week 1 objectives (one per line)
            </label>
            <textarea
              id="create-objectives"
              rows={3}
              {...createForm.register("objectives")}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
            />
            {createForm.formState.errors.objectives && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{createForm.formState.errors.objectives.message}</p>
            )}
          </div>
          <div>
            <label htmlFor="create-activities" className="block text-sm font-medium">
              Week 1 activities (one per line)
            </label>
            <textarea
              id="create-activities"
              rows={3}
              {...createForm.register("activities")}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
            />
            {createForm.formState.errors.activities && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{createForm.formState.errors.activities.message}</p>
            )}
          </div>
          {formError && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
              {formError}
            </p>
          )}
          <button
            type="submit"
            disabled={createForm.formState.isSubmitting}
            className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            Create
          </button>
          <p className="text-xs text-slate-500">More weeks can be added by editing the scheme after creation.</p>
        </form>
      )}

      {mode === "generate" && (
        <form onSubmit={onGenerate} className="space-y-4 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
          <div>
            <label htmlFor="generate-subjectId" className="block text-sm font-medium">
              Subject
            </label>
            <select
              id="generate-subjectId"
              {...generateForm.register("subjectId")}
              defaultValue={subjectId ?? ""}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="" disabled>
                Choose a subject
              </option>
              {subjects?.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                  {subject.gradeLevel ? ` (${subject.gradeLevel})` : ""}
                </option>
              ))}
            </select>
            {generateForm.formState.errors.subjectId && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{generateForm.formState.errors.subjectId.message}</p>
            )}
          </div>
          <FormField
            label="Academic year"
            placeholder="2026-2027"
            error={generateForm.formState.errors.academicYear?.message}
            {...generateForm.register("academicYear")}
          />
          <FormField label="Term" placeholder="Term 1" error={generateForm.formState.errors.term?.message} {...generateForm.register("term")} />
          {formError && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
              {formError}
            </p>
          )}
          <button
            type="submit"
            disabled={generateForm.formState.isSubmitting}
            className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            Generate
          </button>
        </form>
      )}

      {isLoading && <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          Couldn&apos;t load schemes of work: {error.message}
        </p>
      )}

      {schemes && schemes.length === 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-400">No schemes of work yet.</p>
      )}

      {schemes && schemes.length > 0 && (
        <ul className="space-y-3">
          {schemes.map((sow) => (
            <li key={sow.id} className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <Link href={`/schemes-of-work/${sow.id}`} className="font-medium hover:underline">
                  {sow.subject?.name ?? "Subject"} · {sow.academicYear} · {sow.term}
                </Link>
                <div className="flex gap-2">
                  <span
                    className={
                      sow.status === "PUBLISHED"
                        ? "rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                        : "rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                    }
                  >
                    {sow.status}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                    {sow.source === "AI_GENERATED" ? "AI generated" : "Manual"}
                  </span>
                </div>
              </div>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{sow.content.weeks.length} weeks</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
