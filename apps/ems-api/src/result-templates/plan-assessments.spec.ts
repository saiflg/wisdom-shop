import { planAssessments, validateTemplate, type TemplateComponent } from "./plan-assessments";

const CA_AND_EXAM: TemplateComponent[] = [
  { name: "CA1", maxScoreHundredths: 1000, weightPercent: 10 },
  { name: "CA2", maxScoreHundredths: 1000, weightPercent: 10 },
  { name: "CA3", maxScoreHundredths: 1000, weightPercent: 10 },
  { name: "Exam", maxScoreHundredths: 7000, weightPercent: 70 },
];

describe("validateTemplate", () => {
  it("accepts the shape most schools actually use", () => {
    expect(validateTemplate(CA_AND_EXAM)).toBeNull();
  });

  it("refuses weights that do not add up to 100", () => {
    // The failure this feature exists to prevent: 90% deflates every child in
    // the class and is invisible on any individual report card.
    const deflated = CA_AND_EXAM.map((c) => (c.name === "Exam" ? { ...c, weightPercent: 60 } : c));
    expect(validateTemplate(deflated)).toBe("The assessment weights add up to 90%, not 100%");
  });

  it("uses the same weight rule as real assessments", () => {
    // Not a restatement of the rule — the message comes from grading-math,
    // which is what decides whether results can be published. If a template
    // passed a laxer check, it would create assessments that could never be
    // published and nobody would find out until the end of term.
    expect(validateTemplate([{ name: "Only", maxScoreHundredths: 10000, weightPercent: 99 }])).toBe(
      "The assessment weights add up to 99%, not 100%",
    );
  });

  it("refuses two components with the same name", () => {
    // Assessments are unique by name within a subject/class/term, so the
    // second one would not be created and nothing would say so.
    const clashing = [
      { name: "CA1", maxScoreHundredths: 1000, weightPercent: 50 },
      { name: "ca1", maxScoreHundredths: 1000, weightPercent: 50 },
    ];
    expect(validateTemplate(clashing)).toBe('Two components are both called "ca1"');
  });

  it("refuses a component with no name or no maximum", () => {
    expect(validateTemplate([{ name: "  ", maxScoreHundredths: 100, weightPercent: 100 }])).toBe(
      "Every component needs a name",
    );
    expect(validateTemplate([{ name: "Exam", maxScoreHundredths: 0, weightPercent: 100 }])).toBe(
      '"Exam" needs a maximum score above zero',
    );
  });

  it("refuses an empty template", () => {
    expect(validateTemplate([])).toBe("A template needs at least one component");
  });
});

describe("planAssessments", () => {
  it("writes one assessment per component per subject", () => {
    const planned = planAssessments({
      components: CA_AND_EXAM,
      subjectIds: ["maths", "english", "basic-science"],
      classId: "grade-5a",
      academicYear: "2026-2027",
      term: "First",
    });

    expect(planned).toHaveLength(12);
    expect(planned.filter((row) => row.subjectId === "maths")).toHaveLength(4);
  });

  it("carries the class, year and term onto every row", () => {
    const planned = planAssessments({
      components: CA_AND_EXAM,
      subjectIds: ["maths"],
      classId: "grade-5a",
      academicYear: "2026-2027",
      term: "First",
    });

    for (const row of planned) {
      expect(row).toMatchObject({ classId: "grade-5a", academicYear: "2026-2027", term: "First" });
    }
  });

  it("keeps a stable order: subject by subject, components as listed", () => {
    // The screen shows this list back before anything is written, so the
    // order has to be the school's own, not whatever a Set iterated in.
    const planned = planAssessments({
      components: CA_AND_EXAM,
      subjectIds: ["maths", "english"],
      classId: "grade-5a",
      academicYear: "2026-2027",
      term: "First",
    });

    expect(planned.map((row) => `${row.subjectId}/${row.name}`)).toEqual([
      "maths/CA1",
      "maths/CA2",
      "maths/CA3",
      "maths/Exam",
      "english/CA1",
      "english/CA2",
      "english/CA3",
      "english/Exam",
    ]);
  });

  it("plans nothing when no subject was chosen", () => {
    expect(
      planAssessments({
        components: CA_AND_EXAM,
        subjectIds: [],
        classId: "grade-5a",
        academicYear: "2026-2027",
        term: "First",
      }),
    ).toEqual([]);
  });

  it("preserves each component's own maximum", () => {
    // A 10-mark CA and a 70-mark exam are not the same row with a different
    // weight; marks are entered against the maximum.
    const planned = planAssessments({
      components: CA_AND_EXAM,
      subjectIds: ["maths"],
      classId: "grade-5a",
      academicYear: "2026-2027",
      term: "First",
    });

    expect(planned.find((row) => row.name === "Exam")?.maxScoreHundredths).toBe(7000);
    expect(planned.find((row) => row.name === "CA1")?.maxScoreHundredths).toBe(1000);
  });
});
