import {
  ABSENCE_REASONS,
  MAX_BACKDATE_DAYS,
  MAX_SPAN_DAYS,
  canReadNoteDetail,
  canWithdraw,
  coversDate,
  dayOf,
  daysBetween,
  describeDuration,
  describeRange,
  noteState,
  rangeProblem,
  reasonLabel,
  reasonProblem,
  registerHint,
} from "./absence-notes";

const NOW = new Date("2026-08-14T09:30:00.000Z");
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function note(overrides: Partial<Parameters<typeof noteState>[0]> = {}) {
  return {
    fromDate: d("2026-08-17"),
    toDate: d("2026-08-19"),
    withdrawnAt: null,
    acknowledgedAt: null,
    ...overrides,
  };
}

describe("dayOf", () => {
  it("strips the time so an evening submission is not a different day", () => {
    // A parent writing at 11pm and one writing at 7am mean the same day.
    expect(dayOf(new Date("2026-08-14T23:59:00.000Z")).toISOString()).toBe("2026-08-14T00:00:00.000Z");
    expect(dayOf(new Date("2026-08-14T00:00:01.000Z")).toISOString()).toBe("2026-08-14T00:00:00.000Z");
  });

  it("matches how the attendance register normalises its own dates", () => {
    // Both are UTC midnight, or a note would miss the register it explains.
    expect(dayOf(NOW).toISOString()).toBe("2026-08-14T00:00:00.000Z");
  });
});

describe("rangeProblem", () => {
  it("accepts an ordinary few days off", () => {
    expect(rangeProblem({ fromDate: d("2026-08-17"), toDate: d("2026-08-19") }, NOW)).toBeNull();
  });

  it("accepts a single day", () => {
    expect(rangeProblem({ fromDate: d("2026-08-17"), toDate: d("2026-08-17") }, NOW)).toBeNull();
  });

  it("accepts today, which is the commonest case of all", () => {
    // A child is ill this morning and the parent says so before school.
    expect(rangeProblem({ fromDate: d("2026-08-14"), toDate: d("2026-08-14") }, NOW)).toBeNull();
  });

  it("accepts yesterday, because parents get round to it late", () => {
    expect(rangeProblem({ fromDate: d("2026-08-13"), toDate: d("2026-08-13") }, NOW)).toBeNull();
  });

  it("refuses an end date before the start", () => {
    const problem = rangeProblem({ fromDate: d("2026-08-19"), toDate: d("2026-08-17") }, NOW);
    expect(problem).toMatch(/cannot be before/i);
  });

  it("refuses backdating beyond the limit, and says who to ask instead", () => {
    const problem = rangeProblem({ fromDate: d("2026-07-01"), toDate: d("2026-07-02") }, NOW);
    expect(problem).toMatch(new RegExp(`${MAX_BACKDATE_DAYS} days ago`));
    expect(problem).toMatch(/school office/i);
  });

  it("allows exactly the backdating limit and refuses one day more", () => {
    const edge = new Date(NOW.getTime() - MAX_BACKDATE_DAYS * 86_400_000);
    expect(rangeProblem({ fromDate: edge, toDate: edge }, NOW)).toBeNull();

    const past = new Date(NOW.getTime() - (MAX_BACKDATE_DAYS + 1) * 86_400_000);
    expect(rangeProblem({ fromDate: past, toDate: past }, NOW)).not.toBeNull();
  });

  it("refuses an absurdly long span as a typo in the end date", () => {
    const problem = rangeProblem({ fromDate: d("2026-08-17"), toDate: d("2026-11-17") }, NOW);
    expect(problem).toMatch(new RegExp(`more than ${MAX_SPAN_DAYS} days`));
  });

  it("counts the span inclusively", () => {
    // 30 days means 30 school days off, not 31.
    const from = d("2026-08-17");
    const to = new Date(from.getTime() + (MAX_SPAN_DAYS - 1) * 86_400_000);
    expect(rangeProblem({ fromDate: from, toDate: to }, NOW)).toBeNull();

    const tooFar = new Date(from.getTime() + MAX_SPAN_DAYS * 86_400_000);
    expect(rangeProblem({ fromDate: from, toDate: tooFar }, NOW)).not.toBeNull();
  });

  it("refuses something too far in the future", () => {
    expect(rangeProblem({ fromDate: d("2028-01-01"), toDate: d("2028-01-02") }, NOW)).toMatch(/too far ahead/i);
  });

  it("never leaves a parent without a next step", () => {
    const refusals = [
      { fromDate: d("2026-07-01"), toDate: d("2026-07-02") },
      { fromDate: d("2028-01-01"), toDate: d("2028-01-02") },
      { fromDate: d("2026-08-17"), toDate: d("2026-11-17") },
    ];
    for (const range of refusals) {
      expect(rangeProblem(range, NOW)).toMatch(/school office/i);
    }
  });
});

describe("reasonProblem", () => {
  it("accepts each offered reason", () => {
    for (const reason of ABSENCE_REASONS) {
      const note = reason === "OTHER" ? "Family matter" : null;
      expect(reasonProblem(reason, note)).toBeNull();
    }
  });

  it("refuses a reason that is not on the list", () => {
    expect(reasonProblem("BECAUSE", null)).toMatch(/choose a reason/i);
  });

  it("insists on a word of explanation for OTHER", () => {
    // "Other" on its own tells the school precisely nothing.
    expect(reasonProblem("OTHER", null)).toMatch(/say briefly/i);
    expect(reasonProblem("OTHER", "   ")).toMatch(/say briefly/i);
    expect(reasonProblem("OTHER", "Court appointment")).toBeNull();
  });

  it("does not demand an explanation for illness", () => {
    // A parent should not have to describe symptoms to report a sick child.
    expect(reasonProblem("ILLNESS", null)).toBeNull();
  });
});

describe("coversDate", () => {
  it("includes both ends of the range", () => {
    expect(coversDate(note(), d("2026-08-17"))).toBe(true);
    expect(coversDate(note(), d("2026-08-19"))).toBe(true);
    expect(coversDate(note(), d("2026-08-18"))).toBe(true);
  });

  it("excludes the days either side", () => {
    expect(coversDate(note(), d("2026-08-16"))).toBe(false);
    expect(coversDate(note(), d("2026-08-20"))).toBe(false);
  });

  it("ignores the time of day on the register's date", () => {
    expect(coversDate(note(), new Date("2026-08-19T15:00:00.000Z"))).toBe(true);
  });

  it("a withdrawn note speaks for nothing", () => {
    expect(coversDate(note({ withdrawnAt: NOW }), d("2026-08-18"))).toBe(false);
  });

  it("an acknowledged note still speaks", () => {
    expect(coversDate(note({ acknowledgedAt: NOW }), d("2026-08-18"))).toBe(true);
  });
});

describe("canWithdraw", () => {
  it("lets a parent take back a note the school has not acted on", () => {
    expect(canWithdraw(note())).toBe(true);
  });

  it("refuses once the school has acknowledged it", () => {
    // The school decided something on the strength of it, and a record that
    // can be removed afterwards is not a record.
    expect(canWithdraw(note({ acknowledgedAt: NOW }))).toBe(false);
  });

  it("refuses to withdraw twice", () => {
    expect(canWithdraw(note({ withdrawnAt: NOW }))).toBe(false);
  });
});

describe("canReadNoteDetail", () => {
  const written = { createdByUserId: "parent-1" };

  it("lets the parent who wrote it read it back", () => {
    expect(canReadNoteDetail({ id: "parent-1", roles: ["GUARDIAN"] }, written)).toBe(true);
  });

  it("lets staff read it, because they have to run the school", () => {
    expect(canReadNoteDetail({ id: "t1", roles: ["TEACHER"] }, written)).toBe(true);
    expect(canReadNoteDetail({ id: "a1", roles: ["SCHOOL_ADMIN"] }, written)).toBe(true);
  });

  it("refuses another family", () => {
    // "He has chickenpox" is a medical fact about a named child.
    expect(canReadNoteDetail({ id: "parent-2", roles: ["GUARDIAN"] }, written)).toBe(false);
  });

  it("refuses the student themselves", () => {
    expect(canReadNoteDetail({ id: "s1", roles: ["STUDENT"] }, written)).toBe(false);
  });
});

describe("registerHint", () => {
  it("gives the reason and never the free text", () => {
    // A teacher needs to know the absence is explained. The sentence a
    // parent wrote about their child's stomach is not for a classroom screen.
    expect(registerHint({ reason: "ILLNESS" })).toBe("Parent reported: illness");
    expect(registerHint({ reason: "MEDICAL_APPOINTMENT" })).toBe("Parent reported: medical appointment");
  });

  it("cannot leak a note because it never receives one", () => {
    const hint = registerHint({ reason: "OTHER", note: "He has chickenpox" } as { reason: string });
    expect(hint).not.toMatch(/chickenpox/i);
  });
});

describe("describeRange", () => {
  it("names a single day once rather than twice", () => {
    expect(describeRange({ fromDate: d("2026-08-17"), toDate: d("2026-08-17") })).toBe("Mon 17 Aug");
  });

  it("shows both ends of a longer absence", () => {
    expect(describeRange({ fromDate: d("2026-08-17"), toDate: d("2026-08-19") })).toBe("Mon 17 Aug – Wed 19 Aug");
  });

  it("reads in UTC, so an evening in a positive offset does not shift the day", () => {
    expect(describeRange({ fromDate: d("2026-08-17"), toDate: d("2026-08-17") })).not.toMatch(/16|18/);
  });
});

describe("describeDuration", () => {
  it("counts inclusively and gets the singular right", () => {
    expect(describeDuration({ fromDate: d("2026-08-17"), toDate: d("2026-08-17") })).toBe("1 day");
    expect(describeDuration({ fromDate: d("2026-08-17"), toDate: d("2026-08-19") })).toBe("3 days");
  });
});

describe("daysBetween", () => {
  it("is unaffected by the clocks changing", () => {
    // A 23- or 25-hour day must not round to the wrong number of days.
    expect(daysBetween(new Date("2026-03-28T12:00:00Z"), new Date("2026-03-30T12:00:00Z"))).toBe(2);
  });
});

describe("reasonLabel", () => {
  it("turns a stored value into something readable", () => {
    expect(reasonLabel("RELIGIOUS_OBSERVANCE")).toBe("Religious observance");
  });

  it("falls back rather than showing a raw enum to a parent", () => {
    expect(reasonLabel("SOMETHING_NEW")).toBe("Other");
  });
});
