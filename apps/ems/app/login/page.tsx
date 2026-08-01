import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in — Wisdom Campus",
  description: "Sign in to your school's Wisdom Campus dashboard.",
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: { schoolSlug?: string };
}) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-md px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        Sign in to manage your school&apos;s classes, students and teachers.
      </p>
      <LoginForm defaultSchoolSlug={searchParams.schoolSlug} />
    </main>
  );
}
