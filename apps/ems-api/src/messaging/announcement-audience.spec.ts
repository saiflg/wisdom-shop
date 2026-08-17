import {
  announcementDedupeKey,
  announcementProblem,
  audienceLabel,
  describeReach,
  planAudience,
  sendWarning,
  type AudienceInput,
  type GuardianCandidate,
} from "./announcement-audience";

function guardian(overrides: Partial<GuardianCandidate> = {}): GuardianCandidate {
  return {
    userId: "g1",
    name: "Amina Bello",
    email: "amina@example.com",
    phone: "0803 111 2222",
    notifyByEmail: true,
    notifyBySms: true,
    classIds: ["c1"],
    ...overrides,
  };
}

const staff = { userId: "t1", name: "Grace Okonkwo", email: "grace@school.ng", phone: "0805 000 1111" };

function input(overrides: Partial<AudienceInput> = {}): AudienceInput {
  return { guardians: [guardian()], staff: [staff], ...overrides };
}

describe("de-duplication", () => {
  it("sends ONE copy to a parent with three children", () => {
    // The bug this module exists to prevent. Three links, one person.
    const threeChildren = [
      guardian({ classIds: ["c1"] }),
      guardian({ classIds: ["c2"] }),
      guardian({ classIds: ["c3"] }),
    ];
    const plan = planAudience({ guardians: threeChildren, staff: [] }, "ALL_PARENTS", "EMAIL");
    expect(plan.reach).toBe(1);
  });

  it("sends ONE copy to somebody who is both staff and a parent", () => {
    // Ade Balogun in the demo data is exactly this.
    const both = { guardians: [guardian({ userId: "u9", email: "ade@school.ng" })], staff: [{ ...staff, userId: "u9", email: "ade@school.ng" }] };
    expect(planAudience(both, "WHOLE_SCHOOL", "EMAIL").reach).toBe(1);
  });

  it("sends ONE copy to two parents sharing a mailbox", () => {
    // Two users, one inbox. Two copies is the thing a parent notices.
    const sharing = [
      guardian({ userId: "g1", name: "Amina Bello", email: "family@example.com" }),
      guardian({ userId: "g2", name: "Musa Bello", email: "family@example.com" }),
    ];
    const plan = planAudience({ guardians: sharing, staff: [] }, "ALL_PARENTS", "EMAIL");
    expect(plan.reach).toBe(1);
  });

  it("is case-insensitive about addresses", () => {
    const sharing = [
      guardian({ userId: "g1", email: "Family@Example.com" }),
      guardian({ userId: "g2", email: "family@example.com" }),
    ];
    expect(planAudience({ guardians: sharing, staff: [] }, "ALL_PARENTS", "EMAIL").reach).toBe(1);
  });

  it("skips a parent of three ONCE, not three times", () => {
    const unreachable = [
      guardian({ email: null, classIds: ["c1"] }),
      guardian({ email: null, classIds: ["c2"] }),
    ];
    const plan = planAudience({ guardians: unreachable, staff: [] }, "ALL_PARENTS", "EMAIL");
    expect(plan.skipped).toHaveLength(1);
  });
});

describe("audiences", () => {
  it("ALL_STAFF excludes parents entirely", () => {
    const plan = planAudience(input(), "ALL_STAFF", "EMAIL");
    expect(plan.recipients.map((r) => r.kind)).toEqual(["STAFF"]);
  });

  it("ALL_PARENTS excludes staff entirely", () => {
    const plan = planAudience(input(), "ALL_PARENTS", "EMAIL");
    expect(plan.recipients.map((r) => r.kind)).toEqual(["GUARDIAN"]);
  });

  it("WHOLE_SCHOOL takes both", () => {
    const plan = planAudience(input(), "WHOLE_SCHOOL", "EMAIL");
    expect(plan.reach).toBe(2);
  });

  it("CLASS takes only the parents of that class", () => {
    const guardians = [
      guardian({ userId: "g1", email: "in@example.com", classIds: ["c1"] }),
      guardian({ userId: "g2", email: "out@example.com", classIds: ["c2"] }),
    ];
    const plan = planAudience({ guardians, staff: [staff], classId: "c1" }, "CLASS", "EMAIL");
    expect(plan.recipients.map((r) => r.address)).toEqual(["in@example.com"]);
  });

  it("CLASS reaches nobody when no class was chosen, rather than everybody", () => {
    // Failing open here would send a class notice to the whole school.
    const plan = planAudience({ guardians: [guardian()], staff: [] }, "CLASS", "EMAIL");
    expect(plan.reach).toBe(0);
  });
});

describe("opt-outs", () => {
  it("respects an email opt-out even for a whole-school announcement", () => {
    // A system that overrides the opt-out whenever the sender feels strongly
    // has no opt-out at all.
    const plan = planAudience(
      { guardians: [guardian({ notifyByEmail: false })], staff: [] },
      "WHOLE_SCHOOL",
      "EMAIL",
    );
    expect(plan.reach).toBe(0);
    expect(plan.skipped[0]?.reason).toMatch(/opted out of emails/i);
  });

  it("treats the two channels separately", () => {
    const muted = guardian({ notifyBySms: false });
    expect(planAudience({ guardians: [muted], staff: [] }, "ALL_PARENTS", "EMAIL").reach).toBe(1);
    expect(planAudience({ guardians: [muted], staff: [] }, "ALL_PARENTS", "SMS").reach).toBe(0);
  });

  it("does not apply guardian opt-outs to staff", () => {
    // Staff have no per-link preference; the flags belong to a family.
    expect(planAudience({ guardians: [], staff: [staff] }, "ALL_STAFF", "SMS").reach).toBe(1);
  });

  it("says why somebody was skipped, rather than dropping them silently", () => {
    const plan = planAudience(
      { guardians: [guardian({ phone: null }), guardian({ userId: "g2", notifyBySms: false })], staff: [] },
      "ALL_PARENTS",
      "SMS",
    );
    expect(plan.skipped.map((s) => s.reason)).toEqual([
      "No phone number on file",
      "Has opted out of text messages",
    ]);
  });
});

describe("describeReach", () => {
  it("counts people and gets the singular right", () => {
    expect(describeReach(1, 0, "EMAIL")).toBe("1 person would receive this email");
    expect(describeReach(2, 0, "SMS")).toBe("2 people would receive this text message");
  });

  it("mentions the skipped without hiding them", () => {
    expect(describeReach(5, 2, "EMAIL")).toBe("5 people would receive this email, 2 skipped");
  });

  it("says plainly when it would reach nobody", () => {
    expect(describeReach(0, 0, "SMS")).toMatch(/Nobody would receive/);
    expect(describeReach(0, 3, "SMS")).toMatch(/all 3 were skipped/);
  });
});

describe("sendWarning", () => {
  it("always warns about text messages, because they cost money", () => {
    const plan = planAudience(input(), "ALL_STAFF", "SMS");
    expect(sendWarning(plan)).toMatch(/cost money and cannot be recalled/i);
  });

  it("warns about a large email send", () => {
    const many = Array.from({ length: 120 }, (_, i) =>
      guardian({ userId: `g${i}`, email: `p${i}@example.com` }),
    );
    const plan = planAudience({ guardians: many, staff: [] }, "ALL_PARENTS", "EMAIL");
    expect(sendWarning(plan)).toMatch(/120 people/);
  });

  it("does not nag about a small email send", () => {
    expect(sendWarning(planAudience(input(), "ALL_STAFF", "EMAIL"))).toBeNull();
  });

  it("says nothing when it would reach nobody", () => {
    const plan = planAudience({ guardians: [], staff: [] }, "ALL_PARENTS", "SMS");
    expect(sendWarning(plan)).toBeNull();
  });
});

describe("announcementProblem", () => {
  const valid = { title: "School closed Friday", body: "The school will be closed.", audience: "WHOLE_SCHOOL", channels: ["EMAIL"] };

  it("accepts a complete announcement", () => {
    expect(announcementProblem(valid)).toBeNull();
  });

  it("insists on a title and a body", () => {
    expect(announcementProblem({ ...valid, title: "  " })).toMatch(/title/i);
    expect(announcementProblem({ ...valid, body: "" })).toMatch(/Write the announcement/i);
  });

  it("insists on a class when the audience is one class", () => {
    expect(announcementProblem({ ...valid, audience: "CLASS" })).toMatch(/which class/i);
    expect(announcementProblem({ ...valid, audience: "CLASS", classId: "c1" })).toBeNull();
  });

  it("insists on at least one channel", () => {
    expect(announcementProblem({ ...valid, channels: [] })).toMatch(/at least one/i);
  });

  it("refuses a channel it cannot send on", () => {
    expect(announcementProblem({ ...valid, channels: ["CARRIER_PIGEON"] })).toMatch(/email or text/i);
  });
});

describe("announcementDedupeKey", () => {
  it("is one key per announcement, so the database prevents a double send", () => {
    expect(announcementDedupeKey("abc")).toBe("announcement:abc");
    expect(announcementDedupeKey("abc")).toBe(announcementDedupeKey("abc"));
    expect(announcementDedupeKey("abc")).not.toBe(announcementDedupeKey("def"));
  });
});

describe("audienceLabel", () => {
  it("reads as words an administrator chooses between", () => {
    expect(audienceLabel("WHOLE_SCHOOL")).toMatch(/all parents and all staff/i);
    expect(audienceLabel("CLASS")).toMatch(/one class/i);
  });
});
