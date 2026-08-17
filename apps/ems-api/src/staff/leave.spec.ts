import {
  MAX_BACKDATE_DAYS,
  balanceOf,
  calendarDays,
  canCancel,
  consumesAllowance,
  decisionProblem,
  describeLeave,
  leaveLabel,
  overlaps,
  requestProblem,
  workingDays,
  type LeaveLike,
} from "./leave";

// 2027-03-01 is a Monday.
const MON = new Date("2027-03-01T00:00:00.000Z");
const FRI = new Date("2027-03-05T00:00:00.000Z");
const SAT = new Date("2027-03-06T00:00:00.000Z");
const SUN = new Date("2027-03-07T00:00:00.000Z");
const NEXT_MON = new Date("2027-03-08T00:00:00.000Z");
const NOW = new Date("2027-02-20T09:00:00.000Z");

function leave(overrides: Partial<LeaveLike> = {}): LeaveLike {
  return { fromDate: MON, toDate: FRI, type: "ANNUAL", status: "APPROVED", ...overrides };
}

describe("workingDays", () => {
  it("counts a working week as five", () => {
    expect(workingDays(MON, FRI)).toBe(5);
  });

  it("does NOT charge for the weekend in between", () => {
    // Friday to Monday is two days off. Charging four is wrong in a way a
    // teacher notices immediately and rightly complains about.
    expect(workingDays(FRI, NEXT_MON)).toBe(2);
  });

  it("counts a single weekday as one", () => {
    expect(workingDays(MON, MON)).toBe(1);
  });

  it("counts a weekend as nothing", () => {
    expect(workingDays(SAT, SUN)).toBe(0);
  });

  it("returns zero rather than a negative for a backwards range", () => {
    expect(workingDays(FRI, MON)).toBe(0);
  });

  it("handles a range spanning months", () => {
    // 1 to 31 March 2027: 23 weekdays.
    expect(workingDays(MON, new Date("2027-03-31T00:00:00.000Z"))).toBe(23);
  });
});

describe("calendarDays", () => {
  it("includes both ends", () => {
    expect(calendarDays(MON, FRI)).toBe(5);
    expect(calendarDays(MON, MON)).toBe(1);
  });
});

describe("consumesAllowance", () => {
  it("is only annual leave", () => {
    // Counting maternity or bereavement against a teacher's holiday is a
    // policy decision no software should make quietly for a school.
    expect(consumesAllowance("ANNUAL")).toBe(true);
    expect(consumesAllowance("MATERNITY")).toBe(false);
    expect(consumesAllowance("COMPASSIONATE")).toBe(false);
    expect(consumesAllowance("SICK")).toBe(false);
  });
});

describe("balanceOf", () => {
  it("subtracts approved annual leave from the allowance", () => {
    const balance = balanceOf({ entitlementDays: 20, approved: [leave()], pending: [] });
    expect(balance.takenDays).toBe(5);
    expect(balance.remainingDays).toBe(15);
  });

  it("holds pending days SEPARATELY from approved ones", () => {
    // An administrator deciding a request needs to know approving it would
    // overdraw the balance; a merged total cannot tell them.
    const balance = balanceOf({
      entitlementDays: 20,
      approved: [leave()],
      pending: [leave({ status: "REQUESTED" })],
    });
    expect(balance.takenDays).toBe(5);
    expect(balance.pendingDays).toBe(5);
    expect(balance.remainingDays).toBe(15);
    expect(balance.summary).toMatch(/5 awaiting a decision/);
  });

  it("ignores leave that does not come out of the allowance", () => {
    const balance = balanceOf({ entitlementDays: 20, approved: [leave({ type: "MATERNITY" })], pending: [] });
    expect(balance.takenDays).toBe(0);
    expect(balance.remainingDays).toBe(20);
  });

  it("says the allowance is untracked rather than reporting zero left", () => {
    // "0 days remaining" for a school that never set an allowance is a lie
    // that stops people asking for leave they are entitled to.
    const balance = balanceOf({ entitlementDays: 0, approved: [leave()], pending: [] });
    expect(balance.untracked).toBe(true);
    expect(balance.summary).toMatch(/no allowance set/);
    expect(balance.summary).toMatch(/5 days of annual leave taken/);
  });

  it("can go negative, and says so rather than clamping", () => {
    // A school that approved more than the allowance needs to see that.
    const balance = balanceOf({
      entitlementDays: 3,
      approved: [leave()],
      pending: [],
    });
    expect(balance.remainingDays).toBe(-2);
  });
});

describe("requestProblem", () => {
  const base = { type: "ANNUAL", now: NOW, existing: [] as LeaveLike[] };

  it("allows an ordinary request", () => {
    expect(requestProblem({ ...base, fromDate: MON, toDate: FRI })).toBeNull();
  });

  it("refuses a backwards range", () => {
    expect(requestProblem({ ...base, fromDate: FRI, toDate: MON })).toMatch(/cannot be before/i);
  });

  it("refuses a weekend-only request, rather than recording nothing", () => {
    expect(requestProblem({ ...base, fromDate: SAT, toDate: SUN })).toMatch(/only weekend days/i);
  });

  it("REFUSES a clash with leave already booked", () => {
    const existing = [leave({ status: "APPROVED" })];
    const problem = requestProblem({ ...base, fromDate: MON, toDate: MON, existing });
    expect(problem).toMatch(/already have annual leave booked/i);
  });

  it("treats an undecided request as blocking too", () => {
    const existing = [leave({ status: "REQUESTED" })];
    expect(requestProblem({ ...base, fromDate: FRI, toDate: FRI, existing })).not.toBeNull();
  });

  it("does NOT let a declined request block a new one", () => {
    // A refusal is not a booking.
    const existing = [leave({ status: "DECLINED" }), leave({ status: "CANCELLED" })];
    expect(requestProblem({ ...base, fromDate: MON, toDate: FRI, existing })).toBeNull();
  });

  it("refuses far backdating and names who can record it", () => {
    const old = new Date("2026-01-05T00:00:00.000Z");
    const problem = requestProblem({ ...base, fromDate: old, toDate: old });
    expect(problem).toMatch(new RegExp(`${MAX_BACKDATE_DAYS} days ago`));
    expect(problem).toMatch(/office/i);
  });

  it("insists on a reason for unpaid leave", () => {
    expect(requestProblem({ ...base, type: "UNPAID", fromDate: MON, toDate: FRI })).toMatch(/why the leave is unpaid/i);
    expect(requestProblem({ ...base, type: "UNPAID", fromDate: MON, toDate: FRI, reason: "Family matter" })).toBeNull();
  });

  it("refuses a kind of leave it does not recognise", () => {
    expect(requestProblem({ ...base, type: "SABBATICAL", fromDate: MON, toDate: FRI })).toMatch(/kind of leave/i);
  });
});

describe("decisionProblem", () => {
  it("allows another administrator to decide", () => {
    expect(decisionProblem({ status: "REQUESTED", requestedByUserId: "a", deciderUserId: "b" })).toBeNull();
  });

  it("REFUSES somebody deciding their own request", () => {
    // The rule this module exists for. An administrator asking for a
    // fortnight is asking somebody else.
    const problem = decisionProblem({ status: "REQUESTED", requestedByUserId: "a", deciderUserId: "a" });
    expect(problem).toMatch(/cannot decide your own/i);
    expect(problem).toMatch(/another administrator/i);
  });

  it("refuses to decide something already decided", () => {
    expect(decisionProblem({ status: "APPROVED", requestedByUserId: "a", deciderUserId: "b" }))
      .toMatch(/already been approved/i);
    expect(decisionProblem({ status: "DECLINED", requestedByUserId: "a", deciderUserId: "b" }))
      .toMatch(/already been declined/i);
  });
});

describe("canCancel", () => {
  const request = { ...leave({ status: "APPROVED" }), requestedByUserId: "me" };

  it("lets the person who asked take it back before it starts", () => {
    expect(canCancel(request, "me", NOW)).toBe(true);
  });

  it("refuses once it has started", () => {
    // Cancelling leave you are already on is a conversation, not a button.
    expect(canCancel(request, "me", new Date("2027-03-03T00:00:00.000Z"))).toBe(false);
  });

  it("refuses somebody else's request", () => {
    expect(canCancel(request, "somebody-else", NOW)).toBe(false);
  });

  it("refuses one already declined", () => {
    expect(canCancel({ ...request, status: "DECLINED" }, "me", NOW)).toBe(false);
  });
});

describe("overlaps", () => {
  it("catches a range touching at one end", () => {
    expect(overlaps({ fromDate: MON, toDate: FRI }, { fromDate: FRI, toDate: NEXT_MON })).toBe(true);
  });

  it("leaves adjacent ranges alone", () => {
    // 1–5 March and 6–8 March touch but do not share a day, so somebody can
    // take the first week and the next Monday as two separate requests.
    expect(overlaps({ fromDate: MON, toDate: FRI }, { fromDate: SAT, toDate: NEXT_MON })).toBe(false);
    expect(overlaps({ fromDate: MON, toDate: MON }, { fromDate: FRI, toDate: FRI })).toBe(false);
  });
});

describe("wording", () => {
  it("describes a range with its working-day cost", () => {
    expect(describeLeave(MON, FRI)).toBe("Mon 1 Mar – Fri 5 Mar (5 days)");
    expect(describeLeave(MON, MON)).toBe("Mon 1 Mar (1 day)");
  });

  it("turns a stored type into words", () => {
    expect(leaveLabel("COMPASSIONATE")).toBe("Compassionate leave");
    expect(leaveLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
  });
});
