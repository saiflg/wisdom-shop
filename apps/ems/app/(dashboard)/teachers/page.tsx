"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import { useTeachers, useCreateTeacher } from "@/lib/use-teachers";
import { FormField } from "@/components/form-field";

const createTeacherSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Enter a valid email address"),
  password: z
    .string()
    .min(10, "At least 10 characters")
    .regex(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s])/, "Needs an uppercase letter, lowercase letter, number, and symbol"),
});

type CreateTeacherValues = z.infer<typeof createTeacherSchema>;

export default function TeachersPage() {
  const { data: teachers, isLoading, error } = useTeachers();
  const createTeacher = useCreateTeacher();
  const [formError, setFormError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const form = useForm<CreateTeacherValues>({ resolver: zodResolver(createTeacherSchema) });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await createTeacher.mutateAsync(values);
      form.reset();
      setShowForm(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Couldn't create that teacher.");
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Teachers</h1>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          {showForm ? "Cancel" : "New teacher"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
          <FormField label="First name" error={form.formState.errors.firstName?.message} {...form.register("firstName")} />
          <FormField label="Last name" error={form.formState.errors.lastName?.message} {...form.register("lastName")} />
          <FormField label="Email" type="email" error={form.formState.errors.email?.message} {...form.register("email")} />
          <FormField
            label="Password"
            type="password"
            hint="Min 10 chars, upper/lower/number/symbol"
            error={form.formState.errors.password?.message}
            {...form.register("password")}
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
            Create teacher
          </button>
        </form>
      )}

      {isLoading && <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          Couldn&apos;t load teachers: {error.message}
        </p>
      )}

      {teachers && teachers.length === 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-400">No teachers yet.</p>
      )}

      {teachers && teachers.length > 0 && (
        <ul className="space-y-3">
          {teachers.map((teacher) => (
            <li key={teacher.id} className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
              <p className="font-medium">
                {teacher.firstName} {teacher.lastName}
              </p>
              {teacher.email && <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{teacher.email}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
