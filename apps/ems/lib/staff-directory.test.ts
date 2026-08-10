import {
  bankSummary,
  employmentState,
  employmentSummary,
  filterStaff,
  isTeaching,
  matchesStaffQuery,
  missingBankDetails,
} from "./staff-directory";
import type { StaffMember } from "./use-staff";

function member(overrides: Partial<StaffMember> = {}): StaffMember {
  return {
    id: "u1",
    email: "ade.balogun@example.com",
    firstName: "Ade",
    lastName: "Balogun",
    roles: ["TEACHER"],
    staffNumber: "STF-001",
    jobTitle: "Head of Mathematics",
    employmentType: "FULL_TIME",
    startDate: "2026-09-01T00:00:00.000Z",
    endDate: null,
    bank: {
      bankName: "First Bank",
      bankCode: "011",
      accountName: "Ade Balogun",
      accountNumberMasked: "••••6789",
      hasAccountNumber: true,
    },
    ...overrides,
  };
}

describe("matchesStaffQuery", () => {
  it("finds people by the things written on a form", () => {
    const ade = member();
    expect(matchesStaffQuery(ade, "balogun")).toBe(true);
    expect(matchesStaffQuery(ade, "Ade Balogun")).toBe(true);
    expect(matchesStaffQuery(ade, "STF-001")).toBe(true);
    expect(matchesStaffQuery(ade, "mathematics")).toBe(true);
    expect(matchesStaffQuery(ade, "ade.balogun@example.com")).toBe(true);
  });

  it("is case and whitespace insensitive", () => {
    expect(matchesStaffQuery(member(), "  BALOGUN ")).toBe(true);
  });

  it("matches everyone when nothing has been typed", () => {
    expect(matchesStaffQuery(member(), "")).toBe(true);
    expect(matchesStaffQuery(member(), "   ")).toBe(true);
  });

  it("NEVER matches on the masked account number", () => {
    // The whole point of the mask. If the last four digits were searchable,
    // anyone holding the roster could confirm a colleague's account number
    // four digits at a time by typing guesses — a disclosure oracle built
    // out of a field that exists to prevent disclosure.
    const ade = member();
    expect(matchesStaffQuery(ade, "6789")).toBe(false);
    expect(matchesStaffQuery(ade, "••••6789")).toBe(false);
  });

  it("does not fall over on a record with nothing filled in", () => {
    const bare = member({ email: null, staffNumber: null, jobTitle: null });
    expect(matchesStaffQuery(bare, "balogun")).toBe(true);
    expect(matchesStaffQuery(bare, "bursar")).toBe(false);
  });
});

describe("teaching and non-teaching", () => {
  it("counts anyone who teaches as teaching, including a head who also administers", () => {
    expect(isTeaching(member({ roles: ["TEACHER"] }))).toBe(true);
    expect(isTeaching(member({ roles: ["SCHOOL_ADMIN", "TEACHER"] }))).toBe(true);
    expect(isTeaching(member({ roles: ["SCHOOL_ADMIN"] }))).toBe(false);
  });

  it("splits the roster without losing anybody", () => {
    const staff = [
      member({ id: "a", roles: ["TEACHER"] }),
      member({ id: "b", roles: ["SCHOOL_ADMIN"] }),
      member({ id: "c", roles: ["SCHOOL_ADMIN", "TEACHER"] }),
    ];
    expect(filterStaff(staff, { group: "teaching" }).map((m) => m.id)).toEqual(["a", "c"]);
    expect(filterStaff(staff, { group: "non-teaching" }).map((m) => m.id)).toEqual(["b"]);
    expect(filterStaff(staff, { group: "all" })).toHaveLength(3);
  });

  it("applies the search within the group, not instead of it", () => {
    const staff = [
      member({ id: "a", lastName: "Balogun", roles: ["TEACHER"] }),
      member({ id: "b", lastName: "Balogun", roles: ["SCHOOL_ADMIN"] }),
    ];
    expect(filterStaff(staff, { group: "teaching", query: "balogun" }).map((m) => m.id)).toEqual(["a"]);
  });
});

describe("employmentState", () => {
  const today = new Date("2026-08-10T09:00:00.000Z");

  it("treats a blank record as employed", () => {
    // Schools fill these in late. Reading a missing start date as "not yet
    // started" would drop real staff off the roster and out of payroll.
    expect(employmentState({ startDate: null, endDate: null }, today)).toBe("CURRENT");
  });

  it("recognises someone who has not started", () => {
    expect(employmentState({ startDate: "2026-09-01T00:00:00.000Z", endDate: null }, today)).toBe("FUTURE");
  });

  it("recognises someone who has left", () => {
    expect(employmentState({ startDate: "2020-01-01T00:00:00.000Z", endDate: "2026-07-31T00:00:00.000Z" }, today)).toBe(
      "ENDED",
    );
  });

  it("keeps someone employed on their last day", () => {
    // A contract ending on the 31st is still a contract at nine in the
    // morning on the 31st — comparing instants would say otherwise.
    expect(employmentState({ startDate: null, endDate: "2026-08-10T00:00:00.000Z" }, today)).toBe("CURRENT");
  });

  it("counts the first day as started", () => {
    expect(employmentState({ startDate: "2026-08-10T00:00:00.000Z", endDate: null }, today)).toBe("CURRENT");
  });

  it("says ENDED even when the end date precedes the start date", () => {
    // Nonsense dates happen when they are typed. Whatever this record means,
    // it does not mean "pay this person".
    expect(employmentState({ startDate: "2027-01-01T00:00:00.000Z", endDate: "2026-01-01T00:00:00.000Z" }, today)).toBe(
      "ENDED",
    );
  });
});

describe("summaries", () => {
  it("describes the job", () => {
    expect(employmentSummary(member())).toBe("Head of Mathematics · Full time · STF-001");
  });

  it("still says something about a record with no details yet", () => {
    expect(employmentSummary(member({ jobTitle: null, employmentType: null, staffNumber: null }))).toBe("Teacher");
    expect(
      employmentSummary(
        member({ jobTitle: null, employmentType: null, staffNumber: null, roles: ["SCHOOL_ADMIN"] }),
      ),
    ).toBe("Administrator");
  });

  it("says whether payroll can pay them, and never a digit of how", () => {
    expect(bankSummary(member())).toBe("First Bank on file");
    expect(bankSummary(member({ bank: { ...member().bank, bankName: null } }))).toBe("Account on file");

    const summary = bankSummary(member());
    expect(summary).not.toContain("6789");
    expect(summary).not.toContain("•");
  });

  it("says plainly when there is nothing on file", () => {
    expect(bankSummary(member({ bank: { ...member().bank, hasAccountNumber: false } }))).toBe("No account on file");
  });
});

describe("missingBankDetails", () => {
  const today = new Date("2026-08-10T09:00:00.000Z");

  it("lists the people a payroll run would skip", () => {
    const staff = [
      member({ id: "paid" }),
      member({ id: "unpaid", bank: { ...member().bank, hasAccountNumber: false } }),
    ];
    expect(missingBankDetails(staff, today).map((m) => m.id)).toEqual(["unpaid"]);
  });

  it("does not nag about someone who has already left", () => {
    const staff = [
      member({
        id: "gone",
        endDate: "2026-07-31T00:00:00.000Z",
        bank: { ...member().bank, hasAccountNumber: false },
      }),
    ];
    expect(missingBankDetails(staff, today)).toHaveLength(0);
  });

  it("does nag about somebody starting next month", () => {
    // Better to find out now than on the day payroll runs.
    const staff = [
      member({
        id: "starting",
        startDate: "2026-09-01T00:00:00.000Z",
        bank: { ...member().bank, hasAccountNumber: false },
      }),
    ];
    expect(missingBankDetails(staff, today).map((m) => m.id)).toEqual(["starting"]);
  });
});
