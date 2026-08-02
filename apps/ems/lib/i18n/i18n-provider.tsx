"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_LOCALE, isLocale, translate, type Locale, type TranslationKey } from "./index";

const STORAGE_KEY = "wisdom-campus-locale";

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

/**
 * The user's own locale override. A school-wide default will layer in
 * underneath this once school profile settings exist — the resolution order
 * is intended to be: user override -> school default -> DEFAULT_LOCALE.
 *
 * Read from localStorage in an effect rather than during render so the
 * server and first client render agree; otherwise a stored non-English
 * locale would hydrate-mismatch every translated string on the page.
 */
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) setLocaleState(stored);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.lang = next;
  }, []);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation(): I18nValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useTranslation must be used inside <I18nProvider>");
  return context;
}
