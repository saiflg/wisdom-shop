import {
  buildTurnover,
  describeTenure,
  hasLeft,
  tenureMonths,
  UNSECTIONED,
  type Leaver,
} from "./staff-turnover";

function leaver(overrides: Partial<Leaver> = {}): Leaver {
  return {
    staffProfileId: "sp1",
    name: "Rabi Abubakar",
    section: "Primary",
    jobTitle: "Teacher",
    startDate: new Date("2024-06-01T00:00:00Z"),
    endDate: new Date("2026-07-31T00:00:00Z"),
    lastMonthlyCents: 53_687_20,
    currency: "NGN",
    ...overrides,
  };
}

describe("tenureMonths", () => {
  it("counts whole months between two dates", () => {
    expect(tenureMonths(new Date("2024-06-01T00:00:00Z"), new Date("2026-07-01T00:00:00Z"))).toBe(25);
  });

  it("is zero within the same month", () => {
    expect(tenureMonths(new Date("2026-07-02T00:00:00Z"), new Date("2026-07-28T00:00:00Z"))).toBe(0);
  });

  it("is null when nobody recorded a start date", () => {
    expect(tenureMonths(null, new Date("2026-07-01T00:00:00Z"))).toBeNull();
  });

  it("never goes negative when the dates were entered the wrong way round", () => {
    // A data entry error, not somebody who worked negative time.
    expect(tenureMonths(new Date("2026-07-01T00:00:00Z"), new Date("2024-06-01T00:00:00Z"))).toBe(0);
  });
});

describe("describeTenure", () => {
  it("says years and months", () => {
    expect(describeTenure(26)).toBe("2 years 2 months");
  });

  it("drops the months when it is a whole number of years", () => {
    expect(describeTenure(24)).toBe("2 years");
  });

  it("uses singulars properly", () => {
    expect(describeTenure(13)).toBe("1 year 1 month");
  });

  it("says months alone under a year", () => {
    expect(describeTenure(7)).toBe("7 months");
  });

  it("does not say '0 months'", () => {
    expect(describeTenure(0)).toBe("Less than a month");
  });

  it("admits when the start date is missing rather than guessing", () => {
    expect(describeTenure(null)).toBe("Start date not recorded");
  });
});

describe("hasLeft", () => {
  const now = new Date("2026-08-14T00:00:00Z");

  it("is true for somebody whose last day has passed", () => {
    expect(hasLeft(new Date("2026-07-31T00:00:00Z"), now)).toBe(true);
  });

  it("is FALSE for a resignation already handed in but not yet effective", () => {
    // They are still working. Counting them as gone shows a vacancy that is
    // not open and a salary the school is still paying.
    expect(hasLeft(new Date("2026-09-30T00:00:00Z"), now)).toBe(false);
  });

  it("is false for current staff", () => {
    expect(hasLeft(null, now)).toBe(false);
  });
});

describe("buildTurnover", () => {
  it("groups leavers by section", () => {
    const report = buildTurnover([
      leaver({ section: "Primary" }),
      leaver({ staffProfileId: "sp2", name: "Musa Muhammad", section: "Security" }),
      leaver({ staffProfileId: "sp3", name: "Isah Ibrahim", section: "Islamiyyah" }),
    ]);
    expect(report.groups.map((g) => g.section)).toEqual(["Islamiyyah", "Primary", "Security"]);
    expect(report.total).toBe(3);
  });

  it("totals what each section's departures were costing per month", () => {
    const report = buildTurnover([
      leaver({ lastMonthlyCents: 50_000_00 }),
      leaver({ staffProfileId: "sp2", name: "Second", lastMonthlyCents: 30_000_00 }),
    ]);
    expect(report.groups[0].monthlyCents).toBe(80_000_00);
    expect(report.monthlyCents).toBe(80_000_00);
  });

  it("puts the most recent departure first within a section", () => {
    // Last month's resignations are the vacancies still open.
    const report = buildTurnover([
      leaver({ name: "Older", endDate: new Date("2025-01-31T00:00:00Z") }),
      leaver({ staffProfileId: "sp2", name: "Newer", endDate: new Date("2026-07-31T00:00:00Z") }),
    ]);
    expect(report.groups[0].rows.map((r) => r.name)).toEqual(["Newer", "Older"]);
  });

  it("numbers rows continuously across sections", () => {
    const report = buildTurnover([
      leaver({ section: "Primary" }),
      leaver({ staffProfileId: "sp2", name: "B", section: "Security" }),
    ]);
    expect(report.groups.flatMap((g) => g.rows.map((r) => r.serial))).toEqual([1, 2]);
  });

  describe("staff with no section", () => {
    it("still appear, under a named gap", () => {
      const report = buildTurnover([leaver({ section: null })]);
      expect(report.groups[0].section).toBe(UNSECTIONED);
    });

    it("sort last, so a real section is never buried", () => {
      const report = buildTurnover([
        leaver({ section: null }),
        leaver({ staffProfileId: "sp2", name: "B", section: "Zoology" }),
      ]);
      expect(report.groups.map((g) => g.section)).toEqual(["Zoology", UNSECTIONED]);
    });

    it("treats a blank section as unrecorded", () => {
      expect(buildTurnover([leaver({ section: "   " })]).groups[0].section).toBe(UNSECTIONED);
    });
  });

  describe("leavers whose last pay is unknown", () => {
    it("are counted, so the replacement bill is not read as complete", () => {
      // Otherwise the total quietly understates and nobody knows by how much.
      const report = buildTurnover([
        leaver({ lastMonthlyCents: 40_000_00 }),
        leaver({ staffProfileId: "sp2", name: "Never paid", lastMonthlyCents: null }),
      ]);
      expect(report.monthlyCents).toBe(40_000_00);
      expect(report.withoutSalary).toBe(1);
    });
  });

  it("averages tenure over the people whose start date is known", () => {
    const report = buildTurnover([
      leaver({ startDate: new Date("2024-07-01T00:00:00Z"), endDate: new Date("2026-07-01T00:00:00Z") }),
      leaver({
        staffProfileId: "sp2",
        name: "B",
        startDate: new Date("2025-07-01T00:00:00Z"),
        endDate: new Date("2026-07-01T00:00:00Z"),
      }),
      leaver({ staffProfileId: "sp3", name: "C", startDate: null }),
    ]);
    // 24 and 12 months; the unknown one is excluded rather than counted as 0.
    expect(report.averageTenureMonths).toBe(18);
  });

  it("is empty and honest for a school nobody has left", () => {
    expect(buildTurnover([])).toEqual({
      groups: [],
      total: 0,
      monthlyCents: 0,
      withoutSalary: 0,
      averageTenureMonths: null,
    });
  });
});
