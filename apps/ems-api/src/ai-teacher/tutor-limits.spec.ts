import {
  checkTurnAllowed,
  MAX_TURNS_PER_SESSION,
  MAX_TURNS_PER_STUDENT_PER_DAY,
  startOfDay,
} from "./tutor-limits";

describe("checkTurnAllowed", () => {
  const fresh = { turnsInSession: 0, turnsToday: 0 };

  it("allows a first question", () => {
    expect(checkTurnAllowed(fresh, "ACTIVE")).toEqual({ allowed: true });
  });

  it("refuses once a session has ended", () => {
    const decision = checkTurnAllowed(fresh, "ENDED");
    expect(decision.allowed).toBe(false);
    // The message has to tell the student what to do next, not just say no.
    if (!decision.allowed) expect(decision.reason).toMatch(/new one/i);
  });

  it("allows a paused class through, or pausing would be a trap", () => {
    expect(checkTurnAllowed(fresh, "PAUSED")).toEqual({ allowed: true });
  });

  it("allows the last turn under the session cap but not the one after", () => {
    expect(checkTurnAllowed({ turnsInSession: MAX_TURNS_PER_SESSION - 1, turnsToday: 0 }, "ACTIVE")).toEqual({
      allowed: true,
    });
    expect(checkTurnAllowed({ turnsInSession: MAX_TURNS_PER_SESSION, turnsToday: 0 }, "ACTIVE").allowed).toBe(false);
  });

  it("allows the last turn under the daily cap but not the one after", () => {
    expect(checkTurnAllowed({ turnsInSession: 0, turnsToday: MAX_TURNS_PER_STUDENT_PER_DAY - 1 }, "ACTIVE")).toEqual({
      allowed: true,
    });
    expect(
      checkTurnAllowed({ turnsInSession: 0, turnsToday: MAX_TURNS_PER_STUDENT_PER_DAY }, "ACTIVE").allowed,
    ).toBe(false);
  });

  it("mentions the daily reset when it is the daily cap that bites", () => {
    const decision = checkTurnAllowed({ turnsInSession: 1, turnsToday: MAX_TURNS_PER_STUDENT_PER_DAY }, "ACTIVE");
    if (!decision.allowed) expect(decision.reason).toMatch(/tomorrow/i);
    else fail("expected the daily cap to refuse");
  });

  it("reports the session cap before the daily one when both are hit", () => {
    // Starting a new session is the actionable fix; being told to come back
    // tomorrow when a fresh session would work is misleading.
    const decision = checkTurnAllowed(
      { turnsInSession: MAX_TURNS_PER_SESSION, turnsToday: MAX_TURNS_PER_STUDENT_PER_DAY },
      "ACTIVE",
    );
    if (!decision.allowed) expect(decision.reason).toMatch(/session/i);
    else fail("expected a refusal");
  });

  it("keeps the daily cap above the session cap, or sessions could never fill", () => {
    expect(MAX_TURNS_PER_STUDENT_PER_DAY).toBeGreaterThan(MAX_TURNS_PER_SESSION);
  });
});

describe("startOfDay", () => {
  it("strips the time", () => {
    const midnight = startOfDay(new Date(2026, 7, 8, 15, 42, 9, 500));
    expect(midnight.getHours()).toBe(0);
    expect(midnight.getMinutes()).toBe(0);
    expect(midnight.getSeconds()).toBe(0);
    expect(midnight.getMilliseconds()).toBe(0);
    expect(midnight.getDate()).toBe(8);
  });

  it("does not roll back a day for a time just after midnight", () => {
    // A student studying at 00:05 must get today's allowance, not yesterday's
    // already-spent one.
    const midnight = startOfDay(new Date(2026, 7, 8, 0, 5));
    expect(midnight.getDate()).toBe(8);
    expect(midnight.getMonth()).toBe(7);
  });

  it("handles the first of a month", () => {
    const midnight = startOfDay(new Date(2026, 8, 1, 23, 59));
    expect(midnight.getDate()).toBe(1);
    expect(midnight.getMonth()).toBe(8);
  });
});
