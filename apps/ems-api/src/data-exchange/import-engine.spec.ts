import {
  buildImportPlan,
  canCommit,
  compositeKey,
  keyFieldsOf,
  mapHeaders,
  type ImportSpec,
} from "./import-engine";

const SPEC: ImportSpec = {
  keyField: "studentCode",
  columns: [
    { field: "studentCode", headers: ["Admission number", "studentCode"], required: true },
    { field: "firstName", headers: ["First name"], required: true },
    { field: "lastName", headers: ["Last name"], required: true },
    { field: "dateOfBirth", headers: ["Date of birth"], kind: "date" },
    { field: "gender", headers: ["Gender"], kind: "choice", choices: ["Male", "Female"] },
  ],
};

const HEADERS = ["Admission number", "First name", "Last name", "Date of birth", "Gender"];

describe("mapHeaders", () => {
  it("matches headers ignoring case, spaces and punctuation", () => {
    // Real spreadsheets say "admission_number", "Admission Number", "ADMISSIONNUMBER".
    const { byIndex } = mapHeaders(["admission_number", "  FIRST NAME  ", "Last-Name"], SPEC);
    expect([...byIndex.values()].map((c) => c.field)).toEqual(["studentCode", "firstName", "lastName"]);
  });

  it("reports headers nothing claimed, which are usually typos", () => {
    const { unrecognised } = mapHeaders([...HEADERS, "Favourite colour"], SPEC);
    expect(unrecognised).toEqual(["Favourite colour"]);
  });

  it("reports required columns the file lacks entirely", () => {
    const { missing } = mapHeaders(["First name", "Last name"], SPEC);
    expect(missing).toEqual(["Admission number"]);
  });

  it("ignores empty header cells rather than calling them unrecognised", () => {
    const { unrecognised } = mapHeaders([...HEADERS, "", "   "], SPEC);
    expect(unrecognised).toEqual([]);
  });
});

describe("buildImportPlan", () => {
  it("plans creates for keys the school does not have", () => {
    const plan = buildImportPlan(HEADERS, [["ADM001", "Ada", "One", "2015-04-03", "Female"]], SPEC, new Set());
    expect(plan.toCreate).toBe(1);
    expect(plan.toUpdate).toBe(0);
    expect(plan.rows[0]?.action).toBe("create");
  });

  it("plans updates for keys already on file, so a re-upload is not a duplicate", () => {
    // The property that makes correcting and re-uploading a file safe.
    const plan = buildImportPlan(
      HEADERS,
      [["ADM001", "Ada", "One", "2015-04-03", "Female"]],
      SPEC,
      new Set(["ADM001"]),
    );
    expect(plan.toUpdate).toBe(1);
    expect(plan.toCreate).toBe(0);
  });

  it("numbers rows as the spreadsheet does, counting the header", () => {
    // The person fixing this is looking at the spreadsheet, not our model.
    const plan = buildImportPlan(
      HEADERS,
      [
        ["ADM001", "Ada", "One", "", ""],
        ["ADM002", "", "Two", "", ""],
      ],
      SPEC,
      new Set(),
    );
    expect(plan.rows[0]?.rowNumber).toBe(2);
    expect(plan.rows[1]?.rowNumber).toBe(3);
    expect(plan.rows[1]?.problems[0]).toMatch(/First name is required/);
  });

  it("skips trailing blank rows without calling them errors", () => {
    // Spreadsheets leave these behind; flagging them would train people to
    // ignore the error list.
    const plan = buildImportPlan(
      HEADERS,
      [["ADM001", "Ada", "One", "", ""], ["", "", "", "", ""], ["   ", "", "", "", ""]],
      SPEC,
      new Set(),
    );
    expect(plan.rows).toHaveLength(1);
    expect(plan.withErrors).toBe(0);
  });

  it("refuses a file that uses the same key twice, naming the earlier row", () => {
    // Last-one-wins here is how a school ends up with the wrong child's data.
    const plan = buildImportPlan(
      HEADERS,
      [
        ["ADM001", "Ada", "One", "", ""],
        ["ADM001", "Bola", "Two", "", ""],
      ],
      SPEC,
      new Set(),
    );
    expect(plan.rows[1]?.action).toBe("error");
    expect(plan.rows[1]?.problems[0]).toMatch(/row 2/);
    expect(plan.withErrors).toBe(1);
  });

  it("refuses an ambiguous date rather than guessing the month", () => {
    // "03/04/2026" is March or April depending on who typed it, and guessing
    // silently moves a child's date of birth.
    const plan = buildImportPlan(HEADERS, [["ADM001", "Ada", "One", "03/04/2026", ""]], SPEC, new Set());
    expect(plan.rows[0]?.problems[0]).toMatch(/date like 2026-03-04/);
  });

  it("refuses a date that is well-formed but not a real day", () => {
    // Date.parse("2026-02-31") does NOT fail — it rolls over to 3 March and
    // returns a good timestamp. Accepting it would move a child's date of
    // birth by two days with no error shown to anyone.
    for (const notADay of ["2026-02-31", "2026-13-01", "2026-04-31", "2026-00-10"]) {
      const plan = buildImportPlan(HEADERS, [["ADM001", "Ada", "One", notADay, ""]], SPEC, new Set());
      expect(plan.rows[0]?.action).toBe("error");
    }
  });

  it("accepts real edge-case dates, including a leap day", () => {
    for (const realDay of ["2024-02-29", "2026-01-31", "2026-12-31"]) {
      const plan = buildImportPlan(HEADERS, [["ADM001", "Ada", "One", realDay, ""]], SPEC, new Set());
      expect(plan.rows[0]?.action).toBe("create");
    }
  });

  it("refuses 29 February in a non-leap year", () => {
    const plan = buildImportPlan(HEADERS, [["ADM001", "Ada", "One", "2026-02-29", ""]], SPEC, new Set());
    expect(plan.rows[0]?.action).toBe("error");
  });

  it("accepts a choice in any casing but refuses one off the list", () => {
    const ok = buildImportPlan(HEADERS, [["ADM001", "Ada", "One", "", "female"]], SPEC, new Set());
    expect(ok.rows[0]?.action).toBe("create");

    const bad = buildImportPlan(HEADERS, [["ADM001", "Ada", "One", "", "Other"]], SPEC, new Set());
    expect(bad.rows[0]?.problems[0]).toMatch(/one of: Male, Female/);
  });

  it("collects every problem in a row, not just the first", () => {
    // A school fixing a spreadsheet should see the whole row's faults at once.
    const plan = buildImportPlan(HEADERS, [["", "", "One", "not-a-date", "Other"]], SPEC, new Set());
    expect(plan.rows[0]?.problems.length).toBeGreaterThanOrEqual(3);
  });

  it("does not report a required field missing twice", () => {
    const plan = buildImportPlan(HEADERS, [["ADM001", "", "One", "", ""]], SPEC, new Set());
    const firstNameProblems = plan.rows[0]?.problems.filter((p) => p.includes("First name")) ?? [];
    expect(firstNameProblems).toHaveLength(1);
  });

  it("leaves optional blanks alone instead of storing empty strings", () => {
    const plan = buildImportPlan(HEADERS, [["ADM001", "Ada", "One", "", ""]], SPEC, new Set());
    expect(plan.rows[0]?.values).not.toHaveProperty("dateOfBirth");
    expect(plan.rows[0]?.values).not.toHaveProperty("gender");
  });

  it("counts a mixed file correctly", () => {
    const plan = buildImportPlan(
      HEADERS,
      [
        ["ADM001", "Ada", "One", "", ""],
        ["ADM002", "Bola", "Two", "", ""],
        ["ADM003", "", "Three", "", ""],
      ],
      SPEC,
      new Set(["ADM001"]),
    );
    expect(plan).toMatchObject({ toUpdate: 1, toCreate: 1, withErrors: 1 });
  });
});

describe("canCommit", () => {
  const planFor = (rows: string[][], headers = HEADERS, existing = new Set<string>()) =>
    buildImportPlan(headers, rows, SPEC, existing);

  it("allows a plan with workable rows", () => {
    expect(canCommit(planFor([["ADM001", "Ada", "One", "", ""]]))).toBeNull();
  });

  it("allows a plan where some rows are bad but others are fine", () => {
    // One typo must not block a correct roster of four hundred.
    const plan = planFor([
      ["ADM001", "Ada", "One", "", ""],
      ["ADM002", "", "Two", "", ""],
    ]);
    expect(canCommit(plan)).toBeNull();
    expect(plan.withErrors).toBe(1);
  });

  it("refuses a file missing a required column outright", () => {
    // A missing column means this is the wrong file, and importing the
    // readable half of the wrong file is worse than importing none of it.
    const plan = planFor([["Ada", "One"]], ["First name", "Last name"]);
    expect(canCommit(plan)).toMatch(/no Admission number column/i);
  });

  it("refuses an empty file", () => {
    expect(canCommit(planFor([]))).toMatch(/no rows/i);
  });

  it("refuses a file where every row is broken", () => {
    expect(canCommit(planFor([["", "", "", "", ""], ["ADM001", "", "", "", ""]]))).toMatch(/every row/i);
  });
});

// ── Composite keys ───────────────────────────────────────────────────────
// A person has one identifying column; a slot rarely does. A timetable entry
// is a class *and* a day *and* a period.

const TIMETABLE_SPEC: ImportSpec = {
  keyField: "className",
  additionalKeyFields: ["day", "period"],
  columns: [
    { field: "className", headers: ["Class"], required: true },
    { field: "day", headers: ["Day"], required: true },
    { field: "period", headers: ["Period"], required: true },
    { field: "subject", headers: ["Subject"], required: true },
    { field: "teacher", headers: ["Teacher"] },
  ],
};

const TT_HEADERS = ["Class", "Day", "Period", "Subject", "Teacher"];

describe("composite keys", () => {
  const planFor = (rows: string[][], existing = new Set<string>()) =>
    buildImportPlan(TT_HEADERS, rows, TIMETABLE_SPEC, existing);

  it("lists the key fields in order", () => {
    expect(keyFieldsOf(TIMETABLE_SPEC)).toEqual(["className", "day", "period"]);
    expect(keyFieldsOf(SPEC)).toEqual(["studentCode"]);
  });

  it("normalises case and spacing, so a hand-typed file still matches", () => {
    expect(compositeKey(["Grade 5A", "MONDAY", " Period 1 "])).toBe(compositeKey(["grade 5a", "monday", "period 1"]));
  });

  it("is idempotent, so an already-built key can be normalised again safely", () => {
    const once = compositeKey(["Grade 5A", "Monday"]);
    expect(compositeKey([once])).toBe(once);
  });

  it("treats different rows of the same class as distinct, not duplicates", () => {
    // The bug this exists to prevent: with a single key column, every row
    // after the first would read as a repeat of Grade 5A.
    const plan = planFor([
      ["Grade 5A", "Monday", "Period 1", "Mathematics", "Ade"],
      ["Grade 5A", "Monday", "Period 2", "English", "Ngozi"],
      ["Grade 5A", "Tuesday", "Period 1", "Science", "Ade"],
    ]);

    expect(plan.rows.every((row) => row.action === "create")).toBe(true);
    expect(plan.toCreate).toBe(3);
  });

  it("still catches a genuine duplicate slot, naming all three columns", () => {
    const plan = planFor([
      ["Grade 5A", "Monday", "Period 1", "Mathematics", "Ade"],
      ["Grade 5A", "Monday", "Period 1", "English", "Ngozi"],
    ]);

    expect(plan.rows[1].action).toBe("error");
    expect(plan.rows[1].problems[0]).toMatch(/Class \+ Day \+ Period/);
    expect(plan.rows[1].problems[0]).toMatch(/row 2/);
  });

  it("plans an update when the whole slot is already on file", () => {
    const existing = new Set([compositeKey(["Grade 5A", "Monday", "Period 1"])]);
    const plan = planFor([["Grade 5A", "Monday", "Period 1", "Mathematics", "Ade"]], existing);

    // Re-uploading a corrected timetable replaces the lesson in that slot
    // rather than adding a second one to it.
    expect(plan.rows[0].action).toBe("update");
    expect(plan.toUpdate).toBe(1);
  });

  it("matches an existing slot regardless of how it was capitalised", () => {
    const existing = new Set([compositeKey(["grade 5a", "monday", "period 1"])]);
    const plan = planFor([["GRADE 5A", "Monday", "PERIOD 1", "Mathematics", ""]], existing);
    expect(plan.rows[0].action).toBe("update");
  });

  it("has no key at all when part of it is missing", () => {
    // Half a key identifies nothing, and calling it a create would be a guess.
    const plan = planFor([["Grade 5A", "", "Period 1", "Mathematics", ""]]);
    expect(plan.rows[0].key).toBeNull();
    expect(plan.rows[0].action).toBe("error");
  });

  it("leaves single-column keys behaving exactly as before", () => {
    const plan = buildImportPlan(
      HEADERS,
      [["ADM001", "Ada", "One", "", ""]],
      SPEC,
      new Set(["ADM001"]),
    );
    expect(plan.rows[0].action).toBe("update");
  });
});
