"use client";

import { useState, useMemo } from "react";
import type { TranslationKey } from "@/lib/i18n";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import { useClasses, useCreateClass } from "@/lib/use-classes";
import { useIsSchoolAdmin } from "@/lib/use-can-author";
import { FormField } from "@/components/form-field";
import { DataExchangeBar } from "@/components/data-exchange-bar";
import { useTranslation } from "@/lib/i18n/i18n-provider";

function createClassSchemaFor(t: (key: TranslationKey) => string) {
  return z.object({
    name: z.string().min(1, t("valid.nameRequired")),
    gradeLevel: z.string().optional(),
    academicYear: z.string().min(1, t("valid.yearRequired")),
  });
}

type CreateClassValues = z.infer<ReturnType<typeof createClassSchemaFor>>;

export default function ClassesPage() {
  const { t } = useTranslation();
  const schema = useMemo(() => createClassSchemaFor(t), [t]);
  const { data: classes, isLoading, error } = useClasses();
  const createClass = useCreateClass();
  const isSchoolAdmin = useIsSchoolAdmin();
  const [formError, setFormError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const form = useForm<CreateClassValues>({ resolver: zodResolver(schema) });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await createClass.mutateAsync(values);
      form.reset();
      setShowForm(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t("classes.createFailed"));
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{t("classes.title")}</h1>
        {/* A student opens this page to find their own class and its
            classmates. Creating one is an administrator's job. */}
        {isSchoolAdmin && (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          >
            {showForm ? t("common.cancel") : t("classes.new")}
          </button>
        )}
      </div>

      <DataExchangeBar entity="classes" />

      {isSchoolAdmin && showForm && (
        <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
          <FormField label={t("classes.name")} placeholder={t("classes.namePlaceholder")} error={form.formState.errors.name?.message} {...form.register("name")} />
          <FormField
            label={t("classes.gradeLevel")}
            placeholder={t("shared.gradePlaceholder")}
            error={form.formState.errors.gradeLevel?.message}
            {...form.register("gradeLevel")}
          />
          <FormField
            label={t("classes.academicYear")}
            placeholder="2026-2027"
            error={form.formState.errors.academicYear?.message}
            {...form.register("academicYear")}
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
            {t("classes.create")}
          </button>
        </form>
      )}

      {isLoading && <p className="text-sm text-slate-600 dark:text-slate-400">{t("common.loading")}</p>}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          Couldn&apos;t load classes: {error.message}
        </p>
      )}

      {classes && classes.length === 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-400">{t("classes.none")}</p>
      )}

      {classes && classes.length > 0 && (
        <ul className="space-y-3">
          {classes.map((klass) => (
            <li key={klass.id} className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
              <Link href={`/classes/${klass.id}`} className="font-medium hover:underline">
                {klass.name}
              </Link>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {klass.gradeLevel ? `${klass.gradeLevel} · ` : ""}
                {klass.academicYear}
                {klass.homeroomTeacher && ` · ${klass.homeroomTeacher.firstName} ${klass.homeroomTeacher.lastName}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
