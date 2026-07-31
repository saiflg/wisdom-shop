"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuthStore, type SessionUser } from "@/store/auth-store";
import { FormField } from "@/components/form-field";

// Mirrors the API's RegisterDto (apps/api/src/auth/dto/register.dto.ts) so
// users get inline feedback instead of a round-trip 400. The API remains
// the authority — this is convenience, not the real validation boundary.
const registerSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  email: z.string().email("Enter a valid email address").max(255),
  password: z
    .string()
    .min(10, "Use at least 10 characters")
    .max(128)
    .regex(/[a-z]/, "Include a lowercase letter")
    .regex(/[A-Z]/, "Include an uppercase letter")
    .regex(/\d/, "Include a number")
    .regex(/[^\w\s]/, "Include a symbol"),
  phone: z
    .string()
    .regex(/^\+?[1-9]\d{6,14}$/, "Enter a valid phone number, e.g. +2348012345678")
    .optional()
    .or(z.literal("")),
});

type RegisterValues = z.infer<typeof registerSchema>;

export function RegisterForm() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const result = await apiFetch<{ accessToken: string; user: SessionUser }>("/v1/auth/register", {
        method: "POST",
        csrf: true,
        body: {
          firstName: values.firstName,
          lastName: values.lastName,
          email: values.email,
          password: values.password,
          // Omit rather than send "" — the API treats phone as optional but
          // validates the format whenever the key is present.
          ...(values.phone ? { phone: values.phone } : {}),
        },
      });
      setSession(result.accessToken, result.user);
      router.push("/");
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        form.setError("email", { message: "An account with this email already exists" });
        return;
      }
      setFormError(
        error instanceof ApiError && error.status === 400
          ? error.message
          : "Something went wrong creating your account. Please try again.",
      );
    }
  });

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField
          label="First name"
          autoComplete="given-name"
          error={form.formState.errors.firstName?.message}
          {...form.register("firstName")}
        />
        <FormField
          label="Last name"
          autoComplete="family-name"
          error={form.formState.errors.lastName?.message}
          {...form.register("lastName")}
        />
      </div>
      <FormField
        label="Email"
        type="email"
        autoComplete="email"
        error={form.formState.errors.email?.message}
        {...form.register("email")}
      />
      <FormField
        label="Phone (optional)"
        type="tel"
        autoComplete="tel"
        error={form.formState.errors.phone?.message}
        {...form.register("phone")}
      />
      <FormField
        label="Password"
        type="password"
        autoComplete="new-password"
        hint="At least 10 characters, with upper and lowercase letters, a number, and a symbol."
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
        {form.formState.isSubmitting ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
