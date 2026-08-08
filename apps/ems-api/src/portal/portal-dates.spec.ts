import { bucketByDue, dueBucket, endOfDay, isWeekend, startOfDay, weekdayOf } from "./portal-dates";

describe("weekdayOf", () => {
  it("names the day in the spelling the timetable stores", () => {
    // 2027-03-08 is a Monday.
    expect(weekdayOf(new Date(2027, 2, 8))).toBe("MONDAY");
    expect(weekdayOf(new Date(2027, 2, 12))).toBe("FRIDAY");
    expect(weekdayOf(new Date(2027, 2, 13))).toBe("SATURDAY");
    expect(weekdayOf(new Date(2027, 2, 14))).toBe("SUNDAY");
  });

  it("returns weekend days rather than hiding them", () => {
    // A school running Saturday classes is real, and deciding on a student's
    // behalf that Saturday has no lessons would hide them.
    expect(weekdayOf(new Date(2027, 2, 13))).toBe("SATURDAY");
    expect(isWeekend(new Date(2027, 2, 13))).toBe(true);
    expect(isWeekend(new Date(2027, 2, 8))).toBe(false);
  });

  it("uses local time, not UTC, so late evening is still today", () => {
    // 23:30 on a Monday is Monday, whatever UTC thinks.
    expect(weekdayOf(new Date(2027, 2, 8, 23, 30))).toBe("MONDAY");
  });
});

describe("startOfDay and endOfDay", () => {
  it("bracket the whole day", () => {
    const now = new Date(2027, 2, 8, 14, 22, 5, 250);
    expect(startOfDay(now).getHours()).toBe(0);
    expect(startOfDay(now).getMinutes()).toBe(0);
    expect(endOfDay(now).getHours()).toBe(23);
    expect(endOfDay(now).getMinutes()).toBe(59);
    expect(endOfDay(now).getDate()).toBe(8);
  });

  it("does not roll into a neighbouring day", () => {
    const justAfterMidnight = new Date(2027, 2, 8, 0, 0, 1);
    expect(startOfDay(justAfterMidnight).getDate()).toBe(8);
    expect(endOfDay(justAfterMidnight).getDate()).toBe(8);
  });
});

describe("dueBucket", () => {
  const now = new Date(2027, 2, 8, 10, 0);

  it("has no deadline when there is none", () => {
    expect(dueBucket(null, now)).toBe("no-deadline");
    expect(dueBucket(undefined, now)).toBe("no-deadline");
  });

  it("is due today for anything later the same day", () => {
    expect(dueBucket(new Date(2027, 2, 8, 23, 59), now)).toBe("today");
    expect(dueBucket(new Date(2027, 2, 8, 10, 30), now)).toBe("today");
  });

  it("is upcoming for a later day", () => {
    expect(dueBucket(new Date(2027, 2, 9, 9, 0), now)).toBe("upcoming");
  });

  it("is overdue once the moment has passed", () => {
    expect(dueBucket(new Date(2027, 2, 8, 9, 59), now)).toBe("overdue");
    expect(dueBucket(new Date(2027, 2, 7, 23, 59), now)).toBe("overdue");
  });

  it("does not call the deadline itself overdue", () => {
    // Must agree with the submission rules, or the portal says late about
    // work the server would happily accept.
    const deadline = new Date(2027, 2, 8, 10, 0);
    expect(dueBucket(deadline, deadline)).toBe("today");
    expect(dueBucket(deadline, new Date(deadline.getTime() + 1))).toBe("overdue");
  });
});

describe("bucketByDue", () => {
  const now = new Date(2027, 2, 8, 10, 0);
  const item = (dueAt: Date | null) => ({ dueAt });

  it("sorts work into piles", () => {
    const summary = bucketByDue(
      [
        item(new Date(2027, 2, 7)),
        item(new Date(2027, 2, 8, 15, 0)),
        item(new Date(2027, 2, 20)),
        item(null),
      ],
      now,
    );

    expect(summary.overdue).toHaveLength(1);
    expect(summary.today).toHaveLength(1);
    expect(summary.upcoming).toHaveLength(1);
    expect(summary.noDeadline).toHaveLength(1);
  });

  it("puts the most overdue first, because that is what to do next", () => {
    const summary = bucketByDue([item(new Date(2027, 2, 6)), item(new Date(2027, 2, 1))], now);
    expect(summary.overdue.map((i) => i.dueAt?.getDate())).toEqual([1, 6]);
  });

  it("puts the soonest upcoming first", () => {
    const summary = bucketByDue([item(new Date(2027, 3, 1)), item(new Date(2027, 2, 9))], now);
    expect(summary.upcoming.map((i) => i.dueAt?.getMonth())).toEqual([2, 3]);
  });

  it("handles an empty list without inventing piles", () => {
    expect(bucketByDue([], now)).toEqual({ overdue: [], today: [], upcoming: [], noDeadline: [] });
  });

  it("does not mutate the caller's array", () => {
    const items = [item(new Date(2027, 2, 6)), item(new Date(2027, 2, 1))];
    bucketByDue(items, now);
    expect(items[0].dueAt?.getDate()).toBe(6);
  });
});
