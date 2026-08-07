import { formatMinute, parseMinute } from "./use-timetable";

describe("timetable time handling", () => {
  it("formats minutes as a wall clock", () => {
    expect(formatMinute(510)).toBe("08:30");
    expect(formatMinute(0)).toBe("00:00");
    expect(formatMinute(1439)).toBe("23:59");
  });

  it("parses a wall clock back to minutes", () => {
    expect(parseMinute("08:30")).toBe(510);
    expect(parseMinute("8:30")).toBe(510);
  });

  it("round-trips, so editing a period and saving it does not shift the time", () => {
    for (const minute of [0, 1, 480, 510, 719, 1439]) {
      expect(parseMinute(formatMinute(minute))).toBe(minute);
    }
  });

  it("returns null for nonsense rather than guessing a time", () => {
    // A silently-wrong time would move a lesson without anyone noticing.
    expect(parseMinute("")).toBeNull();
    expect(parseMinute("25:00")).toBeNull();
    expect(parseMinute("08:60")).toBeNull();
    expect(parseMinute("half eight")).toBeNull();
    expect(parseMinute("0830")).toBeNull();
  });

  it("agrees with the API's parser on the same inputs", () => {
    // Both sides implement this; a divergence would show up as a lesson
    // landing in a different slot than the one clicked.
    const cases: [string, number | null][] = [
      ["08:30", 510],
      ["00:00", 0],
      ["23:59", 1439],
      ["24:00", null],
      ["12:5", null],
    ];
    for (const [input, expected] of cases) {
      expect(parseMinute(input)).toBe(expected);
    }
  });
});
