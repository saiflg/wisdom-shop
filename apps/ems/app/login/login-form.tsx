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

      /*
       * Remember which school to paint the console in.
       *
       * Branding is resolved from the hostname, with the middleware's
       * `wisdom-school` cookie as the fallback for deployments where schools
       * have no subdomain of their own. That cookie is only ever set by
       * arriving through a link that names the school — so anybody who
       * simply opened /login and typed their school in the form signed into
       * a console with no name, no logo and the default blue, which is the
       * unbranded face of somebody else's product.
       *
       * Written from the *authenticated* response rather than from the form,
       * so it is the school the server agreed this account belongs to. That
       * is strictly safer than the query-parameter path this cookie already
       * accepts, which any link can set: the slug picks a public face and
       * never an identity, and here it cannot even pick a face the signed-in
       * user has no business seeing.
       */
      if (result.user.schoolSlug) {
        const oneYear = 60 * 60 * 24 * 365;
        document.cookie =
          `wisdom-school=${encodeURIComponent(result.user.schoolSlug)}` +
          `; path=/; max-age=${oneYear}; samesite=lax`;
      }

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
