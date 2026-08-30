"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { errorMessage } from "@/lib/api";
import { EMPLOYMENT_TYPES, useRegisterStaff, type RegisterStaffInput } from "@/lib/use-staff";
import { EMPLOYMENT_LABELS } from "@/lib/staff-directory";
import { FormField } from "@/components/form-field";
import { useTranslation } from "@/lib/i18n/i18n-provider";
import type { TranslationKey } from "@/lib/i18n";

const schema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Enter a valid email address"),
  password: z
    .string()
    .min(10, "At least 10 characters")
    .regex(
      /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s])/,
      "Needs an uppercase letter, lowercase letter, number, and symbol",
    ),
  role: z.enum(["TEACHER", "SCHOOL_ADMIN"]),
  staffNumber: z.string().max(40).optional(),
  jobTitle: z.string().max(120).optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional().or(z.literal("")),
  startDate: z.string().optional(),
});

type Values = z.infer<typeof schema>;

/** Empty strings are how a browser reports an untouched field; the API wants them gone. */
function toInput(values: Values): RegisterStaffInput {
  return {
    email: values.email.trim(),
    password: values.password,
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    role: values.role,
    ...(values.staffNumber?.trim() ? { staffNumber: values.staffNumber.trim() } : {}),
    ...(values.jobTitle?.trim() ? { jobTitle: values.jobTitle.trim() } : {}),
    ...(values.employmentType ? { employmentType: values.employmentType } : {}),
    ...(values.startDate ? { startDate: values.startDate } : {}),
  };
}

export default function RegisterStaffPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const register = useRegisterStaff();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { role: "TEACHER" },
  });

  const role = form.watch("role");

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const member = await register.mutateAsync(toInput(values));
      // Straight to their record: bank details are the next thing anybody
      // wants, and they are deliberately not on this form.
      router.push(`/staff/${member.id}`);
    } catch (err) {
      setFormError(errorMessage(err, "Couldn't register that staff member."));
    }
  });

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/staff" className="text-sm font-semibold text-brand-600 hover:underline">
          ← Staff directory
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{t("staffNew.title")}</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {t("staffNew.intro")}
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-5 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t("staffNew.firstName")} error={form.formState.errors.firstName?.message} {...form.register("firstName")} />
          <FormField label={t("staffNew.lastName")} error={form.formState.errors.lastName?.message} {...form.register("lastName")} />
        </div>

        <FormField label={t("staffNew.email")} type="email" error={form.formState.errors.email?.message} {...form.register("email")} />
        <FormField
          label={t("staffNew.firstPassword")}
          type="password"
          hint={t("staffNew.passwordHint")}
          error={form.formState.errors.password?.message}
          {...form.register("password")}
        />

        <div>
          <label htmlFor="role" className="block text-sm font-medium">
            {t("staffNew.role")}
          </label>
          <select
            id="role"
            {...form.register("role")}
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="TEACHER">{t("staffNew.roleTeacher")}</option>
            <option value="SCHOOL_ADMIN">{t("staffNew.roleAdmin")}</option>
          </select>
          {role === "SCHOOL_ADMIN" && (
            <p className="mt-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              {t("staffNew.adminWarning")}
            </p>
          )}
        </div>

        <fieldset className="space-y-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Employment (optional)
          </legend>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label={t("staffNew.staffNumber")}
              hint={t("staffNew.staffNumberHint")}
              error={form.formState.errors.staffNumber?.message}
              {...form.register("staffNumber")}
            />
            <FormField label={t("staffNew.jobTitle")} error={form.formState.errors.jobTitle?.message} {...form.register("jobTitle")} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="employmentType" className="block text-sm font-medium">
                {t("staffNew.employmentType")}
              </label>
              <select
                id="employmentType"
                {...form.register("employmentType")}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="">{t("staffNew.notStated")}</option>
                {EMPLOYMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {EMPLOYMENT_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
            <FormField
              label={t("staffNew.startDate")}
              type="date"
              error={form.formState.errors.startDate?.message}
              {...form.register("startDate")}
            />
          </div>
        </fieldset>

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
          {form.formState.isSubmitting ? t("staffNew.registering") : t("staffNew.register")}
        </button>
      </form>
    </div>
  );
}
