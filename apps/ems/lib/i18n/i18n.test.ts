import { en } from "./locales/en";
import { ar } from "./locales/ar";
import { ha } from "./locales/ha";
import { tr } from "./locales/tr";
import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_DIRECTION,
  LOCALE_LABELS,
  directionOf,
  isComplete,
  isLocale,
  translate,
  translatePlural,
  type Dictionary,
  type Locale,
} from "./index";

/**
 * The language machinery, not the translations themselves.
 *
 * Nobody can review 470 Hausa strings in a unit test. What a test can do is
 * catch the failures that are silent: a locale registered but not wired to a
 * dictionary, a direction nobody wrote down, a placeholder dropped in
 * translation so a parent reads "{count} invoices raised" on a fee notice.
 */

const DICTIONARIES: Record<string, Partial<Dictionary>> = { ar, ha, tr };

describe("registration", () => {
  it("has a label and a direction for every locale", () => {
    // A locale in LOCALES but missing from either map is a language that
    // appears in the switcher and then renders undefined, or lays the whole
    // console out backwards.
    for (const locale of LOCALES) {
      expect(LOCALE_LABELS[locale]).toBeTruthy();
      expect(["ltr", "rtl"]).toContain(LOCALE_DIRECTION[locale]);
    }
  });

  it("names each language in its own script", () => {
    // A reader looking for their language scans for the word they use for
    // it, not the English name of it.
    expect(LOCALE_LABELS.ar).toBe("العربية");
    expect(LOCALE_LABELS.tr).toBe("Türkçe");
    expect(LOCALE_LABELS.ha).toBe("Hausa");
  });

  it("knows Arabic runs right to left and the others do not", () => {
    expect(directionOf("ar")).toBe("rtl");
    for (const locale of LOCALES.filter((l) => l !== "ar")) {
      expect(directionOf(locale)).toBe("ltr");
    }
  });

  it("defaults to ltr for anything unrecognised", () => {
    // Guarding a cast rather than a real locale: better a stray value lays
    // out left-to-right than throws on first paint.
    expect(directionOf("zz" as Locale)).toBe("ltr");
  });

  it("accepts the locales it ships and rejects everything else", () => {
    for (const locale of LOCALES) expect(isLocale(locale)).toBe(true);
    expect(isLocale("de")).toBe(false);
    expect(isLocale("")).toBe(false);
    expect(isLocale(null)).toBe(false);
  });
});

describe("coverage", () => {
  it.each(["ar", "ha", "tr"] as const)("%s translates every English key", (locale) => {
    // Not a quality claim — a completeness one. A missing key silently falls
    // back to English, so a half-translated locale looks like a bug in the
    // page rather than a gap in the dictionary.
    const dictionary = DICTIONARIES[locale] ?? {};
    const missing = Object.keys(en).filter((key) => !(key in dictionary));
    expect(missing).toEqual([]);
    expect(isComplete(locale)).toBe(true);
  });

  it("English is complete by definition", () => {
    expect(isComplete(DEFAULT_LOCALE)).toBe(true);
  });
});

describe("placeholders", () => {
  const braces = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();

  it.each(["ha", "tr"] as const)("%s keeps every placeholder the English has", (locale) => {
    /*
     * The failure this catches is not cosmetic. `{count}` and `{created}` are
     * substituted at runtime; a translated or dropped brace renders the
     * literal text on somebody's screen — "{count} invoices raised" on a fee
     * notice going to a parent.
     */
    const dictionary = DICTIONARIES[locale] ?? {};
    for (const [key, english] of Object.entries(en)) {
      const translated = dictionary[key as keyof Dictionary];
      if (!translated) continue;
      expect({ key, braces: braces(translated) }).toEqual({ key, braces: braces(english) });
    }
  });

  it("allows Arabic to drop {count} only in the singular", () => {
    // Arabic says "one invoice was issued", not "1 invoice was issued", and
    // that form only ever renders for exactly one. Every other Arabic string
    // must still carry its placeholders.
    const allowed = new Set(["fees.structures.invoiceCount_one"]);
    for (const [key, english] of Object.entries(en)) {
      const translated = ar[key as keyof Dictionary];
      if (!translated || allowed.has(key)) continue;
      expect({ key, braces: braces(translated) }).toEqual({ key, braces: braces(english) });
    }
  });
});

describe("translate", () => {
  it("falls back to English rather than rendering blank", () => {
    // French is deliberately partial; this is the behaviour that makes that
    // safe to ship.
    expect(translate("fr", "timetable.MONDAY")).toBe(en["timetable.MONDAY"]);
  });

  it("substitutes variables", () => {
    expect(translate("tr", "data.doneDetail", { created: 3, updated: 1, skipped: 0 })).toContain("3");
  });

  it("picks the plural form the locale actually uses", () => {
    // English distinguishes one from many; Turkish does not. Intl decides,
    // and both forms are written so neither language is forced into the
    // other's grammar.
    expect(translatePlural("en", "fees.structures.invoiceCount", 1)).toBe("1 invoice raised");
    expect(translatePlural("en", "fees.structures.invoiceCount", 4)).toBe("4 invoices raised");
    expect(translatePlural("ar", "fees.structures.invoiceCount", 1)).not.toContain("{count}");
    expect(translatePlural("ar", "fees.structures.invoiceCount", 40)).toContain("40");
  });
});
