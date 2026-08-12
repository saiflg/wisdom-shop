import {
  buildAlerts,
  buildOverview,
  daysAgo,
  formatMoney,
  isUnreachable,
  lacksPortalAccess,
  outstandingByCurrency,
  type OverviewInput,
} from "./parents-overview";

const NOW = new Date("2026-08-12T09:00:00Z");

function input(overrides: Partial<OverviewInput> = {}): OverviewInput {
  return {
    guardians: [],
    awaitingReply: [],
    absentToday: [],
    outstandingInvoices: [],
    ...overrides,
  };
}

function guardian(overrides: Partial<OverviewInput["guardians"][number]> = {}) {
  return {
    guardianUserId: "g1",
    firstName: "Amina",
    lastName: "Bello",
    email: "amina@example.com",
    phone: "+2348012345678",
    hasPassword: true,
    childNames: ["Tunde Bello"],
    ...overrides,
  };
}

describe("daysAgo", () => {
  it("counts calendar days, not elapsed hours", () => {
    // 11pm yesterday to 9am today is ten hours but one day, and an office
    // saying "waiting since yesterday" means the date, not the clock.
    expect(daysAgo(new Date("2026-08-11T23:00:00Z"), NOW)).toBe(1);
  });

  it("is zero for the same day", () => {
    expect(daysAgo(new Date("2026-08-12T01:00:00Z"), NOW)).toBe(0);
  });

  it("never goes negative for a future date", () => {
    expect(daysAgo(new Date("2026-09-01T00:00:00Z"), NOW)).toBe(0);
  });
});

describe("isUnreachable", () => {
  it("counts a phone number as reachable", () => {
    // A parent with only a number can be telephoned. Flagging them would send
    // an office chasing an email address it does not need.
    expect(isUnreachable({ email: null, phone: "+234801" })).toBe(false);
  });

  it("flags a parent with neither", () => {
    expect(isUnreachable({ email: null, phone: null })).toBe(true);
  });

  it("does not flag a parent with an email", () => {
    expect(isUnreachable({ email: "a@example.com", phone: null })).toBe(false);
  });
});

describe("lacksPortalAccess", () => {
  it("flags an email address with no password set", () => {
    // The school believes this family can see their child's marks. They cannot.
    expect(lacksPortalAccess({ email: "a@example.com", hasPassword: false })).toBe(true);
  });

  it("does NOT flag a parent with no email", () => {
    // A different problem, already reported as unreachable. Counting it twice
    // would make one family look like two.
    expect(lacksPortalAccess({ email: null, hasPassword: false })).toBe(false);
  });

  it("does not flag a working account", () => {
    expect(lacksPortalAccess({ email: "a@example.com", hasPassword: true })).toBe(false);
  });
});

describe("formatMoney", () => {
  it("renders minor units as major", () => {
    expect(formatMoney(1234567, "NGN")).toBe("NGN 12,345.67");
  });

  it("keeps two decimals on a round number", () => {
    expect(formatMoney(50000, "NGN")).toBe("NGN 500.00");
  });
});

describe("outstandingByCurrency", () => {
  it("keeps currencies apart rather than adding them", () => {
    // Adding NGN to USD produces a number true in neither.
    const totals = outstandingByCurrency([
      { outstandingCents: 10000, currency: "NGN" },
      { outstandingCents: 5000, currency: "USD" },
      { outstandingCents: 20000, currency: "NGN" },
    ]);
    expect(totals).toEqual([
      { currency: "NGN", cents: 30000 },
      { currency: "USD", cents: 5000 },
    ]);
  });

  it("returns nothing when nothing is owed", () => {
    expect(outstandingByCurrency([])).toEqual([]);
  });
});

describe("buildAlerts", () => {
  it("puts an unanswered family above everything else", () => {
    const alerts = buildAlerts(
      input({
        awaitingReply: [
          { studentProfileId: "s1", studentName: "Tunde Bello", waitingSince: new Date("2026-08-10T09:00:00Z") },
        ],
        absentToday: [{ studentProfileId: "s2", studentName: "Ada Okoro", className: "JSS 1A" }],
        outstandingInvoices: [
          {
            studentProfileId: "s3",
            studentName: "Chidi Eze",
            outstandingCents: 50000,
            currency: "NGN",
            dueDate: new Date("2026-07-01T00:00:00Z"),
          },
        ],
      }),
      NOW,
    );

    expect(alerts[0].kind).toBe("AWAITING_REPLY");
    expect(alerts[0].detail).toBe("Waiting 2 days");
  });

  it("sorts a longer wait above a shorter one", () => {
    const alerts = buildAlerts(
      input({
        awaitingReply: [
          { studentProfileId: "s1", studentName: "Recent", waitingSince: new Date("2026-08-12T08:00:00Z") },
          { studentProfileId: "s2", studentName: "Old", waitingSince: new Date("2026-08-05T08:00:00Z") },
        ],
      }),
      NOW,
    );

    expect(alerts.map((a) => a.headline)).toEqual([
      "Old's family is waiting for a reply",
      "Recent's family is waiting for a reply",
    ]);
  });

  it("puts a missing child above an unpaid bill", () => {
    // Money can wait a day. A child nobody can account for cannot.
    const alerts = buildAlerts(
      input({
        absentToday: [{ studentProfileId: "s1", studentName: "Ada", className: "JSS 1A" }],
        outstandingInvoices: [
          {
            studentProfileId: "s2",
            studentName: "Chidi",
            outstandingCents: 90000,
            currency: "NGN",
            dueDate: new Date("2026-01-01T00:00:00Z"),
          },
        ],
      }),
      NOW,
    );

    expect(alerts.map((a) => a.kind)).toEqual(["ABSENT", "UNPAID"]);
  });

  it("sorts an overdue bill above one not yet due", () => {
    const alerts = buildAlerts(
      input({
        outstandingInvoices: [
          {
            studentProfileId: "s1",
            studentName: "NotDue",
            outstandingCents: 1000,
            currency: "NGN",
            dueDate: new Date("2026-12-01T00:00:00Z"),
          },
          {
            studentProfileId: "s2",
            studentName: "Overdue",
            outstandingCents: 1000,
            currency: "NGN",
            dueDate: new Date("2026-06-01T00:00:00Z"),
          },
        ],
      }),
      NOW,
    );

    expect(alerts[0].headline).toContain("Overdue");
    expect(alerts[0].detail).toMatch(/Overdue by \d+ days/);
    expect(alerts[1].detail).toBe("Not yet due");
  });

  it("reports a parent with no contact details at all", () => {
    const alerts = buildAlerts(
      input({ guardians: [guardian({ email: null, phone: null })] }),
      NOW,
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0].kind).toBe("UNREACHABLE");
    expect(alerts[0].detail).toBe("Parent of Tunde Bello");
  });

  it("never reports the same parent as both unreachable and lacking access", () => {
    // One family, one row. Otherwise a school with ten paper-form parents
    // looks like it has twenty problems.
    const alerts = buildAlerts(
      input({ guardians: [guardian({ email: null, phone: null, hasPassword: false })] }),
      NOW,
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0].kind).toBe("UNREACHABLE");
  });

  it("reports an email address that was never set up", () => {
    const alerts = buildAlerts(
      input({ guardians: [guardian({ hasPassword: false })] }),
      NOW,
    );
    expect(alerts[0].kind).toBe("NO_PORTAL_ACCESS");
  });

  it("says nothing at all when a school is in good order", () => {
    // The empty state is the point: no invented busywork.
    expect(buildAlerts(input({ guardians: [guardian()] }), NOW)).toEqual([]);
  });
});

describe("buildOverview", () => {
  it("counts each concern separately and totals money per currency", () => {
    const overview = buildOverview(
      input({
        guardians: [guardian(), guardian({ guardianUserId: "g2", email: null, phone: null })],
        awaitingReply: [
          { studentProfileId: "s1", studentName: "Tunde", waitingSince: new Date("2026-08-11T09:00:00Z") },
        ],
        absentToday: [{ studentProfileId: "s2", studentName: "Ada", className: null }],
        outstandingInvoices: [
          { studentProfileId: "s3", studentName: "Chidi", outstandingCents: 25000, currency: "NGN", dueDate: null },
        ],
      }),
      NOW,
    );

    expect(overview.familyCount).toBe(2);
    expect(overview.awaitingReplyCount).toBe(1);
    expect(overview.absentTodayCount).toBe(1);
    expect(overview.unpaidCount).toBe(1);
    expect(overview.unreachableCount).toBe(1);
    expect(overview.outstandingTotals).toEqual([{ currency: "NGN", cents: 25000 }]);
  });

  it("is all zeroes for a school with no families yet", () => {
    const overview = buildOverview(input(), NOW);
    expect(overview.familyCount).toBe(0);
    expect(overview.alerts).toEqual([]);
    expect(overview.outstandingTotals).toEqual([]);
  });
});
