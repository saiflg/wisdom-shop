import { Suspense } from "react";
import type { Metadata } from "next";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = {
  title: "Complete Your School Setup — Wisdom Campus",
  description: "Finish setting up your school after buying a School Management System license.",
};

export default function OnboardingPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-md px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Set up your school</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        Your purchase is verified — choose your school&apos;s details and your own admin login below.
      </p>
      {/* useSearchParams (for the handoff token) opts a client component out
          of static rendering unless it's inside a Suspense boundary. */}
      <Suspense fallback={<p className="mt-8 text-sm text-slate-600 dark:text-slate-400">Loading…</p>}>
        <OnboardingForm />
      </Suspense>
    </main>
  );
}
