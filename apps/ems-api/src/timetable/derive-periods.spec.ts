import { derivePeriods, validateDayShape, type DayShape } from "./derive-periods";
import { validatePeriodStructure } from "./timetable-rules";

/** 08:00 to 14:00, eight lessons, break after the fourth. */
const TYPICAL: DayShape = {
  dayStartMinute: 8 * 60,
  dayEndMinute: 14 * 60,
  periodsPerDay: 8,
  breakAfterPeriod: 4,
  breakLengthMinutes: 30,
};

describe("validateDayShape", () => {
  it("accepts an ordinary school day", () => {
    expect(validateDayShape(TYPICAL)).toBeNull();
  });

  it("refuses a day that ends before it starts", () => {
    expect(validateDayShape({ ...TYPICAL, dayEndMinute: 7 * 60 })).toMatch(/ends at or before/i);
  });

  it("refuses more periods than the day can hold", () => {
    // Better to say it does not fit than to produce two-minute lessons,
    // which reads as the software having misunderstood.
    const problem = validateDayShape({ ...TYPICAL, periodsPerDay: 200 });
    expect(problem).toMatch(/do not fit/i);
    expect(problem).toContain("08:00");
    expect(problem).toContain("14:00");
  });

  it("refuses a break placed after a period that does not exist", () => {
    expect(validateDayShape({ ...TYPICAL, breakAfterPeriod: 20 })).toMatch(/cannot come after period 20/i);
  });

  it("refuses a break with no length", () => {
    expect(validateDayShape({ ...TYPICAL, breakLengthMinutes: 0 })).toMatch(/needs a length/i);
  });

  it("accepts a day with no break at all", () => {
    expect(validateDayShape({ ...TYPICAL, breakAfterPeriod: null })).toBeNull();
  });

  it("refuses zero periods", () => {
    expect(validateDayShape({ ...TYPICAL, periodsPerDay: 0 })).toMatch(/at least one period/i);
  });
});

describe("derivePeriods", () => {
  it("lays out a typical day", () => {
    const day = derivePeriods(TYPICAL);

    // 360 minutes minus a 30-minute break is 330, over 8 periods = 41 each,
    // with 2 minutes left over.
    expect(day.periodLengthMinutes).toBe(41);
    expect(day.leftoverMinutes).toBe(2);
    expect(day.periods.filter((period) => period.isTeaching)).toHaveLength(8);
    expect(day.periods.filter((period) => !period.isTeaching)).toHaveLength(1);
  });

  it("starts the first period exactly when the school day starts", () => {
    expect(derivePeriods(TYPICAL).periods[0]?.startMinute).toBe(8 * 60);
  });

  it("produces periods that touch exactly, never overlapping or gapping", () => {
    // The rule the rest of timetabling depends on. Building by accumulation
    // rather than by multiplying an index is what makes this hold.
    const day = derivePeriods(TYPICAL);
    for (let i = 1; i < day.periods.length; i += 1) {
      expect(day.periods[i]?.startMinute).toBe(day.periods[i - 1]?.endMinute);
    }
  });

  it("produces a structure the timetable's own validator accepts", () => {
    // The two must agree: a derived day that validatePeriodStructure would
    // reject is a day the school could not save.
    for (const shape of [
      TYPICAL,
      { ...TYPICAL, breakAfterPeriod: null },
      { ...TYPICAL, periodsPerDay: 5 },
      { ...TYPICAL, periodsPerDay: 12, breakAfterPeriod: 6 },
      { dayStartMinute: 450, dayEndMinute: 1000, periodsPerDay: 9, breakAfterPeriod: 3, breakLengthMinutes: 45 },
    ]) {
      const day = derivePeriods(shape);
      expect(validatePeriodStructure(day.periods)).toBeNull();
    }
  });

  it("puts the break exactly where it was asked for", () => {
    const day = derivePeriods({ ...TYPICAL, breakAfterPeriod: 2 });
    expect(day.periods[2]?.label).toBe("Break");
    expect(day.periods[2]?.isTeaching).toBe(false);
    expect(day.periods[3]?.label).toBe("Period 3");
  });

  it("omits the break when none is wanted", () => {
    const day = derivePeriods({ ...TYPICAL, breakAfterPeriod: null });
    expect(day.periods.every((period) => period.isTeaching)).toBe(true);
    expect(day.periods).toHaveLength(8);
  });

  it("reports leftover minutes rather than stretching the last period", () => {
    // Silently absorbing them is how a timetable stops matching the bell.
    const day = derivePeriods({ ...TYPICAL, periodsPerDay: 7 });
    const lengths = day.periods.filter((p) => p.isTeaching).map((p) => p.endMinute - p.startMinute);
    expect(new Set(lengths).size).toBe(1);
    expect(day.leftoverMinutes).toBeGreaterThan(0);
  });

  it("never runs past the end of the school day", () => {
    // The break has to stay inside the day too — "break after period 4" in a
    // three-period day is incoherent, and derivePeriods rightly refuses it,
    // so each case carries a break that fits.
    for (const [periodsPerDay, breakAfterPeriod] of [
      [1, null],
      [3, 2],
      [7, 4],
      [8, 4],
      [11, 6],
    ] as const) {
      const day = derivePeriods({ ...TYPICAL, periodsPerDay, breakAfterPeriod });
      const last = day.periods[day.periods.length - 1];
      expect(last?.endMinute).toBeLessThanOrEqual(TYPICAL.dayEndMinute);
    }
  });

  it("refuses a break placed beyond the number of periods", () => {
    // Which is what the case above would otherwise have hidden.
    expect(() => derivePeriods({ ...TYPICAL, periodsPerDay: 3, breakAfterPeriod: 4 })).toThrow(
      /cannot come after period 4/i,
    );
  });

  it("divides evenly when the arithmetic works out", () => {
    // 08:00-14:00 is 360 minutes; six periods, no break, is exactly 60 each.
    const day = derivePeriods({
      dayStartMinute: 480,
      dayEndMinute: 840,
      periodsPerDay: 6,
      breakAfterPeriod: null,
    });
    expect(day.periodLengthMinutes).toBe(60);
    expect(day.leftoverMinutes).toBe(0);
  });

  it("throws rather than returning a nonsense day", () => {
    expect(() => derivePeriods({ ...TYPICAL, periodsPerDay: 500 })).toThrow(/do not fit/i);
  });
});
