import {
  CORE_MODULES,
  MODULE_CATALOG,
  MODULE_KEYS,
  isModuleEnabled,
  isModuleKey,
  moduleLabel,
  parseModuleOverrides,
  resolveModules,
} from "./school-modules";

describe("the catalog", () => {
  it("describes every key exactly once", () => {
    // The console renders from the catalog and the guard checks against the
    // keys. A key with no entry is a module nobody can switch on.
    expect(MODULE_CATALOG.map((m) => m.key).sort()).toEqual([...MODULE_KEYS].sort());
  });

  it("marks exactly the core modules as core", () => {
    const flagged = MODULE_CATALOG.filter((m) => m.core).map((m) => m.key).sort();
    expect(flagged).toEqual([...CORE_MODULES].sort());
  });

  it("gives every module something an operator can read", () => {
    for (const module of MODULE_CATALOG) {
      expect(module.label.length).toBeGreaterThan(0);
      expect(module.description.length).toBeGreaterThan(20);
    }
  });
});

describe("resolveModules", () => {
  it("takes the plan's list when there is one, plus the core it cannot refuse", () => {
    // Written out rather than derived from the implementation's own ordering,
    // which would pass whatever that ordering happened to be.
    expect(resolveModules({ planModules: ["ATTENDANCE", "FEES"] })).toEqual([
      "STUDENTS",
      "STAFF",
      "ACADEMICS",
      "ACCESSIBILITY",
      "ATTENDANCE",
      "FEES",
    ]);
  });

  it("falls back to the default set when a school has no subscription", () => {
    expect(resolveModules({ planModules: null })).toEqual([
      "STUDENTS",
      "STAFF",
      "ACADEMICS",
      "ACCESSIBILITY",
      "ATTENDANCE",
      "GRADING",
      "TIMETABLE",
      "HOMEWORK",
      "PORTAL",
      "DOCUMENTS",
    ]);
  });

  it("treats an empty plan list as 'no opinion', not 'nothing'", () => {
    // Plans saved before modules existed have an empty array. Reading that as
    // a total switch-off would take every existing school down on deploy.
    expect(resolveModules({ planModules: [] })).toEqual(resolveModules({ planModules: null }));
  });

  it("adds what an override switches on", () => {
    const modules = resolveModules({ planModules: ["ATTENDANCE"], overrides: { PAYROLL: true } });
    expect(isModuleEnabled(modules, "PAYROLL")).toBe(true);
  });

  it("removes what an override switches off", () => {
    const modules = resolveModules({ planModules: ["ATTENDANCE", "FEES"], overrides: { FEES: false } });
    expect(isModuleEnabled(modules, "FEES")).toBe(false);
    expect(isModuleEnabled(modules, "ATTENDANCE")).toBe(true);
  });

  it("NEVER lets a core module be switched off", () => {
    // Not tidiness. Switching off students leaves a school paying for an
    // empty shell, and switching off accessibility leaves a blind child
    // unable to use a system their school has already bought.
    const modules = resolveModules({
      planModules: ["ATTENDANCE"],
      overrides: { STUDENTS: false, STAFF: false, ACADEMICS: false, ACCESSIBILITY: false },
    });
    for (const key of CORE_MODULES) expect(isModuleEnabled(modules, key)).toBe(true);
  });

  it("includes core modules a plan forgot to list", () => {
    expect(resolveModules({ planModules: ["FEES"] })).toEqual(
      expect.arrayContaining([...CORE_MODULES]),
    );
  });

  it("ignores keys it does not recognise, in the plan and in the overrides", () => {
    // A renamed or deleted module must not silently become an entitlement,
    // and must not throw either — this data outlives the code that wrote it.
    const modules = resolveModules({
      planModules: ["ATTENDANCE", "TELEPORTATION"],
      overrides: { WARP_DRIVE: true },
    });
    expect(modules).not.toContain("TELEPORTATION");
    expect(modules).not.toContain("WARP_DRIVE");
    expect(isModuleEnabled(modules, "ATTENDANCE")).toBe(true);
  });

  it("returns catalog order regardless of how the input was written", () => {
    // Two schools with the same entitlements must produce identical arrays,
    // or every comparison has to sort first and one of them will forget.
    const a = resolveModules({ planModules: ["FEES", "ATTENDANCE", "PAYROLL"] });
    const b = resolveModules({ planModules: ["PAYROLL", "FEES", "ATTENDANCE"] });
    expect(a).toEqual(b);
  });

  it("never returns the same module twice", () => {
    const modules = resolveModules({
      planModules: ["ATTENDANCE", "ATTENDANCE", "STUDENTS"],
      overrides: { ATTENDANCE: true },
    });
    expect(new Set(modules).size).toBe(modules.length);
  });
});

describe("parseModuleOverrides", () => {
  it("keeps recognised keys with boolean values", () => {
    expect(parseModuleOverrides({ PAYROLL: true, FEES: false })).toEqual({ PAYROLL: true, FEES: false });
  });

  it("drops anything that is not a known key mapped to a boolean", () => {
    expect(
      parseModuleOverrides({ PAYROLL: "yes", NONSENSE: true, FEES: null, EXAMS: 1 }),
    ).toEqual({});
  });

  it("survives whatever is actually in a JSON column", () => {
    // Null, an array, a string, a number — all real things that end up in a
    // nullable JSON field over a few years.
    expect(parseModuleOverrides(null)).toEqual({});
    expect(parseModuleOverrides(undefined)).toEqual({});
    expect(parseModuleOverrides([])).toEqual({});
    expect(parseModuleOverrides("PAYROLL")).toEqual({});
    expect(parseModuleOverrides(42)).toEqual({});
  });
});

describe("isModuleKey", () => {
  it("accepts real keys and refuses everything else", () => {
    expect(isModuleKey("PAYROLL")).toBe(true);
    expect(isModuleKey("payroll")).toBe(false);
    expect(isModuleKey("")).toBe(false);
    expect(isModuleKey(null)).toBe(false);
    expect(isModuleKey(["PAYROLL"])).toBe(false);
  });
});

describe("moduleLabel", () => {
  it("gives the operator-facing name", () => {
    expect(moduleLabel("PAYROLL")).toBe("Payroll");
  });
});
