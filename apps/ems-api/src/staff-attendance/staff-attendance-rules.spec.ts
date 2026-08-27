import {
  attendanceRate,
  isOnApprovedLeave,
  resolveStatus,
  summariseStaffAttendance,
  validateMark,
  type StaffAttendanceLike,
} from "./staff-attendance-rules";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

const APPROVED = {
  fromDate: day("2026-09-07"),
  toDate: day("2026-09-11"),
  type: "ANNUAL",
  status: "APPROVED",
};

describe("isOnApprovedLeave", () => {
  it("covers both ends of the range", () => {
    expect(isOnApprovedLeave([APPROVED], day("2026-09-07"))).toBe(true);
    expect(isOnApprovedLeave([APPROVED], day("2026-09-11"))).toBe(true);
    expect(isOnApprovedLeave([APPROVED], day("2026-09-09"))).toBe(true);
  });

  it("does not spill over the edges", () => {
    expect(isOnApprovedLeave([APPROVED], day("2026-09-06"))).toBe(false);
    expect(isOnApprovedLeave([APPROVED], day("2026-09-12"))).toBe(false);
  });

  it("ignores leave that has only been requested", () => {
    // Somebody who has asked and not yet been told is expected at work.
    // Treating a pending request as leave would hide a real absence.
    expect(isOnApprovedLeave([{ ...APPROVED, status: "REQUESTED" }], day("2026-09-09"))).toBe(false);
    expect(isOnApprovedLeave([{ ...APPROVED, status: "DECLINED" }], day("2026-09-09"))).toBe(false);
    expect(isOnApprovedLeave([{ ...APPROVED, status: "CANCELLED" }], day("2026-09-09"))).toBe(false);
  });

  it("is not confused by a time of day", () => {
    // Marks are taken at 8am; leave is stored at UTC midnight. Comparing raw
    // timestamps would make the first and last day of every leave miss.
    expect(isOnApprovedLeave([APPROVED], new Date("2026-09-07T08:30:00Z"))).toBe(true);
    expect(isOnApprovedLeave([APPROVED], new Date("2026-09-11T23:45:00Z"))).toBe(true);
  });

  it("copes with no leave at all", () => {
    expect(isOnApprovedLeave([], day("2026-09-09"))).toBe(false);
  });
});

describe("resolveStatus", () => {
  // The rule this module exists for.
  it("never records an absence on an approved leave day", () => {
    const resolved = resolveStatus("ABSENT", true);
    expect(resolved.status).toBe("ON_LEAVE");
    expect(resolved.note).toBe("Recorded as on leave: this absence falls inside approved leave.");
  });

  it("leaves an ordinary absence alone", () => {
    expect(resolveStatus("ABSENT", false)).toEqual({ status: "ABSENT", note: null });
  });

  it("does not erase somebody who came in on their leave day", () => {
    // They were there. Overwriting that with ON_LEAVE would delete work they
    // actually did.
    expect(resolveStatus("PRESENT", true)).toEqual({ status: "PRESENT", note: null });
    expect(resolveStatus("LATE", true)).toEqual({ status: "LATE", note: null });
  });
});

describe("validateMark", () => {
  it("wants to know how late a late person was", () => {
    expect(validateMark("LATE", null)).toBe("Say how late they were");
    expect(validateMark("LATE", 25)).toBeNull();
  });

  it("refuses minutes on a mark that is not late", () => {
    // A number left over from a status somebody changed would make "how late
    // was everybody" quietly wrong.
    expect(validateMark("PRESENT", 25)).toBe("Minutes late only apply to a late mark");
  });

  it("refuses a nonsense number of minutes", () => {
    expect(validateMark("LATE", 0)).toBe("Minutes late must be above zero");
    expect(validateMark("LATE", -5)).toBe("Minutes late must be above zero");
    expect(validateMark("LATE", 12.5)).toBe("Minutes late must be a whole number");
    expect(validateMark("LATE", 700)).toBe("That is more than a working day late");
  });

  it("is happy with no minutes on an ordinary mark", () => {
    expect(validateMark("PRESENT", null)).toBeNull();
    expect(validateMark("ON_LEAVE", undefined)).toBeNull();
  });
});

describe("summariseStaffAttendance", () => {
  const DAYS: StaffAttendanceLike[] = [
    { status: "PRESENT" },
    { status: "PRESENT" },
    { status: "LATE", minutesLate: 15 },
    { status: "LATE", minutesLate: 5 },
    { status: "ABSENT" },
    { status: "ON_LEAVE" },
    { status: "ON_LEAVE" },
  ];

  it("counts each kind and totals the lateness", () => {
    expect(summariseStaffAttendance(DAYS)).toMatchObject({
      present: 2,
      late: 2,
      absent: 1,
      onLeave: 2,
      minutesLate: 20,
    });
  });

  it("counts a late arrival as having attended", () => {
    // Late is not absent. Somebody who came in at 8:15 taught that day.
    expect(summariseStaffAttendance(DAYS).attended).toBe(4);
  });

  it("does not expect anybody on leave", () => {
    // The point. A teacher who took approved leave has not got worse
    // attendance for it.
    expect(summariseStaffAttendance(DAYS).expected).toBe(5);
  });

  it("summarises nothing as zeroes", () => {
    expect(summariseStaffAttendance([])).toMatchObject({ present: 0, expected: 0, minutesLate: 0 });
  });
});

describe("attendanceRate", () => {
  it("is a percentage of the days somebody was expected", () => {
    expect(attendanceRate(summariseStaffAttendance(DAYS_FOR_RATE))).toBe(80);
  });

  it("is null when nobody was expected", () => {
    // A month spent entirely on approved leave has no attendance rate.
    // Inventing one — 0% or 100% — puts a number no fact supports into a
    // payroll conversation.
    expect(attendanceRate(summariseStaffAttendance([{ status: "ON_LEAVE" }]))).toBeNull();
    expect(attendanceRate(summariseStaffAttendance([]))).toBeNull();
  });

  it("keeps one decimal place rather than rounding to a whole", () => {
    const days: StaffAttendanceLike[] = [
      ...Array.from({ length: 2 }, () => ({ status: "PRESENT" as const })),
      { status: "ABSENT" as const },
    ];
    expect(attendanceRate(summariseStaffAttendance(days))).toBe(66.7);
  });
});

const DAYS_FOR_RATE: StaffAttendanceLike[] = [
  { status: "PRESENT" },
  { status: "PRESENT" },
  { status: "PRESENT" },
  { status: "LATE", minutesLate: 10 },
  { status: "ABSENT" },
  { status: "ON_LEAVE" },
];
