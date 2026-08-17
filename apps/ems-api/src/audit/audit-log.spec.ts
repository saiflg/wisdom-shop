import {
  SYSTEM_ACTOR,
  actorOf,
  announcementSummary,
  attendanceAmendmentSummary,
  bankAccessSummary,
  categoryLabel,
  endOfDay,
  invitationSummary,
  matchesFilter,
  mergeEntries,
  money,
  paymentSummary,
  payrollSummary,
  type AuditEntry,
} from "./audit-log";

function entry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: "a1",
    at: new Date("2026-08-17T10:00:00.000Z"),
    actorName: "Demo Admin",
    actorUserId: "u1",
    category: "MONEY",
    summary: "Recorded NGN 50,000.00 against invoice FEE-000004",
    reason: null,
    source: "fee_payments",
    ...overrides,
  };
}

describe("actorOf", () => {
  it("keeps the name that was snapshotted at the time", () => {
    // Never resolved from the id now: the person may have left, and the log
    // must say who it was then.
    expect(actorOf("Halima Sani", "u9")).toEqual({ actorName: "Halima Sani", actorUserId: "u9" });
  });

  it("names the system when a gateway took the money, not a person", () => {
    // Attributing an online payment to whoever was logged in would be a lie
    // in the one log that answers "who".
    expect(actorOf("PAYSTACK webhook", "gateway")).toEqual({
      actorName: SYSTEM_ACTOR,
      actorUserId: null,
    });
  });

  it("names the system rather than leaving a blank actor", () => {
    expect(actorOf(null, null).actorName).toBe(SYSTEM_ACTOR);
    expect(actorOf("   ", "u1").actorName).toBe(SYSTEM_ACTOR);
  });

  it("never invents a user id for a system action", () => {
    expect(actorOf(null, null).actorUserId).toBeNull();
  });
});

describe("mergeEntries", () => {
  const older = entry({ id: "old", at: new Date("2026-08-01T09:00:00.000Z") });
  const newer = entry({ id: "new", at: new Date("2026-08-17T09:00:00.000Z") });

  it("returns newest first across every source", () => {
    expect(mergeEntries([[older], [newer]], 10).map((e) => e.id)).toEqual(["new", "old"]);
  });

  it("does NOT let one busy source crowd out another", () => {
    // The trap: fetching limit/sources from each would drop a busy day's
    // payments because attendance had older rows to fill its quota. Every
    // source is over-fetched and merged before slicing.
    const payments = Array.from({ length: 5 }, (_, i) =>
      entry({ id: `pay${i}`, at: new Date(`2026-08-1${5 + (i % 3)}T10:00:00.000Z`), category: "MONEY" }),
    );
    const attendance = [entry({ id: "att", at: new Date("2026-08-17T23:00:00.000Z"), category: "CHILD_RECORD" })];

    const merged = mergeEntries([payments, attendance], 3);
    expect(merged[0]?.id).toBe("att");
    expect(merged).toHaveLength(3);
  });

  it("is stable when two things happened at the same instant", () => {
    const a = entry({ id: "aaa" });
    const b = entry({ id: "bbb" });
    expect(mergeEntries([[b], [a]], 10).map((e) => e.id)).toEqual(["aaa", "bbb"]);
  });

  it("honours the limit", () => {
    expect(mergeEntries([[older, newer]], 1)).toHaveLength(1);
  });

  it("copes with a source that has nothing", () => {
    expect(mergeEntries([[], [newer], []], 10).map((e) => e.id)).toEqual(["new"]);
  });
});

describe("matchesFilter", () => {
  it("passes everything when nothing is asked for", () => {
    expect(matchesFilter(entry(), {})).toBe(true);
  });

  it("filters by category", () => {
    expect(matchesFilter(entry({ category: "MONEY" }), { categories: ["MONEY"] })).toBe(true);
    expect(matchesFilter(entry({ category: "MONEY" }), { categories: ["STAFF_PRIVACY"] })).toBe(false);
  });

  it("searches the actor and the summary", () => {
    expect(matchesFilter(entry(), { query: "demo" })).toBe(true);
    expect(matchesFilter(entry(), { query: "FEE-000004" })).toBe(true);
    expect(matchesFilter(entry(), { query: "nothing like it" })).toBe(false);
  });

  it("SEARCHES THE REASON, which is what this log is opened for", () => {
    // "Why did somebody open that bank record" is the question.
    const reveal = entry({ reason: "Preparing the October payroll run", summary: "Revealed a bank account" });
    expect(matchesFilter(reveal, { query: "october payroll" })).toBe(true);
  });

  it("includes the whole of the end day", () => {
    // Filtering "to 17 August" means the end of the 17th, not midnight at
    // its start — otherwise a whole day silently vanishes.
    const lateThatDay = entry({ at: new Date("2026-08-17T22:30:00.000Z") });
    expect(matchesFilter(lateThatDay, { to: new Date("2026-08-17T00:00:00.000Z") })).toBe(true);
  });

  it("excludes what falls before the start", () => {
    const early = entry({ at: new Date("2026-08-01T10:00:00.000Z") });
    expect(matchesFilter(early, { from: new Date("2026-08-10T00:00:00.000Z") })).toBe(false);
  });
});

describe("endOfDay", () => {
  it("moves to the last millisecond, without changing the date", () => {
    expect(endOfDay(new Date("2026-08-17T00:00:00.000Z")).toISOString()).toBe("2026-08-17T23:59:59.999Z");
  });
});

describe("the wording", () => {
  it("names the person whose privacy was touched", () => {
    expect(bankAccessSummary("Musa Muhammad")).toBe("Revealed Musa Muhammad's bank account number");
  });

  it("says what a mark changed from and to", () => {
    expect(attendanceAmendmentSummary("ABSENT", "PRESENT", "Tunde Adewale")).toBe(
      "Changed Tunde Adewale's attendance mark from absent to present",
    );
  });

  it("copes when the child can no longer be named", () => {
    expect(attendanceAmendmentSummary("ABSENT", "EXCUSED", null)).toMatch(/^Changed a attendance mark/);
  });

  it("quotes the receipt when there is one", () => {
    expect(paymentSummary("NGN 50,000.00", "FEE-000004", "RCT-000003")).toContain("receipt RCT-000003");
    expect(paymentSummary("NGN 50,000.00", "FEE-000004", null)).not.toContain("receipt");
  });

  it("names the payroll month rather than its number", () => {
    expect(payrollSummary("approved", 2026, 8)).toBe("Approved the August 2026 payroll");
    expect(payrollSummary("marked as paid", 2026, 12)).toBe("Marked as paid the December 2026 payroll");
  });

  it("says who an announcement reached", () => {
    expect(announcementSummary("School closed", "WHOLE_SCHOOL", 412)).toBe(
      'Announced "School closed" to whole school — reached 412',
    );
  });

  it("distinguishes inviting from accepting", () => {
    expect(invitationSummary("sent", "Segun Adewale")).toBe("Invited Segun Adewale");
    expect(invitationSummary("accepted", "Segun Adewale")).toMatch(/set their own password/);
    expect(invitationSummary("cancelled", "Segun Adewale")).toMatch(/^Cancelled the invitation/);
  });
});

describe("money", () => {
  it("reads the way a bursar would say it", () => {
    expect(money(5_000_000, "NGN")).toBe("NGN 50,000.00");
  });
});

describe("categoryLabel", () => {
  it("is words, not an enum", () => {
    expect(categoryLabel("STAFF_PRIVACY")).toBe("Staff privacy");
    expect(categoryLabel("CHILD_RECORD")).toBe("Child's record");
  });
});
