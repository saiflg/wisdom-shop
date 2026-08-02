"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore, type SessionUser } from "@/store/auth-store";
import { FormField } from "@/components/form-field";

const schema = z.object({
  schoolName: z.string().min(1, "School name is required"),
  schoolSlug: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/, "Lowercase letters, digits and hyphens only (3-32 chars)"),
  adminEmail: z.string().email("Enter a valid email address"),
  adminPassword: z
    .string()
    .min(10, "At least 10 characters")
    .regex(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s])/, "Needs an uppercase letter, lowercase letter, number, and symbol"),
  adminFirstName: z.string().min(1, "First name is required"),
  adminLastName: z.string().min(1, "Last name is required"),
});

type FormValues = z.infer<typeof schema>;

type OnboardResponse =
  | { alreadyOnboarded: true; schoolSlug: string }
  | { alreadyOnboarded: false; accessToken: string; user: SessionUser };

const shopUrl = process.env.NEXT_PUBLIC_SHOP_URL ?? "http://localhost:3000";

export function OnboardingForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const setSession = useAuthStore((s) => s.setSession);

  const [formError, setFormError] = useState<string | null>(null);
  const [alreadyOnboardedSlug, setAlreadyOnboardedSlug] = useState<string | null>(null);

  const form = useForm<FormValues>({ resolver: zodResolver(schema) });

  if (!token) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
        <p className="font-medium">This page needs a School Setup link</p>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Go to your Wisdom Shop account and click &quot;Complete Your School Setup&quot; on your license.
        </p>
        <a
          href={`${shopUrl}/account/licenses`}
          className="mt-4 inline-block rounded-full bg-brand-gradient px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Go to your licenses
        </a>
      </div>
    );
  }

  if (alreadyOnboardedSlug) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
        <p className="font-medium">This school is already set up</p>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Sign in with your school identifier <strong>{alreadyOnboardedSlug}</strong> to continue.
        </p>
        <a
          href={`/login?schoolSlug=${encodeURIComponent(alreadyOnboardedSlug)}`}
          className="mt-4 inline-block rounded-full bg-brand-gradient px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Sign in
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
        error instanceof ApiError ? error.message : "Couldn't set up your school. Please try again.",
      );
    }
  });

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
      <FormField
        label="School name"
        error={form.formState.errors.schoolName?.message}
        {...form.register("schoolName")}
      />
      <FormField
        label="School identifier"
        hint="Lowercase letters, digits and hyphens — this is what you&apos;ll use to sign in"
        placeholder="my-school"
        error={form.formState.errors.schoolSlug?.message}
        {...form.register("schoolSlug")}
      />
      <FormField
        label="Your first name"
        error={form.formState.errors.adminFirstName?.message}
        {...form.register("adminFirstName")}
      />
      <FormField
        label="Your last name"
        error={form.formState.errors.adminLastName?.message}
        {...form.register("adminLastName")}
      />
      <FormField
        label="Your email"
        type="email"
        error={form.formState.errors.adminEmail?.message}
        {...form.register("adminEmail")}
      />
      <FormField
        label="Choose a password"
        type="password"
        hint="Min 10 chars, upper/lower/number/symbol"
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
        {form.formState.isSubmitting ? "Setting up your school…" : "Complete setup"}
      </button>
    </form>
  );
}
