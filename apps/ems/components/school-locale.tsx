"use client";

import { useEffect } from "react";
import { useBranding } from "@/lib/branding-context";
import { useTranslation } from "@/lib/i18n/i18n-provider";

/**
 * Applies the school's default language.
 *
 * Renders nothing. It exists because the school's default arrives with the
 * branding — resolved once on the server from the request's hostname — while
 * the language lives in a client context that must read localStorage in an
 * effect to avoid a hydration mismatch. This is the one line that joins them.
 *
 * A no-op for anybody who has chosen a language for themselves; the provider
 * enforces that rather than trusting this caller.
 */
export function SchoolLocale() {
  const branding = useBranding();
  const { applySchoolDefault } = useTranslation();
  const schoolDefault = branding?.defaultLocale;

  useEffect(() => {
    applySchoolDefault(schoolDefault);
  }, [applySchoolDefault, schoolDefault]);

  return null;
}
