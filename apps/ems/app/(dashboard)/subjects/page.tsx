"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import { useSubjects, useCreateSubject } from "@/lib/use-subjects";
import { FormField } from "@/components/form-field";
import { DataExchangeBar } from "@/components/data-exchange-bar";

const createSubjectSchema = z.object({
  name: z.string().min(1, "Name is required"),
  gradeLevel: z.string().optional(),
});

type CreateSubjectValues = z.infer<typeof createSubjectSchema>;

export default function SubjectsPage() {
  const { data: subjects, isLoading, error } = useSubjects();
  const createSubject = useCreateSubject();
  const [formError, setFormError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const form = useForm<CreateSubjectValues>({ resolver: zodResolver(createSubjectSchema) });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await createSubject.mutateAsync(values);
      form.reset();
      setShowForm(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Couldn't create that subject.");
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Subjects</h1>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          {showForm ? "Cancel" : "New subject"}
        </button>
      </div>

      <DataExchangeBar entity="subjects" />

      {showForm && (
        <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
          <FormField label="Name" placeholder="Mathematics" error={form.formState.errors.name?.message} {...form.register("name")} />
          <FormField
            label="Grade level"
            placeholder="Grade 5"
            error={form.formState.errors.gradeLevel?.message}
            {...form.register("gradeLevel")}
          />
          {formError && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
              {formError}
            </p>
          )}
          <button
            type="submit"
            disabled={form.formState.isSubmitting}
            className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            Create subject
          </button>
        </form>
      )}

      {isLoading && <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          Couldn&apos;t load subjects: {error.message}
        </p>
      )}

      {subjects && subjects.length === 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-400">No subjects yet.</p>
      )}

      {subjects && subjects.length > 0 && (
        <ul className="space-y-3">
          {subjects.map((subject) => (
            <li key={subject.id} className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
              <Link href={`/schemes-of-work?subjectId=${subject.id}`} className="font-medium hover:underline">
                {subject.name}
              </Link>
              {subject.gradeLevel && (
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{subject.gradeLevel}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
