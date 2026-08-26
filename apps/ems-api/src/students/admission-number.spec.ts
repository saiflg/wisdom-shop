import { buildAdmissionNumber, isGeneratedAdmissionNumber, schoolAbbreviation } from "./admission-number";

describe("schoolAbbreviation", () => {
  it("takes the initials of a multi-word name", () => {
    expect(schoolAbbreviation("Demo Academy")).toBe("DA");
    expect(schoolAbbreviation("Bright Future International School")).toBe("BFIS");
  });

  it("ignores words that carry no identity", () => {
    expect(schoolAbbreviation("St Mary's College of Arts")).toBe("SMCA");
    expect(schoolAbbreviation("The Kings School")).toBe("KS");
  });

  // "Mary's" is one word. Treating the apostrophe as a break would add an S
  // nobody expects and quietly change every number the school has issued.
  it("does not break words on apostrophes", () => {
    expect(schoolAbbreviation("Mary's Academy")).toBe("MA");
    expect(schoolAbbreviation("Mary\u2019s Academy")).toBe("MA");
  });

  it("gives a one-word school three letters rather than one", () => {
    expect(schoolAbbreviation("Kingsway")).toBe("KIN");
  });

  it("caps at four letters, because it has to fit on a card", () => {
    expect(schoolAbbreviation("Alpha Beta Gamma Delta Epsilon")).toBe("ABGD");
  });

  it("falls back rather than returning nothing", () => {
    expect(schoolAbbreviation("")).toBe("SCH");
    expect(schoolAbbreviation(null)).toBe("SCH");
    expect(schoolAbbreviation("   ")).toBe("SCH");
    expect(schoolAbbreviation("!!!")).toBe("SCH");
  });

  // A school called "The Academy" is all noise but one word; it must still
  // get letters rather than an empty string.
  it("keeps something when every word is a noise word", () => {
    expect(schoolAbbreviation("The Of And")).toBe("TOA");
  });
});

describe("buildAdmissionNumber", () => {
  it("reads the way a school office writes it", () => {
    expect(buildAdmissionNumber({ abbreviation: "DA", year: 2026, sequence: 1 })).toBe("DA/2026/0001");
    expect(buildAdmissionNumber({ abbreviation: "SMC", year: 2024, sequence: 137 })).toBe("SMC/2024/0137");
  });

  it("pads to four digits so a spreadsheet sorts them correctly", () => {
    const numbers = [1, 2, 10, 99].map((sequence) =>
      buildAdmissionNumber({ abbreviation: "DA", year: 2026, sequence }),
    );
    expect([...numbers].sort()).toEqual(numbers);
  });

  it("grows rather than wrapping past 9999", () => {
    expect(buildAdmissionNumber({ abbreviation: "DA", year: 2026, sequence: 12345 })).toBe("DA/2026/12345");
  });

  it("never issues a zeroth admission", () => {
    expect(buildAdmissionNumber({ abbreviation: "DA", year: 2026, sequence: 0 })).toBe("DA/2026/0001");
  });
});

describe("isGeneratedAdmissionNumber", () => {
  it("recognises its own numbers", () => {
    expect(isGeneratedAdmissionNumber("DA/2026/0001")).toBe(true);
    expect(isGeneratedAdmissionNumber("SMCA/2024/0137")).toBe(true);
  });

  // The whole point: a school arriving from paper keeps its own numbering,
  // and a child does not get renumbered after six years.
  it("leaves hand-entered codes alone", () => {
    expect(isGeneratedAdmissionNumber("76854433")).toBe(false);
    expect(isGeneratedAdmissionNumber("ADM-NEW-1")).toBe(false);
    expect(isGeneratedAdmissionNumber("DEMO-004")).toBe(false);
    expect(isGeneratedAdmissionNumber("00003")).toBe(false);
    expect(isGeneratedAdmissionNumber(null)).toBe(false);
  });
});
