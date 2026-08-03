import type { AttendanceStatus } from "ems-tenant-client";
import { summariseAttendance } from "./attendance-summary";

const ALL_STATUSES: AttendanceStatus[] = ["PRESENT", "ABSENT", "LATE", "EXCUSED"];

describe("summariseAttendance", () => {
  it("counts each status", () => {
    const summary = summariseAttendance(["PRESENT", "PRESENT", "ABSENT", "LATE", "EXCUSED"]);
    expect(summary.counts).toEqual({ PRESENT: 2, ABSENT: 1, LATE: 1, EXCUSED: 1 });
    expect(summary.total).toBe(5);
  });

  it("returns a null rate rather than NaN for an empty register", () => {
    // 0/0 is NaN, and a NaN attendance rate shown to a parent is worse
    // than showing nothing at all.
    const summary = summariseAttendance([]);
    expect(summary.presentRate).toBeNull();
    expect(summary.total).toBe(0);
    expect(summary.counts).toEqual({ PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 });
  });

  it("distinguishes 'no data' from 'attended nothing'", () => {
    expect(summariseAttendance([]).presentRate).toBeNull();
    expect(summariseAttendance(["ABSENT", "ABSENT"]).presentRate).toBe(0);
  });

  it("counts LATE as having attended", () => {
    // The child was in the room; marking them absent would misrepresent it.
    expect(summariseAttendance(["LATE"]).presentRate).toBe(100);
    expect(summariseAttendance(["PRESENT", "LATE"]).presentRate).toBe(100);
  });

  it("does not count EXCUSED as present, but reports it separately", () => {
    const summary = summariseAttendance(["PRESENT", "EXCUSED"]);
    expect(summary.presentRate).toBe(50);
    expect(summary.counts.EXCUSED).toBe(1);
  });

  it("rounds a recurring fraction to one decimal", () => {
    expect(summariseAttendance(["PRESENT", "ABSENT", "ABSENT"]).presentRate).toBe(33.3);
    expect(summariseAttendance(["PRESENT", "PRESENT", "ABSENT"]).presentRate).toBe(66.7);
  });

  it("reports a full and an empty attendance honestly", () => {
    expect(summariseAttendance(["PRESENT", "PRESENT"]).presentRate).toBe(100);
    expect(summariseAttendance(["ABSENT", "EXCUSED"]).presentRate).toBe(0);
  });

  it("always has counts summing to the total", () => {
    const statuses: AttendanceStatus[] = [
      ...Array<AttendanceStatus>(7).fill("PRESENT"),
      ...Array<AttendanceStatus>(3).fill("ABSENT"),
      ...Array<AttendanceStatus>(2).fill("LATE"),
      ...Array<AttendanceStatus>(1).fill("EXCUSED"),
    ];
    const summary = summariseAttendance(statuses);
    const summed = ALL_STATUSES.reduce((sum, status) => sum + summary.counts[status], 0);
    expect(summed).toBe(summary.total);
    expect(summary.total).toBe(13);
  });

  it("never returns a rate outside 0-100", () => {
    for (const status of ALL_STATUSES) {
      const rate = summariseAttendance([status]).presentRate;
      expect(rate).not.toBeNull();
      expect(rate as number).toBeGreaterThanOrEqual(0);
      expect(rate as number).toBeLessThanOrEqual(100);
    }
  });

  it("does not mutate a shared counts object between calls", () => {
    const first = summariseAttendance(["PRESENT"]);
    const second = summariseAttendance(["ABSENT"]);
    expect(first.counts.PRESENT).toBe(1);
    expect(second.counts.PRESENT).toBe(0);
  });
});
