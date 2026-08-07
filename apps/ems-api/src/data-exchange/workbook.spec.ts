import { buildSheet, formatFromFilename, parseSheet } from "./workbook";

describe("formatFromFilename", () => {
  it("recognises the two formats it can read", () => {
    expect(formatFromFilename("students.xlsx")).toBe("xlsx");
    expect(formatFromFilename("STUDENTS.CSV")).toBe("csv");
  });

  it("returns null for the old binary .xls, which exceljs cannot read", () => {
    // Saying so is more use than "could not parse file".
    expect(formatFromFilename("students.xls")).toBeNull();
    expect(formatFromFilename("students.pdf")).toBeNull();
    expect(formatFromFilename("students")).toBeNull();
  });
});

describe("buildSheet and parseSheet", () => {
  const columns = [
    { header: "Admission number", field: "studentCode" },
    { header: "First name", field: "firstName" },
  ];

  it.each(["xlsx", "csv"] as const)("round-trips through %s", async (format) => {
    const buffer = await buildSheet(columns, [{ studentCode: "ADM001", firstName: "Ada" }], format);
    const parsed = await parseSheet(buffer, format);

    expect(parsed.headers).toEqual(["Admission number", "First name"]);
    expect(parsed.rows[0]).toEqual(["ADM001", "Ada"]);
  });

  it.each(["xlsx", "csv"] as const)("keeps a leading zero intact through %s", async (format) => {
    // "007" is not seven. Excel turning it into a number silently
    // mis-identifies a child, and for an account number misdirects a salary.
    const buffer = await buildSheet(columns, [{ studentCode: "007", firstName: "Ada" }], format);
    const parsed = await parseSheet(buffer, format);
    expect(parsed.rows[0]?.[0]).toBe("007");
  });

  it("writes an empty string where a value is missing rather than 'undefined'", async () => {
    const buffer = await buildSheet(columns, [{ studentCode: "ADM001" }], "csv");
    const parsed = await parseSheet(buffer, "csv");
    expect(parsed.rows[0]?.[1]).toBe("");
  });

  it("handles a sheet with only headers", async () => {
    const buffer = await buildSheet(columns, [], "xlsx");
    const parsed = await parseSheet(buffer, "xlsx");
    expect(parsed.headers).toEqual(["Admission number", "First name"]);
    expect(parsed.rows).toEqual([]);
  });

  it("preserves values containing commas and quotes through csv", async () => {
    // The classic csv trap — a name like O'Brien, or "Smith, Jr".
    const buffer = await buildSheet(columns, [{ studentCode: "ADM001", firstName: 'Smith, "Jr"' }], "csv");
    const parsed = await parseSheet(buffer, "csv");
    expect(parsed.rows[0]?.[1]).toBe('Smith, "Jr"');
  });

  it("preserves non-ASCII names", async () => {
    const buffer = await buildSheet(columns, [{ studentCode: "ADM001", firstName: "Ngọzi Adébáyọ̀" }], "xlsx");
    const parsed = await parseSheet(buffer, "xlsx");
    expect(parsed.rows[0]?.[1]).toBe("Ngọzi Adébáyọ̀");
  });

  it("truncates an over-long sheet name to Excel's limit instead of failing", async () => {
    const buffer = await buildSheet(columns, [], "xlsx", "a".repeat(60));
    await expect(parseSheet(buffer, "xlsx")).resolves.toBeDefined();
  });
});
