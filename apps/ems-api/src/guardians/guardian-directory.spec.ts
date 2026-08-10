import { groupGuardians, type GuardianLinkRow } from "./guardian-directory";

function link(overrides: Partial<GuardianLinkRow> & { id: string }): GuardianLinkRow {
  return {
    relationship: "Mother",
    guardianUser: { id: "g1", firstName: "Amina", lastName: "Bello", email: "amina@example.com" },
    studentProfile: {
      id: "s1",
      user: { firstName: "Tunde", lastName: "Bello" },
      enrollments: [{ class: { name: "JSS 1A" } }],
    },
    ...overrides,
  };
}

describe("groupGuardians", () => {
  it("collapses a parent of several children into one entry", () => {
    // The whole point of the module. Three rows in, one parent out.
    const result = groupGuardians([
      link({ id: "l1", studentProfile: { id: "s1", user: { firstName: "Tunde", lastName: "Bello" }, enrollments: [] } }),
      link({ id: "l2", studentProfile: { id: "s2", user: { firstName: "Ada", lastName: "Bello" }, enrollments: [] } }),
      link({ id: "l3", studentProfile: { id: "s3", user: { firstName: "Chidi", lastName: "Bello" }, enrollments: [] } }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].children).toHaveLength(3);
  });

  it("keeps separate guardians separate even when they share a child", () => {
    const result = groupGuardians([
      link({ id: "l1" }),
      link({
        id: "l2",
        relationship: "Father",
        guardianUser: { id: "g2", firstName: "Segun", lastName: "Bello", email: "segun@example.com" },
      }),
    ]);

    expect(result).toHaveLength(2);
    expect(result.map((entry) => entry.guardianUserId).sort()).toEqual(["g1", "g2"]);
  });

  it("records the relationship per child, not per guardian", () => {
    // A man can be father to one pupil and guardian to another in the same
    // school; storing one relationship on the parent would have to pick.
    const result = groupGuardians([
      link({ id: "l1", relationship: "Father" }),
      link({
        id: "l2",
        relationship: "Guardian",
        studentProfile: { id: "s2", user: { firstName: "Ada", lastName: "Okoro" }, enrollments: [] },
      }),
    ]);

    expect(result[0].children.map((child) => child.relationship).sort()).toEqual(["Father", "Guardian"]);
  });

  it("uses the most recent enrollment for the class", () => {
    // Enrollments accumulate as a child moves up the school.
    const result = groupGuardians([
      link({
        id: "l1",
        studentProfile: {
          id: "s1",
          user: { firstName: "Tunde", lastName: "Bello" },
          enrollments: [{ class: { name: "JSS 1A" } }, { class: { name: "JSS 2A" } }],
        },
      }),
    ]);

    expect(result[0].children[0].className).toBe("JSS 2A");
  });

  it("keeps a child who has no class yet", () => {
    // A newly admitted pupil still has parents somebody needs to phone.
    const result = groupGuardians([
      link({ id: "l1", studentProfile: { id: "s1", user: { firstName: "New", lastName: "Pupil" }, enrollments: [] } }),
    ]);

    expect(result[0].children[0].className).toBeNull();
  });

  it("survives an enrollment whose class was deleted", () => {
    const result = groupGuardians([
      link({
        id: "l1",
        studentProfile: { id: "s1", user: { firstName: "Tunde", lastName: "Bello" }, enrollments: [{ class: null }] },
      }),
    ]);

    expect(result[0].children[0].className).toBeNull();
  });

  it("sorts by surname then first name", () => {
    const result = groupGuardians([
      link({ id: "l1", guardianUser: { id: "g1", firstName: "Zara", lastName: "Yusuf", email: "z@example.com" } }),
      link({ id: "l2", guardianUser: { id: "g2", firstName: "Ben", lastName: "Adeyemi", email: "b@example.com" } }),
      link({ id: "l3", guardianUser: { id: "g3", firstName: "Ada", lastName: "Adeyemi", email: "a@example.com" } }),
    ]);

    expect(result.map((entry) => `${entry.lastName} ${entry.firstName}`)).toEqual([
      "Adeyemi Ada",
      "Adeyemi Ben",
      "Yusuf Zara",
    ]);
  });

  it("keeps a guardian who has no email address", () => {
    // Recorded from a paper admission form, phone number only. They cannot
    // sign in or be emailed, which is exactly why the office needs to see
    // them in the list.
    const result = groupGuardians([
      link({ id: "l1", guardianUser: { id: "g1", firstName: "Amina", lastName: "Bello", email: null } }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].email).toBeNull();
  });

  it("returns nothing for a school with no guardians", () => {
    expect(groupGuardians([])).toEqual([]);
  });
});
