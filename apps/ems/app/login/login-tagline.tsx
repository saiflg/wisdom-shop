"use client";

import { useTranslation } from "@/lib/i18n/i18n-provider";

/**
 * A school's own tagline, or ours in the reader's language.
 *
 * The school's words are passed straight through and never translated - they
 * are that school's sentence about itself, written in whatever language the
 * school chose. Only our fallback is ours to translate, and it has to happen
 * in the browser because that is where the reader's language is known.
 */
export function LoginTagline({ tagline }: { tagline: string | null }) {
  const { t } = useTranslation();
  return (
    <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
      {tagline ?? t("login.subtitle")}
    </p>
  );
}
