import { NAV_GROUPS, findActiveLeaf, hasModule, visibleGroups } from "./navigation";

/** Every leaf key in a set of groups, for asserting on what survived a filter. */
function keys(groups: ReturnType<typeof visibleGroups>): string[] {
  return groups.flatMap((group) => group.items.map((item) => item.key));
}

describe("hasModule", () => {
  it("lets through anything not tied to a module", () => {
    expect(hasModule(undefined, ["ATTENDANCE"])).toBe(true);
  });

  it("shows everything while entitlements are still loading", () => {
    // A menu that flickers empty on every page load would be worse than
    // briefly offering a link the API refuses. This is a courtesy, not a
    // control — ModuleGuard on the server is the control.
    expect(hasModule("PAYROLL", undefined)).toBe(true);
  });

  it("hides an item whose module the school does not have", () => {
    expect(hasModule("PAYROLL", ["ATTENDANCE"])).toBe(false);
    expect(hasModule("PAYROLL", ["PAYROLL"])).toBe(true);
  });

  it("treats an empty entitlement list as 'nothing gated is allowed'", () => {
    // Distinct from undefined. An empty array is an answer; undefined is the
    // absence of one.
    expect(hasModule("PAYROLL", [])).toBe(false);
    expect(hasModule(undefined, [])).toBe(true);
  });
});

describe("visibleGroups with modules", () => {
  const admin = ["SCHOOL_ADMIN"];

  it("drops payroll from the staff section when the school has no payroll", () => {
    const withPayroll = keys(visibleGroups(admin, ["PAYROLL", "STAFF"]));
    const without = keys(visibleGroups(admin, ["STAFF"]));

    expect(withPayroll).toContain("nav.staff.payroll");
    expect(without).not.toContain("nav.staff.payroll");
    // The rest of the section survives — this removes one item, not a menu.
    expect(without).toContain("nav.staff.directory");
  });

  it("drops a whole section when the section itself is a module", () => {
    const groups = visibleGroups(admin, ["STUDENTS"]);
    expect(groups.map((group) => group.key)).not.toContain("nav.finance");
    expect(groups.map((group) => group.key)).not.toContain("nav.messaging");
  });

  it("keeps core sections whatever the school bought", () => {
    // A school with an empty entitlement list still has students, staff and
    // classes — those are core and cannot be sold separately.
    const groups = visibleGroups(admin, []).map((group) => group.key);
    expect(groups).toContain("nav.students");
    expect(groups).toContain("nav.staff");
    expect(groups).toContain("nav.academics");
  });

  it("still hides items the role may not see, module or no module", () => {
    // Entitlement and permission are separate checks and neither substitutes
    // for the other.
    const teacher = keys(visibleGroups(["TEACHER"], ["PAYROLL", "STAFF"]));
    expect(teacher).not.toContain("nav.staff.payroll");
  });

  it("behaves exactly as before when no modules are passed", () => {
    expect(keys(visibleGroups(admin))).toEqual(keys(visibleGroups(admin, undefined)));
  });

  it("never leaves an empty group in the menu", () => {
    for (const group of visibleGroups(admin, [])) {
      expect(group.items.length).toBeGreaterThan(0);
    }
  });
});

describe("the module tags themselves", () => {
  it("only uses keys the API actually knows about", () => {
    // A typo here silently hides a menu item for every school, forever, and
    // no test that renders the sidebar would notice.
    const known = new Set([
      "STUDENTS",
      "STAFF",
      "ACADEMICS",
      "ACCESSIBILITY",
      "ATTENDANCE",
      "GRADING",
      "TIMETABLE",
      "HOMEWORK",
      "EXAMS",
      "FEES",
      "PAYROLL",
      "MESSAGING",
      "CLASS_CHAT",
      "PORTAL",
      "AI_CURRICULUM",
      "AI_TEACHER",
      "DATA_EXCHANGE",
      "DOCUMENTS",
    ]);

    for (const group of NAV_GROUPS) {
      if (group.module) expect(known.has(group.module)).toBe(true);
      for (const item of group.items) {
        if (item.module) expect(known.has(item.module)).toBe(true);
      }
    }
  });

  it("never gates an item that has no route yet", () => {
    // A disabled placeholder that is also module-gated is two reasons for the
    // same nothing, and the second one hides the first.
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        if (item.module) expect(item.href).toBeDefined();
      }
    }
  });
});

describe("findActiveLeaf still works on a filtered menu", () => {
  it("finds the deepest match", () => {
    const groups = visibleGroups(["SCHOOL_ADMIN"], ["PAYROLL", "STAFF"]);
    expect(findActiveLeaf(groups, "/staff/access-log")?.leaf.key).toBe("nav.staff.hr");
  });

  it("returns nothing for a route the school cannot see", () => {
    const groups = visibleGroups(["SCHOOL_ADMIN"], ["STAFF"]);
    expect(findActiveLeaf(groups, "/payroll")).toBeUndefined();
  });
});
