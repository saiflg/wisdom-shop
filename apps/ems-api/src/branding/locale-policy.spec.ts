import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  availableLocales,
  isSupportedLocale,
  localeName,
  localeProblem,
  normaliseLocale,
  resolveLocale,
} from "./locale-policy";

describe("resolveLocale", () => {
  it("prefers what this person chose", () => {
    // A school default is a default, not an instruction.
    expect(resolveLocale({ chosen: "fr", schoolDefault: "en" })).toBe("fr");
  });

  it("falls back to the school's default when they have chosen nothing", () => {
    expect(resolveLocale({ chosen: null, schoolDefault: "fr" })).toBe("fr");
  });

  it("falls back to English when neither is set", () => {
    expect(resolveLocale({})).toBe(DEFAULT_LOCALE);
  });

  it("does NOT let a withdrawn language break the console", () => {
    // A school set Swahili, the language was later removed from the build.
    // The console must render in something rather than nothing.
    expect(resolveLocale({ schoolDefault: "sw" })).toBe(DEFAULT_LOCALE);
    expect(resolveLocale({ chosen: "sw", schoolDefault: "fr" })).toBe("fr");
  });

  it("ignores empty strings, which is what an unset form field sends", () => {
    expect(resolveLocale({ chosen: "", schoolDefault: "fr" })).toBe("fr");
  });
});

describe("normaliseLocale", () => {
  it("accepts a regional variant as the language it plainly is", () => {
    // Falling back to English for a browser sending "fr-CA" is worse than
    // not translating at all.
    expect(normaliseLocale("fr-CA")).toBe("fr");
    expect(normaliseLocale("en-GB")).toBe("en");
    expect(normaliseLocale("fr_FR")).toBe("fr");
  });

  it("is case-insensitive and tolerates spacing", () => {
    expect(normaliseLocale("  FR  ")).toBe("fr");
  });

  it("returns null for anything it does not support", () => {
    expect(normaliseLocale("sw")).toBeNull();
    expect(normaliseLocale("")).toBeNull();
    expect(normaliseLocale(null)).toBeNull();
    expect(normaliseLocale(undefined)).toBeNull();
  });
});

describe("localeProblem", () => {
  it("accepts a supported language", () => {
    expect(localeProblem("fr")).toBeNull();
    expect(localeProblem("en-GB")).toBeNull();
  });

  it("names what IS available rather than only refusing", () => {
    const problem = localeProblem("sw");
    expect(problem).toMatch(/not available/i);
    expect(problem).toMatch(/English/);
    expect(problem).toMatch(/Français/);
  });
});

describe("localeName", () => {
  it("uses the language's OWN name", () => {
    // A French speaker scans a list for "Français", not for "French".
    expect(localeName("fr")).toBe("Français");
    expect(localeName("en")).toBe("English");
  });

  it("degrades to the code rather than showing nothing", () => {
    expect(localeName("sw")).toBe("sw");
  });
});

describe("the supported set", () => {
  it("includes the default, or every school would start broken", () => {
    expect(isSupportedLocale(DEFAULT_LOCALE)).toBe(true);
  });

  it("offers every supported locale on the settings screen, with a name each", () => {
    const offered = availableLocales();
    expect(offered).toHaveLength(SUPPORTED_LOCALES.length);
    for (const option of offered) {
      expect(option.label.length).toBeGreaterThan(0);
      expect(isSupportedLocale(option.value)).toBe(true);
    }
  });

  it("matches the locales the console actually ships", () => {
    // Kept in step by hand rather than importing the browser bundle into the
    // server. This is the test that catches the two drifting apart, and it
    // did: adding Arabic, Hausa and Turkish to apps/ems failed here until the
    // server was told about them too.
    //
    // The console's own list lives in apps/ems/lib/i18n/index.ts. Direction
    // (Arabic is rtl) is a console concern and deliberately not mirrored
    // here — the server never lays anything out.
    expect([...SUPPORTED_LOCALES].sort()).toEqual(["ar", "en", "fr", "ha", "tr"]);
  });
});
