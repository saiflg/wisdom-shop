import {
  attendanceRate,
  balanceOf,
  buildOverview,
  flagsFor,
  type OverviewParts,
} from "./student-overview-rules";

const PARTS: OverviewParts = {
  attendance: { present: 40, absent: 2, late: 3, excused: 5 },
  invoicedCents: 150_000_00,
  paidCents: 150_000_00,
  invoiceCount: 2,
  behaviour: { merits: 4, concerns: 1, netPoints: 6, records: 5 },
  libraryOut: 1,
  libraryOverdue: 0,
  walletCents: 5_000_00,
  hasWallet: true,
};

describe("attendanceRate", () => {
  it("is a percentage of the days actually recorded", () => {
    expect(attendanceRate({ present: 8, absent: 2, late: 0, excused: 0 })).toBe(80);
  });

  it("counts a late arrival as having attended", () => {
    expect(attendanceRate({ present: 8, absent: 0, late: 2, excused: 0 })).toBe(100);
  });

  // The one that would be quoted back at a family who did everything right.
  it("counts an excused absence as attended, not as truancy", () => {
    // A child excused for a medical appointment did not truant.
    expect(attendanceRate({ present: 8, absent: 0, late: 0, excused: 2 })).toBe(100);
    expect(attendanceRate({ present: 5, absent: 5, late: 0, excused: 0 })).toBe(50);
  });

  // The whole design of this module.
  it("is null when nothing has been recorded", () => {
    // 0% would say they never came; 100% would say they never missed. Both
    // are inventions, and both get read off a screen at a parents' evening.
    expect(attendanceRate({ present: 0, absent: 0, late: 0, excused: 0 })).toBeNull();
  });

  it("keeps one decimal rather than rounding to a whole", () => {
    expect(attendanceRate({ present: 2, absent: 1, late: 0, excused: 0 })).toBe(66.7);
  });
});

describe("balanceOf", () => {
  it("is what is owed", () => {
    expect(balanceOf(150_000_00, 100_000_00, 2)).toBe(50_000_00);
  });

  it("is null for a child who has never been invoiced", () => {
    // Zero says "paid up". A family who has not been billed is in a different
    // position from one who has settled.
    expect(balanceOf(0, 0, 0)).toBeNull();
  });

  it("is zero, not null, once they have paid in full", () => {
    expect(balanceOf(150_000_00, 150_000_00, 1)).toBe(0);
  });

  it("can go negative when a family has overpaid", () => {
    // Real, and worth showing rather than clamping — it is money the school
    // owes back.
    expect(balanceOf(100_000_00, 120_000_00, 1)).toBe(-20_000_00);
  });
});

describe("flagsFor", () => {
  it("raises nothing for a child who is fine", () => {
    expect(flagsFor(PARTS)).toEqual([]);
  });

  it("puts an overdue library book first", () => {
    const flags = flagsFor({ ...PARTS, libraryOverdue: 2, invoicedCents: 10, paidCents: 0 });
    expect(flags[0]).toBe("2 library books overdue");
  });

  it("singularises one book", () => {
    expect(flagsFor({ ...PARTS, libraryOverdue: 1 })[0]).toBe("1 library book overdue");
  });

  it("flags attendance below 90 percent, with the figure", () => {
    const flags = flagsFor({ ...PARTS, attendance: { present: 8, absent: 2, late: 0, excused: 0 } });
    expect(flags).toContain("Attendance is 80%");
  });

  it("does not flag attendance it cannot compute", () => {
    // A child with no registers yet must not appear as an attendance problem.
    const flags = flagsFor({ ...PARTS, attendance: { present: 0, absent: 0, late: 0, excused: 0 } });
    expect(flags.some((flag) => flag.startsWith("Attendance"))).toBe(false);
  });

  it("flags fees only when something is actually owed", () => {
    expect(flagsFor({ ...PARTS, paidCents: 100_000_00 })).toContain("Fees outstanding");
    expect(flagsFor({ ...PARTS, invoiceCount: 0, invoicedCents: 0, paidCents: 0 })).not.toContain(
      "Fees outstanding",
    );
  });

  // Fairness to the child.
  it("does not flag a concern that is outweighed by merits", () => {
    // Four merits and one concern is a good term. Surfacing the concern alone
    // would misrepresent them to whoever opens this next.
    expect(flagsFor(PARTS).some((flag) => flag.includes("concerns"))).toBe(false);
    const flags = flagsFor({ ...PARTS, behaviour: { merits: 1, concerns: 4, netPoints: -6, records: 5 } });
    expect(flags).toContain("More concerns than merits recorded");
  });
});

describe("buildOverview", () => {
  it("assembles the figures", () => {
    const overview = buildOverview(PARTS);
    expect(overview.attendanceRate).toBe(96);
    expect(overview.balanceCents).toBe(0);
    expect(overview.behaviour).toEqual({ merits: 4, concerns: 1, netPoints: 6 });
    expect(overview.walletCents).toBe(5_000_00);
  });

  it("says nothing rather than zero where nothing is recorded", () => {
    const overview = buildOverview({
      attendance: { present: 0, absent: 0, late: 0, excused: 0 },
      invoicedCents: 0,
      paidCents: 0,
      invoiceCount: 0,
      behaviour: { merits: 0, concerns: 0, netPoints: 0, records: 0 },
      libraryOut: 0,
      libraryOverdue: 0,
      walletCents: null,
      hasWallet: false,
    });

    expect(overview.attendanceRate).toBeNull();
    expect(overview.balanceCents).toBeNull();
    // Not { merits: 0, concerns: 0 } — a child nothing has been written about
    // is different from one assessed and found blameless.
    expect(overview.behaviour).toBeNull();
    expect(overview.walletCents).toBeNull();
    expect(overview.flags).toEqual([]);
  });

  it("reports a wallet holding nothing as zero, not as absent", () => {
    const overview = buildOverview({ ...PARTS, walletCents: 0, hasWallet: true });
    expect(overview.walletCents).toBe(0);
  });
});
