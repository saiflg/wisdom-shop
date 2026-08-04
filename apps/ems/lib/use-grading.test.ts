import { formatPercent, formatScore, parseScoreToHundredths } from "./use-grading";

describe("parseScoreToHundredths", () => {
  it("reads whole and fractional marks", () => {
    expect(parseScoreToHundredths("17")).toBe(1700);
    expect(parseScoreToHundredths("17.5")).toBe(1750);
    expect(parseScoreToHundredths("17.25")).toBe(1725);
    expect(parseScoreToHundredths("0")).toBe(0);
  });

  it("pads a single decimal rather than misreading it", () => {
    // "17.5" is seventeen and a half marks, not seventeen and five
    // hundredths — the same trap as money.
    expect(parseScoreToHundredths("17.5")).toBe(1750);
    expect(parseScoreToHundredths("17.05")).toBe(1705);
  });

  it("returns null for anything that isn't a clean mark", () => {
    expect(parseScoreToHundredths("")).toBeNull();
    expect(parseScoreToHundredths("abc")).toBeNull();
    expect(parseScoreToHundredths("-5")).toBeNull();
    expect(parseScoreToHundredths("17.555")).toBeNull();
  });
});

describe("formatting", () => {
  it("renders percentages without float maths", () => {
    expect(formatPercent(7700)).toBe("77.00%");
    expect(formatPercent(8567)).toBe("85.67%");
    expect(formatPercent(10000)).toBe("100.00%");
  });

  it("shows a dash, never 0%, when there is no basis to judge", () => {
    // A student excused from everything has no grade — reporting 0% would
    // read as a fail they never earned.
    expect(formatPercent(null)).toBe("—");
    expect(formatScore(null)).toBe("—");
  });

  it("drops a trailing .00 on whole marks but keeps real fractions", () => {
    expect(formatScore(1800)).toBe("18");
    expect(formatScore(1750)).toBe("17.50");
  });

  it("round-trips with the parser", () => {
    for (const input of ["17.5", "20", "0.25", "99.99"]) {
      const hundredths = parseScoreToHundredths(input) as number;
      expect(parseScoreToHundredths(formatScore(hundredths))).toBe(hundredths);
    }
  });
});
