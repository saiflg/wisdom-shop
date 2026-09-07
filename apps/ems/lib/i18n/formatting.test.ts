import { formatCount, formatDate, formatMinorUnits, formattingLocale } from "./formatting";

describe("formattingLocale", () => {
  // The whole reason this module exists. "ar" alone resolves to the latn
  // numbering system, so a page that passed it would show Latin digits and
  // look, correctly, as though nothing had been done.
  it("asks for Arabic-Indic digits explicitly, because 'ar' alone does not", () => {
    expect(formattingLocale("ar")).toBe("ar-u-nu-arab");
    expect(new Intl.NumberFormat("ar").resolvedOptions().numberingSystem).toBe("latn");
    expect(new Intl.NumberFormat(formattingLocale("ar")).resolvedOptions().numberingSystem).toBe("arab");
  });

  it("leaves every other language alone", () => {
    for (const locale of ["en", "fr", "ha", "tr"]) {
      expect(formattingLocale(locale)).toBe(locale);
    }
  });
});

describe("formatMinorUnits", () => {
  it("writes Arabic amounts in Arabic digits", () => {
    expect(formatMinorUnits("ar", 45000050)).toBe("٤٥٠٬٠٠٠٫٥٠");
  });

  it("leaves English, Hausa and French in Latin digits", () => {
    expect(formatMinorUnits("en", 45000050)).toBe("450,000.50");
    expect(formatMinorUnits("ha", 45000050)).toBe("450,000.50");
  });

  it("uses each language's own separators", () => {
    // Turkish groups with a dot and decimalises with a comma. Getting this
    // backwards turns four hundred and fifty thousand into four hundred.
    expect(formatMinorUnits("tr", 45000050)).toBe("450.000,50");
  });

  it("never divides the total by 100", () => {
    // The rule the original formatter was written to keep: a cent is an
    // integer until the moment it is printed. 8.70 is the classic float
    // trap - 870 / 100 is 8.700000000000001 in binary.
    expect(formatMinorUnits("en", 870)).toBe("8.70");
    expect(formatMinorUnits("en", 1_00)).toBe("1.00");
    expect(formatMinorUnits("en", 99)).toBe("0.99");
    expect(formatMinorUnits("en", 1)).toBe("0.01");
    expect(formatMinorUnits("en", 0)).toBe("0.00");
  });

  it("keeps large totals exact", () => {
    expect(formatMinorUnits("en", 999_999_999_99)).toBe("999,999,999.99");
  });

  it("puts the sign in front of the whole amount, not inside it", () => {
    expect(formatMinorUnits("en", -125050)).toBe("-1,250.50");
  });

  it("passes the currency through as the school wrote it", () => {
    expect(formatMinorUnits("en", 5000, "NGN")).toBe("NGN 50.00");
    expect(formatMinorUnits("ar", 5000, "₦")).toBe("₦ ٥٠٫٠٠");
  });
});

describe("formatCount and formatDate", () => {
  it("counts in the reader's digits", () => {
    expect(formatCount("en", 1234)).toBe("1,234");
    expect(formatCount("ar", 1234)).toBe("١٬٢٣٤");
  });

  it("dates in the reader's digits", () => {
    // A date beside an Arabic amount should not be the one thing on the row
    // still written in Latin numerals.
    expect(formatDate("ar", "2026-09-04T00:00:00.000Z")).toMatch(/[٠-٩]/);
    expect(formatDate("en", "2026-09-04T00:00:00.000Z")).toMatch(/[0-9]/);
  });
});
