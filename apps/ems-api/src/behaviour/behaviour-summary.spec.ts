import { summariseBehaviour, validatePoints, type BehaviourRecordLike } from "./behaviour-summary";

const at = (day: number) => new Date(`2026-09-${String(day).padStart(2, "0")}T09:00:00Z`);

const RECORDS: BehaviourRecordLike[] = [
  { kind: "MERIT", points: 2, category: "Helpfulness", occurredAt: at(1) },
  { kind: "MERIT", points: 3, category: "Helpfulness", occurredAt: at(2) },
  { kind: "MERIT", points: 1, category: "Effort", occurredAt: at(3) },
  { kind: "CONCERN", points: 2, category: "Lateness", occurredAt: at(4) },
];

describe("summariseBehaviour", () => {
  it("counts merits and concerns separately from their points", () => {
    const summary = summariseBehaviour(RECORDS);
    expect(summary).toMatchObject({ merits: 3, concerns: 1, meritPoints: 6, concernPoints: 2, netPoints: 4 });
  });

  it("keeps counts and points apart", () => {
    // Ten one-point merits and one ten-point merit are the same number of
    // points and a very different term. A summary that collapsed them would
    // hide which actually happened.
    const many = Array.from({ length: 10 }, () => ({
      kind: "MERIT" as const,
      points: 1,
      category: "Effort",
      occurredAt: at(1),
    }));
    const one = [{ kind: "MERIT" as const, points: 10, category: "Effort", occurredAt: at(1) }];

    expect(summariseBehaviour(many).meritPoints).toBe(summariseBehaviour(one).meritPoints);
    expect(summariseBehaviour(many).merits).toBe(10);
    expect(summariseBehaviour(one).merits).toBe(1);
  });

  it("lets the net go negative", () => {
    // A child having more concerns than merits is exactly what this is for.
    // Clamping it at zero would hide the term that needs attention.
    const summary = summariseBehaviour([
      { kind: "MERIT", points: 1, category: "Effort", occurredAt: at(1) },
      { kind: "CONCERN", points: 5, category: "Lateness", occurredAt: at(2) },
    ]);
    expect(summary.netPoints).toBe(-4);
  });

  it("never lets a negative point value credit a concern", () => {
    // Points are stored non-negative, but a stray negative from anywhere must
    // not turn a concern into something that improves the total.
    const summary = summariseBehaviour([
      { kind: "CONCERN", points: -5, category: "Lateness", occurredAt: at(1) },
    ]);
    expect(summary.concernPoints).toBe(0);
    expect(summary.netPoints).toBe(0);
  });

  it("ranks categories, commonest first", () => {
    expect(summariseBehaviour(RECORDS).topCategories).toEqual([
      { category: "Helpfulness", count: 2 },
      { category: "Effort", count: 1 },
      { category: "Lateness", count: 1 },
    ]);
  });

  it("breaks ties by name so the order never reshuffles", () => {
    // The same records must always produce the same order; a summary that
    // reorders between page loads reads as the data having changed.
    const tied: BehaviourRecordLike[] = [
      { kind: "MERIT", points: 1, category: "Zeal", occurredAt: at(1) },
      { kind: "MERIT", points: 1, category: "Effort", occurredAt: at(2) },
    ];
    expect(summariseBehaviour(tied).topCategories.map((c) => c.category)).toEqual(["Effort", "Zeal"]);
    expect(summariseBehaviour([...tied].reverse()).topCategories.map((c) => c.category)).toEqual([
      "Effort",
      "Zeal",
    ]);
  });

  it("ignores a blank category rather than listing an empty one", () => {
    const summary = summariseBehaviour([{ kind: "MERIT", points: 1, category: "  ", occurredAt: at(1) }]);
    expect(summary.merits).toBe(1);
    expect(summary.topCategories).toEqual([]);
  });

  it("summarises nothing as zeroes, not as an error", () => {
    expect(summariseBehaviour([])).toEqual({
      merits: 0,
      concerns: 0,
      meritPoints: 0,
      concernPoints: 0,
      netPoints: 0,
      topCategories: [],
    });
  });

  it("shows at most five categories", () => {
    const many = "abcdefgh".split("").map((letter) => ({
      kind: "MERIT" as const,
      points: 1,
      category: letter,
      occurredAt: at(1),
    }));
    expect(summariseBehaviour(many).topCategories).toHaveLength(5);
  });
});

describe("validatePoints", () => {
  it("accepts an ordinary value", () => {
    expect(validatePoints(3)).toBeNull();
    expect(validatePoints(0)).toBeNull();
  });

  it("refuses a negative, and says why", () => {
    expect(validatePoints(-1)).toBe("Points cannot be negative — the kind decides which way they count");
  });

  it("refuses a fraction and an implausible total", () => {
    expect(validatePoints(1.5)).toBe("Points must be a whole number");
    expect(validatePoints(500)).toBe("That is more points than a single record should carry");
  });
});
