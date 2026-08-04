import { extractPlaceholders, unknownPlaceholders } from "./use-messaging";

describe("extractPlaceholders", () => {
  it("finds each distinct placeholder once", () => {
    expect(extractPlaceholders("Dear {{guardianName}}, {{studentName}} and {{studentName}}")).toEqual([
      "guardianName",
      "studentName",
    ]);
  });

  it("tolerates inner whitespace and ignores near-misses", () => {
    expect(extractPlaceholders("{{ studentName }} {notAPlaceholder} {{1bad}}")).toEqual(["studentName"]);
  });
});

describe("unknownPlaceholders", () => {
  it("is empty for a template using only what its event supplies", () => {
    expect(unknownPlaceholders("{{studentName}} was absent on {{date}}", "ATTENDANCE_ABSENT")).toEqual([]);
  });

  it("flags a placeholder from a different event", () => {
    // Shown as the school types, so the mistake is caught before saving —
    // the API validates independently and stays the authority.
    expect(unknownPlaceholders("Invoice {{invoiceNumber}}", "ATTENDANCE_ABSENT")).toEqual(["invoiceNumber"]);
  });

  it("flags an outright typo", () => {
    expect(unknownPlaceholders("Dear {{gardianName}}", "ATTENDANCE_ABSENT")).toEqual(["gardianName"]);
  });

  it("accepts a template with no placeholders", () => {
    expect(unknownPlaceholders("School reopens Monday.", "ATTENDANCE_ABSENT")).toEqual([]);
  });
});
