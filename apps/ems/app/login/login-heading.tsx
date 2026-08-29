"use client";

import { useTranslation } from "@/lib/i18n/i18n-provider";

/**
 * The unbranded greeting on the sign-in page, in the reader's language.
 *
 * A client component for one reason: the language is a browser fact. It lives
 * in localStorage because it belongs to the person, not the request, and the
 * server has no way to know it while rendering. Leaving this on the server
 * meant an Arabic reader got a right-to-left page whose heading was still
 * English — the layout flipped and the words did not, which looks more broken
 * than either would alone.
 *
 * Only the generic greeting. A school that has set its own name and tagline
 * gets those instead, rendered on the server, and they are the school's own
 * words in whatever language the school wrote them — not ours to translate.
 */
export function LoginHeading() {
  const { t } = useTranslation();

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">{t("login.title")}</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{t("login.subtitle")}</p>
    </>
  );
}
