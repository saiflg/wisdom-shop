"use client";

import { useCallback } from "react";
import { useTranslation } from "./i18n-provider";
import { formatCount, formatDate, formatDateTime, formatMinorUnits } from "./formatting";

/**
 * A money formatter bound to the reader's language.
 *
 * Returned as a function rather than a string so that the ninety-odd call
 * sites already written as `money(cents)` keep working unchanged: a page
 * swaps its own module-scope helper for `const money = useMoney();` and
 * nothing below it moves.
 */
export function useMoney(): (cents: number, currency?: string) => string {
  const { locale } = useTranslation();
  return useCallback(
    (cents: number, currency?: string) => formatMinorUnits(locale, cents, currency),
    [locale],
  );
}

/** Whole numbers — counts, percentages, page numbers — in the reader's digits. */
export function useCount(): (value: number) => string {
  const { locale } = useTranslation();
  return useCallback((value: number) => formatCount(locale, value), [locale]);
}

export function useDates(): {
  date: (iso: string | Date, options?: Intl.DateTimeFormatOptions) => string;
  dateTime: (iso: string | Date, options?: Intl.DateTimeFormatOptions) => string;
} {
  const { locale } = useTranslation();
  return {
    date: useCallback((iso, options) => formatDate(locale, iso, options), [locale]),
    dateTime: useCallback((iso, options) => formatDateTime(locale, iso, options), [locale]),
  };
}
