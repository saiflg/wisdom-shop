import {
  canMark,
  canSubmit,
  isLate,
  isMarkVisibleToStudent,
  summariseProgress,
} from "./submission-rules";

const DUE = new Date("2027-03-10T23:59:00.000Z");

describe("isLate", () => {
  it("is not late before the deadline", () => {
    expect(isLate(DUE, new Date("2027-03-10T22:00:00.000Z"))).toBe(false);
  });

  it("is late after it", () => {
    expect(isLate(DUE, new Date("2027-03-11T00:00:01.000Z"))).toBe(true);
  });

  it("is on time at exactly the due moment", () => {
    // A student who hands in as the clock strikes has met the deadline. The
    // alternative is telling them otherwise over one millisecond.
    expect(isLate(DUE, new Date(DUE.getTime()))).toBe(false);
    expect(isLate(DUE, new Date(DUE.getTime() + 1))).toBe(true);
  });

  it("is never late when there is no due date", () => {
    // "Before next lesson" is real homework, and inventing a deadline would
    // make work look late that nobody considered late.
    expect(isLate(null, new Date("2099-01-01T00:00:00.000Z"))).toBe(false);
    expect(isLate(undefined, new Date())).toBe(false);
  });
});

describe("canSubmit", () => {
  const before = new Date("2027-03-10T10:00:00.000Z");
  const after = new Date("2027-03-12T10:00:00.000Z");

  it("accepts work before the deadline", () => {
    expect(canSubmit({ status: "SET", dueAt: DUE }, null, before)).toEqual({ allowed: true, isLate: false });
  });

  it("accepts late work and flags it rather than refusing it", () => {
    // Refusing would decide for the teacher and lose the work.
    expect(canSubmit({ status: "SET", dueAt: DUE }, null, after)).toEqual({ allowed: true, isLate: true });
  });

  it("refuses work for an assignment that has been closed", () => {
    const decision = canSubmit({ status: "CLOSED", dueAt: DUE }, null, before);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toMatch(/closed/i);
  });

  it("refuses work for something not yet set", () => {
    expect(canSubmit({ status: "DRAFT", dueAt: DUE }, null, before).allowed).toBe(false);
  });

  it("lets a student replace work they have already handed in", () => {
    expect(canSubmit({ status: "SET", dueAt: DUE }, { status: "SUBMITTED" }, before)).toEqual({
      allowed: true,
      isLate: false,
    });
  });

  it("refuses a replacement once it has been marked", () => {
    // Silently invalidating a mark the teacher has already given is worse
    // than saying no.
    for (const status of ["MARKED", "RELEASED"] as const) {
      const decision = canSubmit({ status: "SET", dueAt: DUE }, { status }, before);
      expect(decision.allowed).toBe(false);
      if (!decision.allowed) expect(decision.reason).toMatch(/already been marked/i);
    }
  });

  it("re-flags lateness on a replacement", () => {
    // Handing in on time then replacing it late is late.
    expect(canSubmit({ status: "SET", dueAt: DUE }, { status: "SUBMITTED" }, after)).toEqual({
      allowed: true,
      isLate: true,
    });
  });
});

describe("canMark", () => {
  it("accepts a mark within range", () => {
    expect(canMark(1750, 2000)).toEqual({ allowed: true });
    expect(canMark(0, 2000)).toEqual({ allowed: true });
    expect(canMark(2000, 2000)).toEqual({ allowed: true });
  });

  it("accepts no mark at all", () => {
    expect(canMark(null, 2000)).toEqual({ allowed: true });
  });

  it("refuses a mark above the maximum, naming the maximum in marks", () => {
    const decision = canMark(2500, 2000);
    expect(decision.allowed).toBe(false);
    // 2000 hundredths is 20 marks — the teacher should read "20", not "2000".
    if (!decision.allowed) expect(decision.reason).toMatch(/more than the 20/);
  });

  it("refuses a negative mark", () => {
    expect(canMark(-1, 2000).allowed).toBe(false);
  });

  it("refuses a fractional hundredth, which would be a float creeping in", () => {
    expect(canMark(17.5, 2000).allowed).toBe(false);
  });
});

describe("isMarkVisibleToStudent", () => {
  it("shows a released mark", () => {
    expect(isMarkVisibleToStudent("RELEASED")).toBe(true);
  });

  it("hides a mark that has been given but not released", () => {
    // A teacher marking a class over an evening should not be releasing
    // marks one at a time as they go.
    expect(isMarkVisibleToStudent("MARKED")).toBe(false);
    expect(isMarkVisibleToStudent("SUBMITTED")).toBe(false);
  });
});

describe("summariseProgress", () => {
  it("counts what a teacher is chasing", () => {
    const summary = summariseProgress(30, [
      { status: "SUBMITTED", isLate: false },
      { status: "SUBMITTED", isLate: true },
      { status: "MARKED", isLate: false },
      { status: "RELEASED", isLate: true },
    ]);

    expect(summary).toEqual({
      expected: 30,
      submitted: 4,
      marked: 2,
      released: 1,
      late: 2,
      outstanding: 26,
    });
  });

  it("never reports a negative outstanding", () => {
    // More submissions than enrolled students means the roll changed, not
    // that minus two people owe work.
    expect(summariseProgress(1, [
      { status: "SUBMITTED", isLate: false },
      { status: "SUBMITTED", isLate: false },
    ]).outstanding).toBe(0);
  });

  it("handles a class nobody has submitted for", () => {
    expect(summariseProgress(12, [])).toEqual({
      expected: 12,
      submitted: 0,
      marked: 0,
      released: 0,
      late: 0,
      outstanding: 12,
    });
  });
});
