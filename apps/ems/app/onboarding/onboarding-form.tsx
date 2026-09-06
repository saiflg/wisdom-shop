"use client";

import { useMemo, useState } from "react";
import type { TranslationKey } from "@/lib/i18n";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore, type SessionUser } from "@/store/auth-store";
import { FormField } from "@/components/form-field";
import { useTranslation } from "@/lib/i18n/i18n-provider";

function schemaFor(t: (key: TranslationKey) => string) {
  return z.object({
    schoolName: z.string().min(1, t("valid.schoolNameRequired")),
    schoolSlug: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/, t("valid.slugRules")),
    adminEmail: z.string().email(t("valid.emailInvalid")),
    adminPassword: z
      .string()
      .min(10, t("valid.passwordLength"))
      .regex(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s])/, t("valid.passwordStrength")),
    adminFirstName: z.string().min(1, t("valid.firstNameRequired")),
    adminLastName: z.string().min(1, t("valid.lastNameRequired")),
  });
}

type FormValues = z.infer<ReturnType<typeof schemaFor>>;

type OnboardResponse =
  | { alreadyOnboarded: true; schoolSlug: string }
  | { alreadyOnboarded: false; accessToken: string; user: SessionUser };

const shopUrl = process.env.NEXT_PUBLIC_SHOP_URL ?? "http://localhost:3000";

export function OnboardingForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const setSession = useAuthStore((s) => s.setSession);

  const [formError, setFormError] = useState<string | null>(null);
  const [alreadyOnboardedSlug, setAlreadyOnboardedSlug] = useState<string | null>(null);

  const schema = useMemo(() => schemaFor(t), [t]);
  const form = useForm<FormValues>({ resolver: zodResolver(schema) });

  if (!token) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
        <p className="font-medium">{t("onboarding.needsLink")}</p>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          {t("onboarding.needsLinkHint")}
        </p>
        <a
          href={`${shopUrl}/account/licenses`}
          className="mt-4 inline-block rounded-full bg-brand-gradient px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          {t("onboarding.goToLicenses")}
        </a>
      </div>
    );
  }

  if (alreadyOnboardedSlug) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
        <p className="font-medium">{t("onboarding.alreadySetUp")}</p>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          {t("onboarding.signInWith", { slug: alreadyOnboardedSlug })}
        </p>
        <a
          href={`/login?schoolSlug=${encodeURIComponent(alreadyOnboardedSlug)}`}
          className="mt-4 inline-block rounded-full bg-brand-gradient px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          {t("onboarding.signIn")}
        </a>
      </div>
    );
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const result = await apiFetch<OnboardResponse>("/v1/onboarding/from-license", {
        method: "POST",
        csrf: true,
        body: { token, ...values },
      });

      if (result.alreadyOnboarded) {
        setAlreadyOnboardedSlug(result.schoolSlug);
        return;
      }

      setSession(result.accessToken, result.user);
      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : t("errs.setUpSchool"),
      );
    }
  });

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
      <FormField
        label={t("onboarding.schoolName")}
        error={form.formState.errors.schoolName?.message}
        {...form.register("schoolName")}
      />
      <FormField
        label={t("onboarding.schoolSlug")}
        hint={t("onboarding.schoolSlugHint")}
        placeholder="my-school"
        error={form.formState.errors.schoolSlug?.message}
        {...form.register("schoolSlug")}
      />
      <FormField
        label={t("onboarding.firstName")}
        error={form.formState.errors.adminFirstName?.message}
        {...form.register("adminFirstName")}
      />
      <FormField
        label={t("onboarding.lastName")}
        error={form.formState.errors.adminLastName?.message}
        {...form.register("adminLastName")}
      />
      <FormField
        label={t("onboarding.email")}
        type="email"
        error={form.formState.errors.adminEmail?.message}
        {...form.register("adminEmail")}
      />
      <FormField
        label={t("onboarding.password")}
        type="password"
        hint={t("onboarding.passwordHint")}
        error={form.formState.errors.adminPassword?.message}
        {...form.register("adminPassword")}
      />
      {formError && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {formError}
        </p>
      )}
      <button
        type="submit"
        disabled={form.formState.isSubmitting}
        className="w-full rounded-lg bg-brand-gradient px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
      >
        {form.formState.isSubmitting ? t("onboarding.settingUp") : t("onboarding.completeSetup")}
      </button>
    </form>
  );
}
