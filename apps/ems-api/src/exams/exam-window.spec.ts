import {
  canStart,
  deadlineFor,
  isExpired,
  remainingSeconds,
  seededOrder,
  type ExamTiming,
} from "./exam-window";

const at = (iso: string) => new Date(iso);

const exam = (overrides: Partial<ExamTiming> = {}): ExamTiming => ({
  status: "PUBLISHED",
  durationMinutes: 60,
  opensAt: null,
  closesAt: null,
  ...overrides,
});

describe("canStart", () => {
  const now = at("2026-08-09T10:00:00Z");

  it("allows a published paper with no window", () => {
    expect(canStart(exam(), false, now)).toEqual({ allowed: true });
  });

  it("refuses a draft", () => {
    expect(canStart(exam({ status: "DRAFT" }), false, now).allowed).toBe(false);
  });

  it("refuses a closed paper", () => {
    expect(canStart(exam({ status: "CLOSED" }), false, now).allowed).toBe(false);
  });

  it("refuses before the window opens", () => {
    const decision = canStart(exam({ opensAt: at("2026-08-09T11:00:00Z") }), false, now);
    expect(decision).toEqual({ allowed: false, reason: "This exam has not opened yet" });
  });

  it("refuses after the window closes", () => {
    const decision = canStart(exam({ closesAt: at("2026-08-09T09:00:00Z") }), false, now);
    expect(decision).toEqual({ allowed: false, reason: "This exam has closed" });
  });

  it("allows starting exactly as the window opens", () => {
    expect(canStart(exam({ opensAt: now }), false, now).allowed).toBe(true);
  });

  it("allows starting exactly as the window closes", () => {
    // The same reasoning as homework handed in on the deadline: on time is
    // on time, and the alternative is arguing over a millisecond.
    expect(canStart(exam({ closesAt: now }), false, now).allowed).toBe(true);
  });

  it("refuses a second attempt", () => {
    expect(canStart(exam(), true, now)).toEqual({
      allowed: false,
      reason: "You have already started this exam",
    });
  });

  it("says 'already sat' rather than 'closed' when both are true", () => {
    // The more useful message for the student standing in front of it.
    const decision = canStart(exam({ status: "CLOSED" }), true, now);
    expect(decision).toEqual({ allowed: false, reason: "You have already started this exam" });
  });
});

describe("deadlineFor", () => {
  it("is the duration from the moment they started", () => {
    expect(deadlineFor(exam({ durationMinutes: 45 }), at("2026-08-09T10:00:00Z"))).toEqual(
      at("2026-08-09T10:45:00Z"),
    );
  });

  it("never runs past the paper's closing time", () => {
    // Starting five minutes before close gets five minutes, not an hour —
    // otherwise a late start runs past the end of the school day.
    const timing = exam({ durationMinutes: 60, closesAt: at("2026-08-09T10:05:00Z") });
    expect(deadlineFor(timing, at("2026-08-09T10:00:00Z"))).toEqual(at("2026-08-09T10:05:00Z"));
  });

  it("uses the full duration when it finishes before the paper closes", () => {
    const timing = exam({ durationMinutes: 30, closesAt: at("2026-08-09T23:00:00Z") });
    expect(deadlineFor(timing, at("2026-08-09T10:00:00Z"))).toEqual(at("2026-08-09T10:30:00Z"));
  });
});

describe("isExpired", () => {
  const expiresAt = at("2026-08-09T10:30:00Z");

  it("is false before the deadline", () => {
    expect(isExpired(expiresAt, at("2026-08-09T10:29:59Z"))).toBe(false);
  });

  it("is false exactly on the deadline", () => {
    expect(isExpired(expiresAt, expiresAt)).toBe(false);
  });

  it("is true after the deadline", () => {
    expect(isExpired(expiresAt, at("2026-08-09T10:30:01Z"))).toBe(true);
  });
});

describe("remainingSeconds", () => {
  const expiresAt = at("2026-08-09T10:30:00Z");

  it("counts whole seconds left", () => {
    expect(remainingSeconds(expiresAt, at("2026-08-09T10:29:00Z"))).toBe(60);
  });

  it("rounds down so it never overstates the time left", () => {
    // 900ms shows as 0, not 1 — the alternative reads as time being stolen.
    expect(remainingSeconds(expiresAt, at("2026-08-09T10:29:59.100Z"))).toBe(0);
  });

  it("is never negative", () => {
    expect(remainingSeconds(expiresAt, at("2026-08-09T11:00:00Z"))).toBe(0);
  });
});

describe("seededOrder", () => {
  it("is a permutation: every question appears exactly once", () => {
    const order = seededOrder(10, 12345);
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("is stable for the same seed, so a refresh shows the same paper", () => {
    expect(seededOrder(20, 999)).toEqual(seededOrder(20, 999));
  });

  it("differs between students", () => {
    expect(seededOrder(20, 1)).not.toEqual(seededOrder(20, 2));
  });

  it("actually reorders rather than returning the input", () => {
    const identity = Array.from({ length: 20 }, (_, index) => index);
    expect(seededOrder(20, 4242)).not.toEqual(identity);
  });

  it("handles empty and single-question papers", () => {
    expect(seededOrder(0, 7)).toEqual([]);
    expect(seededOrder(1, 7)).toEqual([0]);
  });
});
