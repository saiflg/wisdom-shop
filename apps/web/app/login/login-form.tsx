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
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

const twoFactorSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app"),
});

type LoginValues = z.infer<typeof loginSchema>;
type TwoFactorValues = z.infer<typeof twoFactorSchema>;

type LoginResponse =
  | { twoFactorRequired: true; challengeToken: string }
  | { twoFactorRequired: false; accessToken: string; user: SessionUser };

export function LoginForm() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [formError, setFormError] = useState<string | null>(null);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);

  const loginForm = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });
  const twoFactorForm = useForm<TwoFactorValues>({ resolver: zodResolver(twoFactorSchema) });

  function completeLogin(accessToken: string, user: SessionUser) {
    setSession(accessToken, user);
    router.push("/");
    router.refresh();
  }

  const onSubmitLogin = loginForm.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const result = await apiFetch<LoginResponse>("/v1/auth/login", {
        method: "POST",
        csrf: true,
        body: values,
      });

      if (result.twoFactorRequired) {
        setChallengeToken(result.challengeToken);
        return;
      }
      completeLogin(result.accessToken, result.user);
    } catch (error) {
      setFormError(describeSignInError(error, "Incorrect email or password."));
    }
  });

  const onSubmitTwoFactor = twoFactorForm.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const result = await apiFetch<{ accessToken: string; user: SessionUser }>("/v1/auth/login/2fa", {
        method: "POST",
        csrf: true,
        headers: { Authorization: `Bearer ${challengeToken}` },
        body: values,
      });
      completeLogin(result.accessToken, result.user);
    } catch (error) {
      setFormError(
        describeSignInError(error, "That code isn't valid. Try again, or use a recovery code."),
      );
    }
  });

  if (challengeToken) {
    return (
      <form onSubmit={onSubmitTwoFactor} className="mt-8 space-y-4" noValidate>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Enter the 6-digit code from your authenticator app. You can also use one of your recovery codes.
        </p>
        <FormField
          label="Authentication code"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          error={twoFactorForm.formState.errors.code?.message}
          {...twoFactorForm.register("code")}
        />
        {formError && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
            {formError}
          </p>
        )}
        <button
          type="submit"
          disabled={twoFactorForm.formState.isSubmitting}
          className="w-full rounded-lg bg-brand-gradient px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {twoFactorForm.formState.isSubmitting ? "Verifying…" : "Verify and sign in"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={onSubmitLogin} className="mt-8 space-y-4" noValidate>
      <FormField
        label="Email"
        type="email"
        autoComplete="email"
        error={loginForm.formState.errors.email?.message}
        {...loginForm.register("email")}
      />
      <FormField
        label="Password"
        type="password"
        autoComplete="current-password"
        error={loginForm.formState.errors.password?.message}
        {...loginForm.register("password")}
      />
      {formError && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {formError}
        </p>
      )}
      <button
        type="submit"
        disabled={loginForm.formState.isSubmitting}
        className="w-full rounded-lg bg-brand-gradient px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
      >
        {loginForm.formState.isSubmitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
