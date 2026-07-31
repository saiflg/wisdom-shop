"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import { FormField } from "@/components/form-field";
import { useChangePassword } from "@/lib/use-account";
import { useAuthStore } from "@/store/auth-store";

// Mirrors ChangePasswordDto on the API.
const schema = z
  .object({
    currentPassword: z.string().min(1, "Required"),
    newPassword: z
      .string()
      .min(10, "Use at least 10 characters")
      .max(128)
      .regex(/[a-z]/, "Include a lowercase letter")
      .regex(/[A-Z]/, "Include an uppercase letter")
      .regex(/\d/, "Include a number")
      .regex(/[^\w\s]/, "Include a symbol"),
    confirmPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type Values = z.infer<typeof schema>;

export function ChangePasswordForm() {
  const router = useRouter();
  const clearSession = useAuthStore((s) => s.clearSession);
  const changePassword = useChangePassword();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await changePassword.mutateAsync({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      // The API revokes every refresh token on password change, so the
      // session here is deliberately dead — send the user back to sign in
      // rather than leaving them with a token that will fail on next use.
      clearSession();
      router.push("/login?passwordChanged=1");
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? "Your current password is incorrect."
          : err instanceof ApiError
            ? err.message
            : "Couldn't change your password. Please try again.",
      );
    }
  });

  return (
    <section>
      <h2 className="text-lg font-semibold">Change password</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Changing your password signs you out of every device.
      </p>

      <form onSubmit={onSubmit} className="mt-4 max-w-md space-y-4" noValidate>
        <FormField
          label="Current password"
          type="password"
          autoComplete="current-password"
          error={form.formState.errors.currentPassword?.message}
          {...form.register("currentPassword")}
        />
        <FormField
          label="New password"
          type="password"
          autoComplete="new-password"
          hint="At least 10 characters, with upper and lowercase letters, a number, and a symbol."
          error={form.formState.errors.newPassword?.message}
          {...form.register("newPassword")}
        />
        <FormField
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          error={form.formState.errors.confirmPassword?.message}
          {...form.register("confirmPassword")}
        />

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={form.formState.isSubmitting}
          className="rounded-lg bg-brand-gradient px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {form.formState.isSubmitting ? "Changing…" : "Change password"}
        </button>
      </form>
    </section>
  );
}
