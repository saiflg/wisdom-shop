import {
  findClashes,
  formatMinute,
  parseMinute,
  validatePeriod,
  validatePeriodStructure,
  type EntryInput,
  type PeriodInput,
} from "./timetable-rules";

const period = (label: string, start: number, end: number): PeriodInput => ({
  label,
  startMinute: start,
  endMinute: end,
});

const entry = (over: Partial<EntryInput> = {}): EntryInput => ({
  classId: "class-5a",
  teacherUserId: "teacher-ade",
  weekday: "MONDAY",
  periodId: "period-1",
  ...over,
});

describe("time conversion", () => {
  it("formats minutes as a wall clock", () => {
    expect(formatMinute(510)).toBe("08:30");
    expect(formatMinute(0)).toBe("00:00");
    expect(formatMinute(1439)).toBe("23:59");
  });

  it("parses a wall clock back to minutes", () => {
    expect(parseMinute("08:30")).toBe(510);
    expect(parseMinute("8:30")).toBe(510);
    expect(parseMinute("00:00")).toBe(0);
  });

  it("round-trips", () => {
    for (const minute of [0, 1, 510, 719, 1439]) {
      expect(parseMinute(formatMinute(minute))).toBe(minute);
    }
  });

  it("rejects nonsense rather than guessing", () => {
    expect(parseMinute("")).toBeNull();
    expect(parseMinute("25:00")).toBeNull();
    expect(parseMinute("08:60")).toBeNull();
    expect(parseMinute("half eight")).toBeNull();
  });
});

describe("validatePeriod", () => {
  it("accepts an ordinary period", () => {
    expect(validatePeriod(period("Period 1", 510, 550))).toBeNull();
  });

  it("refuses a period that ends before it starts", () => {
    expect(validatePeriod(period("Period 1", 550, 510))).toMatch(/ends at or before it starts/i);
  });

  it("refuses a zero-length period", () => {
    expect(validatePeriod(period("Ghost", 510, 510))).toMatch(/ends at or before it starts/i);
  });

  it("refuses times outside a single day", () => {
    expect(validatePeriod(period("Late", 1400, 1500))).toMatch(/outside a single day/i);
    expect(validatePeriod(period("Early", -30, 60))).toMatch(/outside a single day/i);
  });
});

describe("validatePeriodStructure", () => {
  it("accepts a normal school day", () => {
    expect(
      validatePeriodStructure([
        period("Period 1", 510, 550),
        period("Period 2", 550, 590),
        period("Break", 590, 610),
        period("Period 3", 610, 650),
      ]),
    ).toBeNull();
  });

  it("allows periods that touch — that is a school day, not a conflict", () => {
    // 09:00-09:40 then 09:40-10:20. The comparison is strict for this reason.
    expect(validatePeriodStructure([period("A", 540, 580), period("B", 580, 620)])).toBeNull();
  });

  it("refuses overlapping periods", () => {
    // If two periods share a minute, "which lesson is this class in now" has
    // no answer and per-slot uniqueness stops meaning anything.
    const problem = validatePeriodStructure([period("Period 1", 510, 570), period("Period 2", 550, 610)]);
    expect(problem).toMatch(/overlap/i);
    expect(problem).toContain("08:30");
    expect(problem).toContain("09:10");
  });

  it("catches an overlap regardless of the order given", () => {
    expect(validatePeriodStructure([period("Late", 550, 610), period("Early", 510, 570)])).toMatch(/overlap/i);
  });

  it("catches a period fully swallowed by another", () => {
    expect(validatePeriodStructure([period("Long", 510, 650), period("Inside", 550, 570)])).toMatch(/overlap/i);
  });

  it("refuses duplicate names, case and space insensitively", () => {
    expect(validatePeriodStructure([period("Period 1", 510, 550), period(" period 1 ", 550, 590)])).toMatch(
      /two periods called/i,
    );
  });

  it("refuses a nameless period", () => {
    expect(validatePeriodStructure([period("   ", 510, 550)])).toMatch(/needs a name/i);
  });

  it("accepts an empty structure — a school that hasn't set one up yet", () => {
    expect(validatePeriodStructure([])).toBeNull();
  });
});

describe("findClashes", () => {
  it("finds nothing in an empty timetable", () => {
    expect(findClashes(entry(), [])).toEqual([]);
  });

  it("refuses to put a class in two lessons at once", () => {
    const clashes = findClashes(entry({ teacherUserId: "teacher-bola" }), [entry()]);
    expect(clashes.map((c) => c.kind)).toContain("CLASS_BUSY");
  });

  it("refuses to put a teacher in two rooms at once", () => {
    const clashes = findClashes(entry({ classId: "class-6b" }), [entry()]);
    expect(clashes.map((c) => c.kind)).toContain("TEACHER_BUSY");
  });

  it("reports both clashes at once rather than the first", () => {
    // A scheduler should see the whole problem, not fix one and be told
    // about the next.
    const clashes = findClashes(entry(), [entry()]);
    expect(clashes.map((c) => c.kind).sort()).toEqual(["CLASS_BUSY", "TEACHER_BUSY"]);
  });

  it("does not clash across different days", () => {
    expect(findClashes(entry({ weekday: "TUESDAY" }), [entry()])).toEqual([]);
  });

  it("does not clash across different periods", () => {
    expect(findClashes(entry({ periodId: "period-2" }), [entry()])).toEqual([]);
  });

  it("does not clash an entry with itself when it is being edited", () => {
    // Otherwise saving a lesson without moving it would be refused.
    const existing = entry({ id: "entry-1" });
    expect(findClashes({ ...existing, room: "Lab" } as EntryInput, [existing])).toEqual([]);
  });

  it("still clashes an edited entry against a different lesson", () => {
    const clashes = findClashes(entry({ id: "entry-1" }), [entry({ id: "entry-2" })]);
    expect(clashes.length).toBeGreaterThan(0);
  });

  it("does not treat two unstaffed lessons as a teacher clash", () => {
    // Half-planned timetables are the normal mid-term state: many classes
    // have a slot with nobody assigned yet, and that is not a conflict.
    const clashes = findClashes(entry({ classId: "class-6b", teacherUserId: null }), [
      entry({ teacherUserId: null }),
    ]);
    expect(clashes).toEqual([]);
  });

  it("still catches the class clash when neither lesson is staffed", () => {
    const clashes = findClashes(entry({ teacherUserId: null }), [entry({ teacherUserId: null })]);
    expect(clashes.map((c) => c.kind)).toEqual(["CLASS_BUSY"]);
  });

  it("names what the slot is already taken by", () => {
    const clashes = findClashes(entry({ classId: "class-6b" }), [entry()], () => "Mathematics with Grade 5A");
    expect(clashes[0]?.message).toContain("Mathematics with Grade 5A");
  });

  it("points at the entry it conflicts with, so the UI can highlight it", () => {
    const clashes = findClashes(entry({ classId: "class-6b" }), [entry({ id: "entry-9" })]);
    expect(clashes[0]?.conflictingEntryId).toBe("entry-9");
  });

  it("is safe to hand the school's entire timetable", () => {
    // The realistic careless call — the slot comparison must do the narrowing.
    const whole = [
      entry({ id: "a", weekday: "TUESDAY" }),
      entry({ id: "b", periodId: "period-3" }),
      entry({ id: "c", classId: "class-9z", teacherUserId: "teacher-zed" }),
    ];
    expect(findClashes(entry(), whole)).toEqual([]);
  });
});
