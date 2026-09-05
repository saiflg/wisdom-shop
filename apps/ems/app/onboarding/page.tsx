import { Suspense } from "react";
import type { Metadata } from "next";
import { OnboardingForm } from "./onboarding-form";
import { OnboardingHeading, OnboardingLoading } from "./onboarding-heading";

export const metadata: Metadata = {
  title: "Complete Your School Setup — Wisdom Campus",
  description: "Finish setting up your school after buying a School Management System license.",
};

export default function OnboardingPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-md px-6 py-16">
      <OnboardingHeading />
      {/* useSearchParams (for the handoff token) opts a client component out
          of static rendering unless it's inside a Suspense boundary. */}
      <Suspense fallback={<OnboardingLoading />}>
        <OnboardingForm />
      </Suspense>
    </main>
  );
}
