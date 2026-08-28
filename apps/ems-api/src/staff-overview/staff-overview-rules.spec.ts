import { noteObligations, staffFlags, teachingLoad } from "./staff-overview-rules";

describe("teachingLoad", () => {
  // The one that would double somebody's apparent load.
  it("counts classes and subjects distinctly, not assignment rows", () => {
    // Three subjects with one class is three assignments, ONE class. Saying
    // "3 classes" inflates their load in the one place somebody looks before
    // deciding whether to give them more.
    const assignments = [
      { classId: "5a", subjectId: "maths" },
      { classId: "5a", subjectId: "english" },
      { classId: "5a", subjectId: "science" },
    ];
    const load = teachingLoad(assignments, []);
    expect(load.classes).toBe(1);
    expect(load.subjects).toBe(3);
  });

  it("counts one subject across several classes correctly too", () => {
    const assignments = [
      { classId: "5a", subjectId: "maths" },
      { classId: "5b", subjectId: "maths" },
      { classId: "6a", subjectId: "maths" },
    ];
    const load = teachingLoad(assignments, []);
    expect(load.classes).toBe(3);
    expect(load.subjects).toBe(1);
  });

  it("adds up timetabled minutes", () => {
    const load = teachingLoad([], [
      { startMinute: 8 * 60, endMinute: 8 * 60 + 40 },
      { startMinute: 9 * 60, endMinute: 9 * 60 + 40 },
    ]);
    expect(load.periods).toBe(2);
    expect(load.minutesPerWeek).toBe(80);
  });

  // The honest gap.
  it("reports no timetable as null, not as zero minutes", () => {
    // A teacher whose timetable has not been entered is not a teacher with
    // nothing to do — and this is the figure somebody would use to justify
    // giving them more.
    const load = teachingLoad([{ classId: "5a", subjectId: "maths" }], []);
    expect(load.minutesPerWeek).toBeNull();
    expect(load.periods).toBe(0);
  });

  it("ignores a period that ends before it starts", () => {
    // Bad data should not produce negative minutes and quietly reduce a
    // teacher's recorded load.
    const load = teachingLoad([], [{ startMinute: 600, endMinute: 500 }]);
    expect(load.minutesPerWeek).toBe(0);
  });

  it("copes with somebody who teaches nothing", () => {
    expect(teachingLoad([], [])).toEqual({
      classes: 0,
      subjects: 0,
      periods: 0,
      minutesPerWeek: null,
    });
  });
});

describe("noteObligations", () => {
  it("separates what is theirs to do from what they are waiting on", () => {
    // A note sent back is theirs to fix; a note submitted is somebody else's
    // to read. "3 outstanding" would tell a teacher to chase themselves.
    const counts = { draft: 2, returned: 1, submitted: 3, approved: 10 };
    expect(noteObligations(counts)).toEqual({ mine: 3, theirs: 3 });
  });

  it("is zero on both counts for somebody with nothing pending", () => {
    expect(noteObligations({ draft: 0, returned: 0, submitted: 0, approved: 5 })).toEqual({
      mine: 0,
      theirs: 0,
    });
  });
});

describe("staffFlags", () => {
  const CLEAR = {
    attendanceRate: 98,
    notes: { draft: 1, submitted: 2, returned: 0, approved: 9 },
    leaveUntracked: false,
    remainingLeaveDays: 12,
  };

  it("raises nothing for somebody who is fine", () => {
    expect(staffFlags(CLEAR)).toEqual([]);
  });

  it("puts a returned lesson note first, since it is theirs to act on", () => {
    const flags = staffFlags({ ...CLEAR, notes: { ...CLEAR.notes, returned: 2 }, attendanceRate: 50 });
    expect(flags[0]).toBe("2 lesson notes sent back to be fixed");
  });

  it("singularises one note", () => {
    expect(staffFlags({ ...CLEAR, notes: { ...CLEAR.notes, returned: 1 } })[0]).toBe(
      "1 lesson note sent back to be fixed",
    );
  });

  it("does not flag an attendance rate it cannot compute", () => {
    expect(staffFlags({ ...CLEAR, attendanceRate: null })).toEqual([]);
  });

  // The one that would be a fact about the school, not the person.
  it("does not report leave over allowance when no allowance is set", () => {
    // "0 days left" against a school that never set an entitlement says
    // nothing about this person.
    expect(staffFlags({ ...CLEAR, leaveUntracked: true, remainingLeaveDays: -5 })).toEqual([]);
  });

  it("reports leave over a tracked allowance", () => {
    expect(staffFlags({ ...CLEAR, remainingLeaveDays: -3 })).toContain(
      "3 days of leave over the allowance",
    );
  });

  it("does not flag leave that is merely low", () => {
    // Two days left is not a problem; it is two days left.
    expect(staffFlags({ ...CLEAR, remainingLeaveDays: 2 })).toEqual([]);
  });
});
