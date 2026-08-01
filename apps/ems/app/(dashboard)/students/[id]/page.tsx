"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import { useStudent } from "@/lib/use-students";
import { useLinkGuardian, useUnlinkGuardian } from "@/lib/use-guardians";
import { FormField } from "@/components/form-field";

const linkGuardianSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  relationship: z.string().min(1, "Relationship is required"),
  password: z.string().optional(),
});

type LinkGuardianValues = z.infer<typeof linkGuardianSchema>;

export default function StudentDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: student, isLoading, error } = useStudent(params.id);
  const linkGuardian = useLinkGuardian();
  const unlinkGuardian = useUnlinkGuardian();
  const [formError, setFormError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const form = useForm<LinkGuardianValues>({ resolver: zodResolver(linkGuardianSchema) });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await linkGuardian.mutateAsync({ ...values, studentProfileId: params.id });
      form.reset();
      setShowForm(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Couldn't link that guardian.");
    }
  });

  if (isLoading) return <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>;
  if (error) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
        Couldn&apos;t load this student: {error.message}
      </p>
    );
  }
  if (!student) return null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {student.user.firstName} {student.user.lastName}
        </h1>
        {student.studentCode && (
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Code: {student.studentCode}</p>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold">Classes</h2>
        {student.enrollments.length === 0 && (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Not enrolled in any class yet.</p>
        )}
        {student.enrollments.length > 0 && (
          <ul className="mt-3 space-y-2">
            {student.enrollments.map((enrollment) => (
              <li key={enrollment.id} className="rounded-lg border border-slate-200 px-4 py-2 text-sm dark:border-slate-800">
                {enrollment.class.name} · {enrollment.class.academicYear}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Guardians</h2>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium transition hover:border-brand-400 dark:border-slate-700"
          >
            {showForm ? "Cancel" : "Link a guardian"}
          </button>
        </div>

        {showForm && (
          <form onSubmit={onSubmit} className="mt-3 space-y-4 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
            <FormField label="Email" type="email" error={form.formState.errors.email?.message} {...form.register("email")} />
            <p className="text-xs text-slate-500">
              If this email already belongs to a guardian, they&apos;re linked directly. Otherwise fill in the fields
              below to create a new one.
            </p>
            <FormField label="First name" error={form.formState.errors.firstName?.message} {...form.register("firstName")} />
            <FormField label="Last name" error={form.formState.errors.lastName?.message} {...form.register("lastName")} />
            <FormField
              label="Password (new guardian only)"
              type="password"
              error={form.formState.errors.password?.message}
              {...form.register("password")}
            />
            <FormField
              label="Relationship"
              placeholder="Mother"
              error={form.formState.errors.relationship?.message}
              {...form.register("relationship")}
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
              Link guardian
            </button>
          </form>
        )}

        {student.guardianLinks.length === 0 && (
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">No guardians linked yet.</p>
        )}
        {student.guardianLinks.length > 0 && (
          <ul className="mt-3 space-y-2">
            {student.guardianLinks.map((link) => (
              <li
                key={link.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-2 text-sm dark:border-slate-800"
              >
                <span>
                  {link.guardianUser.firstName} {link.guardianUser.lastName} · {link.relationship}
                </span>
                <button
                  type="button"
                  onClick={() => unlinkGuardian.mutate(link.id)}
                  disabled={unlinkGuardian.isPending}
                  className="text-red-600 hover:underline disabled:opacity-60 dark:text-red-400"
                >
                  Unlink
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
