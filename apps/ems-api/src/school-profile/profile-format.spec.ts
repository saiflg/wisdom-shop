import {
  documentHeaderLines,
  formatAddress,
  formatContact,
  validateEstablishedYear,
} from "./profile-format";

describe("formatAddress", () => {
  it("joins the parts that are filled in", () => {
    expect(
      formatAddress({ addressLine1: "12 Awolowo Road", town: "Ikeja", state: "Lagos", country: "Nigeria" }),
    ).toBe("12 Awolowo Road, Ikeja, Lagos, Nigeria");
  });

  // The failure this function exists to prevent.
  it("never leaves a gap where a missing part was", () => {
    // "Ikeja, , Nigeria" on every report card a school hands out, unnoticed
    // until a parent points at it.
    expect(formatAddress({ town: "Ikeja", state: null, country: "Nigeria" })).toBe("Ikeja, Nigeria");
    expect(formatAddress({ addressLine1: "12 Awolowo Road", addressLine2: "   ", town: "Ikeja" })).toBe(
      "12 Awolowo Road, Ikeja",
    );
  });

  it("treats blank and whitespace the same as absent", () => {
    expect(formatAddress({ town: "  ", country: "" })).toBeNull();
  });

  it("returns null rather than an empty string when nothing is set", () => {
    // Null is what the header check tests against; "" would add a blank line.
    expect(formatAddress({})).toBeNull();
  });
});

describe("formatContact", () => {
  it("joins what is there with a separator that is not a comma", () => {
    // A comma between a phone number and an email reads as one long value.
    expect(formatContact({ phone: "0801 234 5678", email: "office@school.ng" })).toBe(
      "0801 234 5678 · office@school.ng",
    );
  });

  it("copes with only one of the three", () => {
    expect(formatContact({ website: "school.ng" })).toBe("school.ng");
    expect(formatContact({})).toBeNull();
  });
});

describe("documentHeaderLines", () => {
  it("always starts with the school name", () => {
    expect(documentHeaderLines("Demo Academy", null)).toEqual(["Demo Academy"]);
    expect(documentHeaderLines("Demo Academy", {})).toEqual(["Demo Academy"]);
  });

  it("adds only what the school has actually filled in", () => {
    // A school that has entered nothing gets one line, not a header padded
    // out with blanks.
    expect(documentHeaderLines("Demo Academy", { town: "Ikeja", country: "Nigeria" })).toEqual([
      "Demo Academy",
      "Ikeja, Nigeria",
    ]);
  });

  it("puts the parts in the order a school expects", () => {
    expect(
      documentHeaderLines("Demo Academy", {
        motto: "Learning with purpose",
        town: "Ikeja",
        country: "Nigeria",
        phone: "0801 234 5678",
      }),
    ).toEqual(["Demo Academy", "Ikeja, Nigeria", "0801 234 5678", '"Learning with purpose"']);
  });

  it("quotes the motto", () => {
    // Printed bare beneath a phone number it reads as more contact detail.
    expect(documentHeaderLines("Demo Academy", { motto: "Learning with purpose" })).toEqual([
      "Demo Academy",
      '"Learning with purpose"',
    ]);
  });
});

describe("validateEstablishedYear", () => {
  const THIS_YEAR = 2026;

  it("accepts an ordinary founding year", () => {
    expect(validateEstablishedYear(1998, THIS_YEAR)).toBeNull();
    expect(validateEstablishedYear(THIS_YEAR, THIS_YEAR)).toBeNull();
  });

  it("refuses the future", () => {
    expect(validateEstablishedYear(2027, THIS_YEAR)).toBe("A school cannot have been founded in the future");
  });

  it("is loose at the bottom, because some schools are genuinely old", () => {
    expect(validateEstablishedYear(1842, THIS_YEAR)).toBeNull();
    expect(validateEstablishedYear(1799, THIS_YEAR)).toBe("That is earlier than this field is meant for");
  });

  it("refuses a fraction", () => {
    expect(validateEstablishedYear(1998.5, THIS_YEAR)).toBe("The year founded must be a whole number");
  });
});
