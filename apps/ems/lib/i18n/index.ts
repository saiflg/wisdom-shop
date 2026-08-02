import { en, type Dictionary, type TranslationKey } from "./locales/en";
import { fr } from "./locales/fr";

export type { Dictionary, TranslationKey };

export const LOCALES = ["en", "fr"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Endonyms — a language list is far more usable in its own language. */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  fr: "Français",
};

const DICTIONARIES: Record<Locale, Partial<Dictionary>> = { en, fr };

/** English is the fallback, so it is complete by definition. */
export function isComplete(locale: Locale): boolean {
  const dictionary = DICTIONARIES[locale];
  return Object.keys(en).every((key) => key in dictionary);
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * Resolves one key, falling back to English when the active locale hasn't
 * translated it. `vars` interpolates `{name}` placeholders.
 */
export function translate(locale: Locale, key: TranslationKey, vars?: Record<string, string | number>): string {
  const raw = DICTIONARIES[locale]?.[key] ?? en[key];
  if (!vars) return raw;
  return Object.entries(vars).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    raw as string,
  );
}
