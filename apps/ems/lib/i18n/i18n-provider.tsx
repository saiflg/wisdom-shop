"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_LOCALE, isLocale, translate, type Locale, type TranslationKey } from "./index";

const STORAGE_KEY = "wisdom-campus-locale";

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /**
   * Apply the school's default. Ignored when this person has chosen for
   * themselves — a default is a default, not an instruction.
   */
  applySchoolDefault: (locale: string | null | undefined) => void;
  /** True when the current language came from this person, not the school. */
  chosenByUser: boolean;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

/**
 * The language the console speaks, resolved as: this person's own choice, then
 * the school's default, then DEFAULT_LOCALE.
 *
 * A teacher who switched to French must not be switched back every morning
 * because the office prefers English — so `applySchoolDefault` is a no-op once
 * somebody has chosen, and choosing is recorded in localStorage rather than
 * inferred from the current value.
 *
 * Both reads happen in an effect rather than during render so the server and
 * first client render agree; otherwise a stored non-English locale would
 * hydrate-mismatch every translated string on the page.
 */
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [chosenByUser, setChosenByUser] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) {
      setLocaleState(stored);
      setChosenByUser(true);
    }
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    setChosenByUser(true);
    window.localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.lang = next;
  }, []);

  const applySchoolDefault = useCallback((next: string | null | undefined) => {
    if (!isLocale(next)) return;
    // Deliberately does not write to localStorage: the school's default is
    // not this person's choice, and storing it would make a later change to
    // the school setting stop reaching anybody who had once loaded the page.
    setChosenByUser((chosen) => {
      if (!chosen) {
        setLocaleState(next);
        document.documentElement.lang = next;
      }
      return chosen;
    });
  }, []);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, applySchoolDefault, chosenByUser, t }),
    [locale, setLocale, applySchoolDefault, chosenByUser, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation(): I18nValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useTranslation must be used inside <I18nProvider>");
  return context;
}
