import {
  actionable,
  blockers,
  planPromotion,
  summarise,
  type ClassMapping,
  type PromotionInput,
} from "./promotion-plan";

function student(id: string, name: string, fromClassId = "jss1", fromClassName = "JSS 1") {
  return { studentProfileId: id, studentName: name, enrollmentId: `e-${id}`, fromClassId, fromClassName };
}

function mapping(overrides: Partial<ClassMapping> = {}): ClassMapping {
  return {
    promoteToClassId: "jss2-next",
    promoteToClassName: "JSS 2",
    repeatClassId: "jss1-next",
    repeatClassName: "JSS 1",
    graduating: false,
    ...overrides,
  };
}

function input(overrides: Partial<PromotionInput> = {}): PromotionInput {
  return {
    students: [student("s1", "Tunde Bello")],
    mappings: { jss1: mapping() },
    overrides: {},
    alreadyEnrolledNextYear: new Set<string>(),
    ...overrides,
  };
}

describe("planPromotion", () => {
  it("moves a child to the class their year was mapped to", () => {
    const [decision] = planPromotion(input());
    expect(decision.outcome).toBe("PROMOTE");
    expect(decision.toClassId).toBe("jss2-next");
    expect(decision.reason).toBe("Moving to JSS 2");
  });

  describe("running it twice", () => {
    it("NEVER promotes a child who already has next year's enrolment", () => {
      // The invariant. Somebody will click this twice — a slow page, a stale
      // tab, two secretaries on the same afternoon. A child in two classes at
      // once corrupts attendance, results and fees together.
      const [decision] = planPromotion(
        input({ alreadyEnrolledNextYear: new Set(["s1"]) }),
      );
      expect(decision.outcome).toBe("ALREADY_DONE");
      expect(decision.toClassId).toBeNull();
    });

    it("leaves a half-finished run resumable", () => {
      // The realistic failure: the first run promoted two of three children
      // before something broke. Re-running must finish the job, not redo it.
      const decisions = planPromotion(
        input({
          students: [student("s1", "Done One"), student("s2", "Done Two"), student("s3", "Not Yet")],
          alreadyEnrolledNextYear: new Set(["s1", "s2"]),
        }),
      );
      expect(decisions.map((d) => d.outcome)).toEqual(["ALREADY_DONE", "ALREADY_DONE", "PROMOTE"]);
      expect(actionable(decisions).map((d) => d.studentName)).toEqual(["Not Yet"]);
    });

    it("ignores an override for a child already promoted", () => {
      // Even an explicit instruction must not move somebody twice.
      const [decision] = planPromotion(
        input({ overrides: { s1: "REPEAT" }, alreadyEnrolledNextYear: new Set(["s1"]) }),
      );
      expect(decision.outcome).toBe("ALREADY_DONE");
    });
  });

  describe("a class with nowhere to go", () => {
    it("reports a child whose class was never mapped", () => {
      // Silently skipping would strand a whole cohort with no enrolment, and
      // nobody would notice until a teacher opened an empty register.
      const [decision] = planPromotion(input({ mappings: {} }));
      expect(decision.outcome).toBe("NO_TARGET_CLASS");
      expect(decision.reason).toBe("No destination chosen for JSS 1");
    });

    it("reports a mapping that exists but names no destination", () => {
      const [decision] = planPromotion(
        input({ mappings: { jss1: mapping({ promoteToClassId: null, promoteToClassName: null }) } }),
      );
      expect(decision.outcome).toBe("NO_TARGET_CLASS");
    });

    it("counts blocked children as blockers, not warnings", () => {
      const decisions = planPromotion(input({ mappings: {} }));
      expect(blockers(decisions)).toHaveLength(1);
    });
  });

  describe("repeating a year", () => {
    it("keeps a child in the same grade in the new year", () => {
      const [decision] = planPromotion(input({ overrides: { s1: "REPEAT" } }));
      expect(decision.outcome).toBe("REPEAT");
      expect(decision.toClassId).toBe("jss1-next");
      expect(decision.reason).toBe("Repeating JSS 1");
    });

    it("refuses when next year has no equivalent class", () => {
      // A school that stopped offering JSS 1 cannot hold anyone back into it.
      const [decision] = planPromotion(
        input({
          overrides: { s1: "REPEAT" },
          mappings: { jss1: mapping({ repeatClassId: null, repeatClassName: null }) },
        }),
      );
      expect(decision.outcome).toBe("CANNOT_REPEAT");
      expect(decision.reason).toBe("No JSS 1 exists next year to repeat in");
    });
  });

  describe("leaving the school", () => {
    it("graduates a whole final-year class by default", () => {
      const [decision] = planPromotion(
        input({ mappings: { jss1: mapping({ graduating: true }) } }),
      );
      expect(decision.outcome).toBe("GRADUATE");
      expect(decision.toClassId).toBeNull();
    });

    it("lets one child leave from a class that is otherwise moving up", () => {
      const decisions = planPromotion(
        input({
          students: [student("s1", "Leaving"), student("s2", "Staying")],
          overrides: { s1: "GRADUATE" },
        }),
      );
      expect(decisions.map((d) => d.outcome)).toEqual(["GRADUATE", "PROMOTE"]);
    });

    it("lets one child be promoted out of a graduating class", () => {
      // The override wins over the class default, both ways round.
      const [decision] = planPromotion(
        input({ overrides: { s1: "PROMOTE" }, mappings: { jss1: mapping({ graduating: true }) } }),
      );
      expect(decision.outcome).toBe("PROMOTE");
      expect(decision.toClassId).toBe("jss2-next");
    });
  });

  it("handles a school with several classes at once", () => {
    const decisions = planPromotion({
      students: [
        student("s1", "In One", "jss1", "JSS 1"),
        student("s2", "In Two", "jss2", "JSS 2"),
        student("s3", "In Three", "jss3", "JSS 3"),
      ],
      mappings: {
        jss1: mapping(),
        jss2: mapping({ promoteToClassId: "jss3-next", promoteToClassName: "JSS 3" }),
        jss3: mapping({ graduating: true }),
      },
      overrides: {},
      alreadyEnrolledNextYear: new Set<string>(),
    });

    expect(decisions.map((d) => d.outcome)).toEqual(["PROMOTE", "PROMOTE", "GRADUATE"]);
  });

  it("returns nothing for a school with no students", () => {
    expect(planPromotion(input({ students: [] }))).toEqual([]);
  });
});

describe("summarise", () => {
  it("counts every outcome and totals them", () => {
    const decisions = planPromotion({
      students: [
        student("s1", "Up"),
        student("s2", "Again"),
        student("s3", "Out"),
        student("s4", "Done"),
        student("s5", "Stuck", "unmapped", "Unmapped Class"),
      ],
      mappings: { jss1: mapping() },
      overrides: { s2: "REPEAT", s3: "GRADUATE" },
      alreadyEnrolledNextYear: new Set(["s4"]),
    });

    expect(summarise(decisions)).toEqual({
      promote: 1,
      repeat: 1,
      graduate: 1,
      alreadyDone: 1,
      problems: 1,
      total: 5,
    });
  });
});

describe("actionable", () => {
  it("excludes reports and keeps only the changes", () => {
    const decisions = planPromotion({
      students: [student("s1", "Moving"), student("s2", "Done"), student("s3", "Stuck", "x", "X")],
      mappings: { jss1: mapping() },
      overrides: {},
      alreadyEnrolledNextYear: new Set(["s2"]),
    });
    expect(actionable(decisions).map((d) => d.studentName)).toEqual(["Moving"]);
  });
});
