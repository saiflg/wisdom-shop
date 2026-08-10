"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import { useStudents, useCreateStudent } from "@/lib/use-students";
import { FormField } from "@/components/form-field";
import { DataExchangeBar } from "@/components/data-exchange-bar";

const createStudentSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  studentCode: z.string().optional(),
});

type CreateStudentValues = z.infer<typeof createStudentSchema>;

export default function StudentsPage() {
  const { data: students, isLoading, error } = useStudents();
  const createStudent = useCreateStudent();
  const [formError, setFormError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const form = useForm<CreateStudentValues>({ resolver: zodResolver(createStudentSchema) });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await createStudent.mutateAsync(values);
      form.reset();
      setShowForm(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Couldn't create that student.");
    }
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Students</h1>

      {/* One toolbar: sample spreadsheet, export, bulk upload and "add one",
          in that order. Somebody enrolling a new intake should not have to
          discover that bulk import lives on a different screen. */}
      <DataExchangeBar entity="students">
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-full bg-brand-gradient px-4 py-1.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          {showForm ? "Cancel" : "New student"}
        </button>
      </DataExchangeBar>

      {showForm && (
        <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
          <FormField label="First name" error={form.formState.errors.firstName?.message} {...form.register("firstName")} />
          <FormField label="Last name" error={form.formState.errors.lastName?.message} {...form.register("lastName")} />
          <FormField
            label="Student code (optional)"
            error={form.formState.errors.studentCode?.message}
            {...form.register("studentCode")}
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
            Create student
          </button>
        </form>
      )}

      {isLoading && <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          Couldn&apos;t load students: {error.message}
        </p>
      )}

      {students && students.length === 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-400">No students yet.</p>
      )}

      {students && students.length > 0 && (
        <ul className="space-y-3">
          {students.map((student) => (
            <li key={student.id} className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
              <Link href={`/students/${student.id}`} className="font-medium hover:underline">
                {student.user.firstName} {student.user.lastName}
              </Link>
              {student.studentCode && (
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Code: {student.studentCode}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
