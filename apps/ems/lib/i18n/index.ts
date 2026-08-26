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

/**
 * Resolves a key that reads differently for one thing and for several.
 *
 * A fixed string put "1 invoices raised" on the fee structures screen. The
 * naive fix — appending an "s" — is wrong in French, where zero takes the
 * singular ("0 facture émise") while English takes the plural, so the
 * decision is left to `Intl.PluralRules`, which already knows every locale
 * this app might add.
 *
 * Keys are `<base>_one` and `<base>_other`. Categories a locale uses but
 * this app has not written ("few", "many") fall back to `_other` rather
 * than rendering a missing key.
 */
export function translatePlural(
  locale: Locale,
  base: string,
  count: number,
  vars?: Record<string, string | number>,
): string {
  const category = new Intl.PluralRules(locale).select(count);
  const specific = `${base}_${category}` as TranslationKey;
  const fallback = `${base}_other` as TranslationKey;
  // English is the fallback dictionary, so a category is "written" if
  // either the active locale or English has it.
  const written = Boolean(DICTIONARIES[locale]?.[specific] ?? en[specific]);
  return translate(locale, written ? specific : fallback, { count, ...vars });
}
