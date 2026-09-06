"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import { useStudents, useCreateStudent } from "@/lib/use-students";
import { FormField } from "@/components/form-field";
import { DataExchangeBar } from "@/components/data-exchange-bar";
import { useBranding } from "@/lib/branding-context";
import { admissionNumberExample } from "@/lib/admission-example";
import { useTranslation } from "@/lib/i18n/i18n-provider";
import type { TranslationKey } from "@/lib/i18n";

// Built from `t` inside the component: a schema at module scope freezes its
// messages in whatever language was active at import, which is none.
function createStudentSchemaFor(t: (key: TranslationKey) => string) {
  return z.object({
    firstName: z.string().min(1, t("students.errorFirstName")),
    lastName: z.string().min(1, t("students.errorLastName")),
    studentCode: z.string().optional(),
  });
}

type CreateStudentValues = z.infer<ReturnType<typeof createStudentSchemaFor>>;

export default function StudentsPage() {
  const { t } = useTranslation();
  const { data: students, isLoading, error } = useStudents();
  const createStudent = useCreateStudent();
  const [formError, setFormError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const schema = useMemo(() => createStudentSchemaFor(t), [t]);
  const form = useForm<CreateStudentValues>({ resolver: zodResolver(schema) });

  // Shown as the example, so an administrator sees their own school's
  // letters rather than a made-up "ABC/2026/0001".
  const branding = useBranding();
  const admissionExample = admissionNumberExample(branding?.schoolName);

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await createStudent.mutateAsync(values);
      form.reset();
      setShowForm(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t("students.createFailed"));
    }
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">{t("students.title")}</h1>

      {/* One toolbar: sample spreadsheet, export, bulk upload and "add one",
          in that order. Somebody enrolling a new intake should not have to
          discover that bulk import lives on a different screen. */}
      <DataExchangeBar entity="students">
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-full bg-brand-gradient px-4 py-1.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          {showForm ? t("common.cancel") : t("students.new")}
        </button>
      </DataExchangeBar>

      {showForm && (
        <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
          <FormField label={t("students.firstName")} error={form.formState.errors.firstName?.message} {...form.register("firstName")} />
          <FormField label={t("students.lastName")} error={form.formState.errors.lastName?.message} {...form.register("lastName")} />
          {/* Left blank on purpose most of the time. A school arriving from
              paper types the number a child already carries; everyone else
              lets the office issue one, which is how a roll stops reading
              "76854433" next to "ADM-NEW-1". */}
          <div>
            <FormField
              label={t("students.admissionNumber")}
              error={form.formState.errors.studentCode?.message}
              placeholder={t("students.admissionPlaceholder")}
              {...form.register("studentCode")}
            />
            <p className="mt-1 text-xs text-slate-500">
              {t("students.admissionHint", { example: admissionExample })}
            </p>
          </div>
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
            {t("students.create")}
          </button>
        </form>
      )}

      {isLoading && <p className="text-sm text-slate-600 dark:text-slate-400">{t("common.loading")}</p>}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {t("students.loadFailed")} {error.message}
        </p>
      )}

      {students && students.length === 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-400">{t("students.none")}</p>
      )}

      {students && students.length > 0 && (
        <ul className="space-y-3">
          {students.map((student) => (
            <li key={student.id} className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
              <Link href={`/students/${student.id}`} className="font-medium hover:underline">
                {student.user.firstName} {student.user.lastName}
              </Link>
              {student.studentCode && (
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  {t("students.code")} {student.studentCode}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
