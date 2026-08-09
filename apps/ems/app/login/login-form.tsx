"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiFetch } from "@/lib/api";
import { describeSignInError } from "@/lib/sign-in-errors";
import { useAuthStore, type SessionUser } from "@/store/auth-store";
import { FormField } from "@/components/form-field";

const loginSchema = z.object({
  schoolSlug: z.string().min(1, "Enter your school's identifier"),
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginValues = z.infer<typeof loginSchema>;

/**
 * `schoolKnown` means the page already identified the school — from the
 * hostname, or from a slug in the link that brought you here. The field is
 * then carried as a hidden value rather than dropped: the API still requires
 * it, because a hostname is not something it will take anyone's word for.
 */
export function LoginForm({
  defaultSchoolSlug,
  schoolKnown = false,
}: { defaultSchoolSlug?: string; schoolKnown?: boolean } = {}) {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { schoolSlug: defaultSchoolSlug },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const result = await apiFetch<{ accessToken: string; user: SessionUser }>("/v1/auth/login", {
        method: "POST",
        csrf: true,
        body: values,
      });
      setSession(result.accessToken, result.user);
      // A student or parent lands on their own page; the dashboard is an
      // administrator's overview and means very little to a family.
      const isStaff = result.user.roles.some(
        (role: string) => role === "SCHOOL_ADMIN" || role === "TEACHER",
      );
      router.push(isStaff ? "/dashboard" : "/my");
      router.refresh();
    } catch (error) {
      setFormError(describeSignInError(error, "Incorrect school, email or password."));
    }
  });

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
      {schoolKnown ? (
        <input type="hidden" {...form.register("schoolSlug")} />
      ) : (
        <FormField
          label="School identifier"
          autoComplete="organization"
          hint="The identifier your school was given at setup"
          error={form.formState.errors.schoolSlug?.message}
          {...form.register("schoolSlug")}
        />
      )}
      <FormField
        label="Email"
        type="email"
        autoComplete="email"
        error={form.formState.errors.email?.message}
        {...form.register("email")}
      />
      <FormField
        label="Password"
        type="password"
        autoComplete="current-password"
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
        className="w-full rounded-lg bg-brand-gradient px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
      >
        {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
