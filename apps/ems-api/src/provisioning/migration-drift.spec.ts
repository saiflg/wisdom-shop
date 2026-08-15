import {
  driftFor,
  pendingFor,
  shouldApply,
  sortMigrations,
  summarise,
  unknownIn,
  type SchoolMigrationState,
} from "./migration-drift";

const ON_DISK = [
  "20260801145822_init",
  "20260803181240_add_attendance",
  "20260814220000_add_payroll_checklist",
  "20260815020000_add_class_message_attachments",
];

function school(overrides: Partial<SchoolMigrationState> = {}): SchoolMigrationState {
  return {
    schoolId: "s1",
    name: "Demo Academy",
    slug: "demo-academy",
    status: "ACTIVE",
    applied: [...ON_DISK],
    ...overrides,
  };
}

describe("sortMigrations", () => {
  it("orders by name, which is chronological because names are timestamped", () => {
    expect(sortMigrations(["20260815020000_b", "20260801145822_a"])).toEqual([
      "20260801145822_a",
      "20260815020000_b",
    ]);
  });

  it("does not trust the order it was given", () => {
    // A directory listing's order is the filesystem's business, and applying
    // migrations out of order lands a foreign key before its table.
    const shuffled = [...ON_DISK].reverse();
    expect(sortMigrations(shuffled)).toEqual(ON_DISK);
  });
});

describe("pendingFor", () => {
  it("is empty when a school has everything", () => {
    expect(pendingFor(ON_DISK, ON_DISK)).toEqual([]);
  });

  it("lists what is missing, in the order it must be applied", () => {
    const applied = ["20260801145822_init", "20260803181240_add_attendance"];
    expect(pendingFor(applied, ON_DISK)).toEqual([
      "20260814220000_add_payroll_checklist",
      "20260815020000_add_class_message_attachments",
    ]);
  });

  it("catches a gap in the MIDDLE, not just the tail", () => {
    // A database that skipped one migration — which happens when somebody
    // applies a fix by hand — must be told about that one specifically.
    const applied = [
      "20260801145822_init",
      "20260814220000_add_payroll_checklist",
      "20260815020000_add_class_message_attachments",
    ];
    expect(pendingFor(applied, ON_DISK)).toEqual(["20260803181240_add_attendance"]);
  });

  it("treats a brand-new database as needing everything", () => {
    expect(pendingFor([], ON_DISK)).toEqual(ON_DISK);
  });
});

describe("unknownIn", () => {
  it("finds migrations the database has and this build does not", () => {
    const applied = [...ON_DISK, "20260901000000_from_a_newer_branch"];
    expect(unknownIn(applied, ON_DISK)).toEqual(["20260901000000_from_a_newer_branch"]);
  });

  it("is empty in the ordinary case", () => {
    expect(unknownIn(ON_DISK, ON_DISK)).toEqual([]);
  });
});

describe("driftFor", () => {
  it("reports a current school as up to date", () => {
    const drift = driftFor(school(), ON_DISK);
    expect(drift.level).toBe("UP_TO_DATE");
    expect(drift.summary).toBe("Up to date");
  });

  it("counts how far behind, and gets the singular right", () => {
    const one = driftFor(school({ applied: ON_DISK.slice(0, 3) }), ON_DISK);
    expect(one.level).toBe("BEHIND");
    expect(one.summary).toBe("Behind by 1 migration");

    const two = driftFor(school({ applied: ON_DISK.slice(0, 2) }), ON_DISK);
    expect(two.summary).toBe("Behind by 2 migrations");
  });

  it("reports an unreadable database as UNREACHABLE, never as up to date", () => {
    // Returning no rows because the connection failed must not read as
    // "nothing pending".
    const drift = driftFor(school({ applied: [], unreachable: "password authentication failed" }), ON_DISK);
    expect(drift.level).toBe("UNREACHABLE");
    expect(drift.summary).toMatch(/password authentication failed/);
    expect(drift.pending).toEqual([]);
  });

  it("reports a database ahead of the code, and says deploying will not help", () => {
    const drift = driftFor(school({ applied: [...ON_DISK, "20260901000000_newer"] }), ON_DISK);
    expect(drift.level).toBe("AHEAD");
    expect(drift.summary).toMatch(/will not fix/i);
  });

  it("prefers AHEAD over BEHIND when a database is somehow both", () => {
    // A deploy from the wrong branch. Running migrate deploy would apply the
    // missing ones and still leave the mismatch, so the mismatch is the
    // headline.
    const drift = driftFor(
      school({ applied: ["20260801145822_init", "20260901000000_newer"] }),
      ON_DISK,
    );
    expect(drift.level).toBe("AHEAD");
    expect(drift.pending.length).toBeGreaterThan(0);
  });
});

describe("shouldApply", () => {
  it("runs for a school that is merely behind", () => {
    expect(shouldApply(driftFor(school({ applied: [] }), ON_DISK))).toBe(true);
  });

  it("migrates a SUSPENDED school too", () => {
    // Suspension is a billing state. A school coming back to a database three
    // releases old is worse than one quietly kept current.
    const suspended = driftFor(school({ applied: [], status: "SUSPENDED" }), ON_DISK);
    expect(shouldApply(suspended)).toBe(true);
  });

  it("skips what migrate deploy cannot fix", () => {
    expect(shouldApply(driftFor(school(), ON_DISK))).toBe(false);
    expect(shouldApply(driftFor(school({ unreachable: "down" }), ON_DISK))).toBe(false);
    expect(shouldApply(driftFor(school({ applied: [...ON_DISK, "20260901_x"] }), ON_DISK))).toBe(false);
  });
});

describe("summarise", () => {
  const drift = (state: Partial<SchoolMigrationState>) => driftFor(school(state), ON_DISK);

  it("says so plainly when everything is current", () => {
    expect(summarise([drift({}), drift({})]).headline).toBe("Every school is up to date");
  });

  it("counts each state", () => {
    const result = summarise([drift({}), drift({ applied: [] }), drift({ unreachable: "down" })]);
    expect(result).toMatchObject({ total: 3, upToDate: 1, behind: 1, unreachable: 1, ahead: 0 });
  });

  it("leads with the problem that needs a person, not the commonest one", () => {
    // Unreachable outranks behind: one needs somebody to look, the other is
    // a button press.
    const result = summarise([drift({ applied: [] }), drift({ unreachable: "down" })]);
    expect(result.headline).toMatch(/could not be read/);
  });

  it("gets the grammar right for one school needing work", () => {
    expect(summarise([drift({ applied: [] })]).headline).toBe("1 school needs migrating");
    expect(summarise([drift({ applied: [] }), drift({ applied: [] })]).headline).toBe("2 schools need migrating");
  });

  it("handles a platform with no schools yet", () => {
    expect(summarise([]).headline).toBe("No schools yet");
  });
});
