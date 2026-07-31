import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = {
  title: "Create an account — Wisdom Shop",
  description: "Create a Wisdom Shop account to buy books, courses, and educational software.",
};

export default function RegisterPage() {
  return (
    <main className="min-h-screen">
      <SiteHeader />
      <section className="mx-auto w-full max-w-md px-6 py-16">
        <h1 className="text-3xl font-bold tracking-tight">Create your account</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          One account for books, courses, software, and equipment.
        </p>

        <RegisterForm />

        <p className="mt-6 text-sm text-slate-600 dark:text-slate-400">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-brand-600 hover:underline dark:text-brand-400">
            Sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
