/**
 * Which language the console speaks.
 *
 * Three answers compete: what this person chose, what the school set, and
 * what the software ships with. They are resolved in that order — a school
 * default is a default, not an instruction, and a teacher who switched to
 * French must not be switched back every morning because the office prefers
 * English.
 *
 * Pure, so the precedence can be argued with in a test rather than by
 * changing a setting and logging in as somebody else.
 */

/**
 * Kept in step with apps/ems/lib/i18n by hand, deliberately.
 *
 * The alternative is the API importing the console's translation files,
 * which would make the server depend on the browser bundle to answer a
 * question about a database column. Adding to the list is a
 * deliberate act in both places; a test asserts the shapes match.
 */
export const SUPPORTED_LOCALES = ["en", "ar", "fr", "ha", "tr"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  ar: "العربية",
  fr: "Français",
  ha: "Hausa",
  tr: "Türkçe",
};

/** The language's own name, not its English name — a French speaker looks for "Français". */
export function localeName(locale: string): string {
  return LOCALE_NAMES[locale as Locale] ?? locale;
}

export function isSupportedLocale(value: string | null | undefined): value is Locale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * Normalises what a browser or an old row might contain.
 *
 * Accepts "en-GB" and "FR" as the languages they plainly are, because a
 * console that falls back to English for a French browser sending "fr-CA"
 * is worse than one that does not translate at all.
 */
export function normaliseLocale(value: string | null | undefined): Locale | null {
  if (!value) return null;
  const base = value.trim().toLowerCase().split(/[-_]/)[0];
  return isSupportedLocale(base) ? base : null;
}

/**
 * The language to render in.
 *
 * A locale that is no longer supported — a school set it, and the language
 * was later withdrawn — falls through rather than breaking the console.
 */
export function resolveLocale(input: {
  /** What this person chose for themselves, if anything. */
  chosen?: string | null;
  /** What the school set as its default, if anything. */
  schoolDefault?: string | null;
}): Locale {
  return normaliseLocale(input.chosen) ?? normaliseLocale(input.schoolDefault) ?? DEFAULT_LOCALE;
}

/** Why this cannot be saved, or null. */
export function localeProblem(value: string): string | null {
  if (!normaliseLocale(value)) {
    return `That language is not available. Choose one of: ${SUPPORTED_LOCALES.map(localeName).join(", ")}.`;
  }
  return null;
}

/** What a settings screen offers, in a stable order. */
export function availableLocales(): { value: Locale; label: string }[] {
  return SUPPORTED_LOCALES.map((locale) => ({ value: locale, label: LOCALE_NAMES[locale] }));
}
