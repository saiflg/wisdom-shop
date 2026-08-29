import { canSeeStudent, studentAudienceFor, type StudentAudience } from "./student-visibility";

describe("studentAudienceFor", () => {
  it("gives a pupil themselves, not the whole school", () => {
    /*
     * The bug this file was written for. GET /students carries no @Roles, and
     * the scoping was phrased as "GUARDIAN and not SCHOOL_ADMIN" — so a pupil
     * matched neither branch and fell through to the one returning everybody:
     * every child's name and email, and every linked guardian's name and
     * email, from a child's own account.
     */
    expect(studentAudienceFor(["STUDENT"])).toBe("SELF");
  });

  it("gives staff the whole register", () => {
    expect(studentAudienceFor(["SCHOOL_ADMIN"])).toBe("ALL");
    expect(studentAudienceFor(["TEACHER"])).toBe("ALL");
  });

  it("gives a guardian only the children they are linked to", () => {
    expect(studentAudienceFor(["GUARDIAN"])).toBe("LINKED_CHILDREN");
  });

  it("does not cut a teacher who is also a parent down to their own children", () => {
    // The old condition did exactly that, because a teacher-guardian is
    // "GUARDIAN and not SCHOOL_ADMIN". They then could not see their own
    // class register. Having a child at the school is not a demotion.
    expect(studentAudienceFor(["TEACHER", "GUARDIAN"])).toBe("ALL");
    expect(studentAudienceFor(["SCHOOL_ADMIN", "GUARDIAN"])).toBe("ALL");
  });

  it("gives nothing to a role nobody has thought about", () => {
    // The point of deny-by-default. A rule shaped "everyone except X" hands
    // the register to whatever role is added next, silently.
    expect(studentAudienceFor([])).toBe("NONE");
    expect(studentAudienceFor(["LIBRARIAN"])).toBe("NONE");
    expect(studentAudienceFor(["NURSE", "DRIVER"])).toBe("NONE");
  });
});

describe("canSeeStudent", () => {
  const child = {
    studentProfileId: "profile-aisha",
    studentUserId: "user-aisha",
    guardianUserIds: ["user-mum"],
  };

  const cases: Array<[StudentAudience, string, boolean]> = [
    ["ALL", "user-anyone", true],
    ["LINKED_CHILDREN", "user-mum", true],
    ["LINKED_CHILDREN", "user-other-parent", false],
    ["SELF", "user-aisha", true],
    ["SELF", "user-classmate", false],
    ["NONE", "user-aisha", false],
  ];

  it.each(cases)("%s viewed by %s -> %s", (audience, userId, expected) => {
    expect(canSeeStudent(audience, child, { userId })).toBe(expected);
  });

  it("does not let one pupil read another pupil's record", () => {
    // The individual-record half of the same hole: findOne only refused a
    // GUARDIAN who was not linked, so a pupil walked straight through.
    expect(canSeeStudent("SELF", child, { userId: "user-classmate" })).toBe(false);
  });

  it("does not confuse a guardian's own account with the child's", () => {
    expect(canSeeStudent("SELF", child, { userId: "user-mum" })).toBe(false);
    expect(canSeeStudent("LINKED_CHILDREN", child, { userId: "user-aisha" })).toBe(false);
  });
});
