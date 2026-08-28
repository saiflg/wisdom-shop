import {
  areaOf,
  audienceOf,
  countsByRole,
  describeAudience,
  groupByArea,
  roleCanReach,
  type RouteCapability,
} from "./capability-rules";

const route = (over: Partial<RouteCapability> = {}): RouteCapability => ({
  method: "GET",
  path: "fees/invoices",
  roles: ["SCHOOL_ADMIN"],
  module: null,
  summary: null,
  ...over,
});

describe("audienceOf", () => {
  // The case the whole module exists for.
  it("treats no @Roles as everybody, not nobody", () => {
    // A route with no @Roles is not one nobody can reach — it is one EVERY
    // signed-in person can reach. Reading it the other way round is how a
    // permissions screen reassures somebody about a route that is open to
    // the whole school.
    expect(audienceOf(null)).toEqual(["SCHOOL_ADMIN", "TEACHER", "STUDENT", "GUARDIAN"]);
  });

  it("passes through an explicit list", () => {
    expect(audienceOf(["TEACHER"])).toEqual(["TEACHER"]);
  });

  it("treats an empty list as nobody, which is different from absent", () => {
    expect(audienceOf([])).toEqual([]);
  });
});

describe("describeAudience", () => {
  it("says everyone for an unguarded route", () => {
    expect(describeAudience(null)).toBe("Everyone signed in");
  });

  it("uses words a school recognises", () => {
    expect(describeAudience(["SCHOOL_ADMIN"])).toBe("Administrators");
    expect(describeAudience(["SCHOOL_ADMIN", "TEACHER"])).toBe("Administrators, Teachers");
    expect(describeAudience(["GUARDIAN"])).toBe("Parents");
  });

  it("collapses a list of every role back to everyone", () => {
    expect(describeAudience(["SCHOOL_ADMIN", "TEACHER", "STUDENT", "GUARDIAN"])).toBe("Everyone signed in");
  });

  it("says nobody for an empty list", () => {
    expect(describeAudience([])).toBe("Nobody");
  });
});

describe("roleCanReach", () => {
  it("lets every role reach an unguarded route", () => {
    expect(roleCanReach(route({ roles: null }), "GUARDIAN")).toBe(true);
    expect(roleCanReach(route({ roles: null }), "SCHOOL_ADMIN")).toBe(true);
  });

  it("keeps a guarded route to its roles", () => {
    expect(roleCanReach(route({ roles: ["SCHOOL_ADMIN"] }), "TEACHER")).toBe(false);
    expect(roleCanReach(route({ roles: ["SCHOOL_ADMIN"] }), "SCHOOL_ADMIN")).toBe(true);
  });
});

describe("areaOf", () => {
  it("takes the first path segment", () => {
    expect(areaOf("fees/invoices")).toBe("fees");
    expect(areaOf("/fees/invoices/:id")).toBe("fees");
  });

  it("copes with a bare path", () => {
    expect(areaOf("health")).toBe("health");
    expect(areaOf("/")).toBe("root");
    expect(areaOf("")).toBe("root");
  });
});

describe("groupByArea", () => {
  const ROUTES = [
    route({ path: "fees/invoices", roles: ["SCHOOL_ADMIN", "GUARDIAN"] }),
    route({ path: "fees/settings", roles: ["SCHOOL_ADMIN"], module: "FEES" }),
    route({ path: "library/books", roles: null }),
    route({ path: "appraisals", roles: ["SCHOOL_ADMIN", "TEACHER"] }),
  ];

  it("groups by the first path segment", () => {
    expect(groupByArea(ROUTES).map((a) => a.area)).toEqual(["appraisals", "fees", "library"]);
  });

  it("sorts alphabetically, not by size", () => {
    // A reference: somebody looking for "fees" should find it in the same
    // place every time, not wherever its route count puts it today.
    const areas = groupByArea(ROUTES).map((a) => a.area);
    expect(areas).toEqual([...areas].sort());
  });

  it("reports who can reach anything at all in an area", () => {
    const fees = groupByArea(ROUTES).find((a) => a.area === "fees");
    expect(fees?.reachedBy).toEqual(["SCHOOL_ADMIN", "GUARDIAN"]);
  });

  // The thing an administrator most needs to notice.
  it("counts the routes in an area that carry no @Roles", () => {
    const library = groupByArea(ROUTES).find((a) => a.area === "library");
    expect(library?.openRoutes).toBe(1);
    expect(library?.reachedBy).toEqual(["SCHOOL_ADMIN", "TEACHER", "STUDENT", "GUARDIAN"]);
  });

  it("lists the modules an area needs", () => {
    expect(groupByArea(ROUTES).find((a) => a.area === "fees")?.modules).toEqual(["FEES"]);
    expect(groupByArea(ROUTES).find((a) => a.area === "library")?.modules).toEqual([]);
  });

  it("groups nothing into nothing", () => {
    expect(groupByArea([])).toEqual([]);
  });
});

describe("countsByRole", () => {
  it("counts what each role can reach", () => {
    const counts = countsByRole([
      route({ roles: ["SCHOOL_ADMIN"] }),
      route({ roles: ["SCHOOL_ADMIN", "TEACHER"] }),
      route({ roles: null }),
    ]);
    expect(counts.SCHOOL_ADMIN).toBe(3);
    expect(counts.TEACHER).toBe(2);
    // The unguarded one, and only that one.
    expect(counts.STUDENT).toBe(1);
    expect(counts.GUARDIAN).toBe(1);
  });

  it("counts nothing as zero for every role", () => {
    expect(countsByRole([])).toEqual({ SCHOOL_ADMIN: 0, TEACHER: 0, STUDENT: 0, GUARDIAN: 0 });
  });
});
