import { filterGuardians, householdSummary, matchesGuardianQuery, withoutEmail } from "./guardian-directory";
import type { GuardianEntry } from "./use-guardians";

function entry(overrides: Partial<GuardianEntry> = {}): GuardianEntry {
  return {
    guardianUserId: "g1",
    firstName: "Amina",
    lastName: "Bello",
    email: "amina@example.com",
    hasPassword: true,
    children: [
      {
        linkId: "l1",
        studentProfileId: "s1",
        name: "Tunde Bello",
        className: "JSS 2A",
        relationship: "Mother",
      },
    ],
    ...overrides,
  };
}

describe("matchesGuardianQuery", () => {
  it("matches on the parent's name", () => {
    expect(matchesGuardianQuery(entry(), "amina")).toBe(true);
  });

  it("matches on a CHILD's name", () => {
    // The point of the whole search. Somebody rings about Tunde; the person
    // answering types "Tunde" and needs his mother.
    expect(matchesGuardianQuery(entry(), "tunde")).toBe(true);
  });

  it("matches on a child's class", () => {
    expect(matchesGuardianQuery(entry(), "jss 2a")).toBe(true);
  });

  it("ignores case and surrounding spaces", () => {
    expect(matchesGuardianQuery(entry(), "  BELLO  ")).toBe(true);
  });

  it("returns everything for an empty query", () => {
    expect(matchesGuardianQuery(entry(), "")).toBe(true);
  });

  it("does not match an unrelated name", () => {
    expect(matchesGuardianQuery(entry(), "okonkwo")).toBe(false);
  });

  it("survives a guardian with no email", () => {
    expect(matchesGuardianQuery(entry({ email: null }), "amina")).toBe(true);
  });

  it("survives a child with no class", () => {
    const noClass = entry({
      children: [
        { linkId: "l1", studentProfileId: "s1", name: "New Pupil", className: null, relationship: "Mother" },
      ],
    });
    expect(matchesGuardianQuery(noClass, "new")).toBe(true);
  });
});

describe("filterGuardians", () => {
  it("keeps only the matching families", () => {
    const families = [
      entry(),
      entry({
        guardianUserId: "g2",
        firstName: "Chidi",
        lastName: "Okonkwo",
        children: [
          { linkId: "l2", studentProfileId: "s2", name: "Ada Okonkwo", className: "JSS 1B", relationship: "Father" },
        ],
      }),
    ];

    expect(filterGuardians(families, "ada").map((f) => f.lastName)).toEqual(["Okonkwo"]);
  });
});

describe("householdSummary", () => {
  it("names the relationship and class for one child", () => {
    expect(householdSummary(entry())).toBe("Mother of Tunde Bello · JSS 2A");
  });

  it("omits the class when there is none", () => {
    const noClass = entry({
      children: [
        { linkId: "l1", studentProfileId: "s1", name: "New Pupil", className: null, relationship: "Mother" },
      ],
    });
    expect(householdSummary(noClass)).toBe("Mother of New Pupil");
  });

  it("lists the children rather than claiming one relationship for several", () => {
    // A man can be father to one pupil and guardian to another.
    const two = entry({
      children: [
        { linkId: "l1", studentProfileId: "s1", name: "Tunde Bello", className: "JSS 2A", relationship: "Father" },
        { linkId: "l2", studentProfileId: "s2", name: "Ada Okoro", className: "JSS 1B", relationship: "Guardian" },
      ],
    });
    expect(householdSummary(two)).toBe("2 children: Tunde Bello, Ada Okoro");
  });

  it("says so when nothing is linked", () => {
    expect(householdSummary(entry({ children: [] }))).toBe("No children linked");
  });
});

describe("withoutEmail", () => {
  it("finds the families an email announcement would miss", () => {
    const families = [entry(), entry({ guardianUserId: "g2", firstName: "Segun", email: null })];
    expect(withoutEmail(families).map((f) => f.firstName)).toEqual(["Segun"]);
  });
});
