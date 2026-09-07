/**
 * Numbers and dates in the reader's language.
 *
 * Two things this exists to get right.
 *
 * The first is that `"ar"` on its own does NOT give Arabic-Indic digits.
 * ICU resolves it to the `latn` numbering system, so `toLocaleString("ar")`
 * returns "450,000.50" — the Latin digits an English reader sees. The Arabic
 * numerals a reader of Arabic expects need the numbering system named
 * explicitly, which is what `ar-u-nu-arab` does: ٤٥٠٬٠٠٠٫٥٠.
 *
 * The second is money. Every formatter in this app deliberately works in
 * minor units and never divides by 100, because — as the comment on the
 * original put it — `Number(cents) / 100` is how a total drifts. That rule
 * survives here: the major part is formatted as an integer, and only the two
 * minor digits, which can only ever be 00 to 99, go through a fraction.
 */

import { DEFAULT_LOCALE, type Locale } from "./index";

/**
 * The locale to format numbers and dates with, which is not always the
 * locale the reader chose.
 */
export function formattingLocale(locale: string): string {
  return locale === "ar" ? "ar-u-nu-arab" : locale || DEFAULT_LOCALE;
}

/**
 * Minor units to a display string, in the reader's digits.
 *
 * The currency is placed before the amount and is passed through as the
 * school wrote it: "NGN" and "₦" are both things a school uses, and neither
 * is ours to translate.
 */
export function formatMinorUnits(locale: string, cents: number, currency?: string): string {
  const forFormatting = formattingLocale(locale);
  const negative = cents < 0;
  const absolute = Math.abs(cents);
  const major = Math.trunc(absolute / 100);
  const minor = absolute % 100;

  const majorText = major.toLocaleString(forFormatting);
  // "0.50" in English, "٠٫٥٠" in Arabic. Dropping the first character leaves
  // the decimal separator and the two minor digits already in the right
  // script — a value below one always has exactly one integer digit.
  const fraction = (minor / 100).toLocaleString(forFormatting, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const amount = `${majorText}${fraction.slice(1)}`;
  const signed = negative ? `-${amount}` : amount;
  return currency ? `${currency} ${signed}` : signed;
}

/** A whole number in the reader's digits — counts, percentages, page numbers. */
export function formatCount(locale: string, value: number): string {
  return value.toLocaleString(formattingLocale(locale));
}

export function formatDate(locale: string, iso: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const date = iso instanceof Date ? iso : new Date(iso);
  return date.toLocaleDateString(formattingLocale(locale), options);
}

export function formatDateTime(locale: string, iso: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const date = iso instanceof Date ? iso : new Date(iso);
  return date.toLocaleString(formattingLocale(locale), options);
}

export type { Locale };
