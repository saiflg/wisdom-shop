"use client";

import { useTranslation } from "@/lib/i18n/i18n-provider";

/**
 * The heading and the waiting line on the setup page, in the reader's
 * language.
 *
 * A client component for the same reason as LoginHeading: the language is a
 * browser fact, held in localStorage because it belongs to the person rather
 * than the request, and the server cannot know it while rendering.
 */
export function OnboardingHeading() {
  const { t } = useTranslation();

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">{t("onboarding.pageTitle")}</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{t("onboarding.pageIntro")}</p>
    </>
  );
}

export function OnboardingLoading() {
  const { t } = useTranslation();
  return <p className="mt-8 text-sm text-slate-600 dark:text-slate-400">{t("common.loading")}</p>;
}
