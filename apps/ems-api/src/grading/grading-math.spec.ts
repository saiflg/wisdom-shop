import {
  computeOverallPercent,
  computeSubjectScore,
  findBand,
  formatPercent,
  formatScore,
  validateBands,
  validateWeights,
  type BandInput,
  type MarkInput,
} from "./grading-math";

const SCALE: BandInput[] = [
  { label: "A", minPercent: 70, maxPercent: 100, remark: "Excellent", gradePoint: 5 },
  { label: "B", minPercent: 60, maxPercent: 69, remark: "Very good", gradePoint: 4 },
  { label: "C", minPercent: 50, maxPercent: 59, remark: "Good", gradePoint: 3 },
  { label: "F", minPercent: 0, maxPercent: 49, remark: "Fail", gradePoint: 0 },
];

const recorded = (weight: number, score: number, max = 10000): MarkInput => ({
  weightPercent: weight,
  maxScoreHundredths: max,
  scoreHundredths: score,
  status: "RECORDED",
});

describe("validateBands", () => {
  it("accepts a scale that tiles 0-100 exactly", () => {
    expect(validateBands(SCALE)).toBeNull();
  });

  it("catches a gap that would leave a mark with no grade", () => {
    // 50-59 removed: a student on 55% would get a blank grade, and a parent
    // would find it before we did.
    const gapped = SCALE.filter((band) => band.label !== "C");
    expect(validateBands(gapped)).toMatch(/nothing covers 50–59/i);
  });

  it("catches overlapping bands", () => {
    const overlapping: BandInput[] = [
      { label: "A", minPercent: 60, maxPercent: 100 },
      { label: "B", minPercent: 0, maxPercent: 65 },
    ];
    expect(validateBands(overlapping)).toMatch(/overlap/i);
  });

  it("requires the scale to start at 0 and reach 100", () => {
    expect(validateBands([{ label: "A", minPercent: 10, maxPercent: 100 }])).toMatch(/start at 0/i);
    expect(validateBands([{ label: "A", minPercent: 0, maxPercent: 90 }])).toMatch(/reach 100/i);
  });

  it("rejects a band that starts above where it ends", () => {
    expect(validateBands([{ label: "A", minPercent: 80, maxPercent: 20 }])).toMatch(/starts above/i);
  });

  it("rejects an empty scale", () => {
    expect(validateBands([])).toMatch(/at least one band/i);
  });
});

describe("findBand", () => {
  it("finds the band for a plain percentage", () => {
    expect(findBand(8500, SCALE)?.label).toBe("A");
    expect(findBand(6500, SCALE)?.label).toBe("B");
    expect(findBand(1200, SCALE)?.label).toBe("F");
  });

  it("is inclusive at both boundaries", () => {
    expect(findBand(7000, SCALE)?.label).toBe("A");
    expect(findBand(6900, SCALE)?.label).toBe("B");
    expect(findBand(10000, SCALE)?.label).toBe("A");
    expect(findBand(0, SCALE)?.label).toBe("F");
  });

  it("rounds half up, so 69.5% earns the higher grade", () => {
    // Stated explicitly because rounding down at a boundary silently costs a
    // student a grade.
    expect(findBand(6950, SCALE)?.label).toBe("A");
    expect(findBand(6949, SCALE)?.label).toBe("B");
  });
});

describe("validateWeights", () => {
  it("accepts weights summing to 100", () => {
    expect(validateWeights([40, 60])).toBeNull();
    expect(validateWeights([20, 20, 60])).toBeNull();
  });

  it("refuses weights that would deflate or inflate the whole class", () => {
    expect(validateWeights([40, 50])).toMatch(/add up to 90%/i);
    expect(validateWeights([60, 60])).toMatch(/add up to 120%/i);
  });

  it("refuses a subject with no assessments", () => {
    expect(validateWeights([])).toMatch(/no assessments/i);
  });

  it("refuses a zero or fractional weight", () => {
    expect(validateWeights([0, 100])).toMatch(/above zero/i);
    expect(validateWeights([33.3, 66.7])).toMatch(/whole weight/i);
  });
});

describe("computeSubjectScore", () => {
  it("weights a CA and an exam correctly", () => {
    // 16/20 on the CA (weight 40) and 60/80 on the exam (weight 60).
    const score = computeSubjectScore([
      { weightPercent: 40, maxScoreHundredths: 2000, scoreHundredths: 1600, status: "RECORDED" },
      { weightPercent: 60, maxScoreHundredths: 8000, scoreHundredths: 6000, status: "RECORDED" },
    ]);
    // 80% * 0.4 + 75% * 0.6 = 32 + 45 = 77
    expect(score.percentHundredths).toBe(7700);
    expect(score.countedWeight).toBe(100);
  });

  it("counts ABSENT as zero", () => {
    const score = computeSubjectScore([
      recorded(50, 10000),
      { weightPercent: 50, maxScoreHundredths: 10000, scoreHundredths: null, status: "ABSENT" },
    ]);
    // Full marks on half the weight, nothing on the other half.
    expect(score.percentHundredths).toBe(5000);
    expect(score.countedWeight).toBe(100);
  });

  it("excludes EXCUSED and renormalises the rest", () => {
    // The same student, but the missed assessment was excused: they are
    // judged only on what they sat, so full marks stays 100%.
    const score = computeSubjectScore([
      recorded(50, 10000),
      { weightPercent: 50, maxScoreHundredths: 10000, scoreHundredths: null, status: "EXCUSED" },
    ]);
    expect(score.percentHundredths).toBe(10000);
    expect(score.countedWeight).toBe(50);
  });

  it("treats ABSENT and EXCUSED differently — the whole point", () => {
    const absent = computeSubjectScore([
      recorded(60, 6000),
      { weightPercent: 40, maxScoreHundredths: 10000, scoreHundredths: null, status: "ABSENT" },
    ]);
    const excused = computeSubjectScore([
      recorded(60, 6000),
      { weightPercent: 40, maxScoreHundredths: 10000, scoreHundredths: null, status: "EXCUSED" },
    ]);
    expect(absent.percentHundredths).toBe(3600);
    expect(excused.percentHundredths).toBe(6000);
    expect(absent.percentHundredths).not.toBe(excused.percentHundredths);
  });

  it("returns null, not zero, when everything was excused", () => {
    // "No basis to judge" is not "scored nothing" — same distinction
    // attendance draws between a 0% rate and no data.
    const score = computeSubjectScore([
      { weightPercent: 50, maxScoreHundredths: 10000, scoreHundredths: null, status: "EXCUSED" },
      { weightPercent: 50, maxScoreHundredths: 10000, scoreHundredths: null, status: "EXCUSED" },
    ]);
    expect(score.percentHundredths).toBeNull();
    expect(score.countedWeight).toBe(0);
  });

  it("handles half marks without drift", () => {
    // 17.5 out of 20 is 87.5%.
    const score = computeSubjectScore([
      { weightPercent: 100, maxScoreHundredths: 2000, scoreHundredths: 1750, status: "RECORDED" },
    ]);
    expect(score.percentHundredths).toBe(8750);
  });

  it("survives thirds without the total drifting off 100", () => {
    // Three equal assessments, full marks on each, must be exactly 100% —
    // the case where float arithmetic leaves 99.99999.
    const score = computeSubjectScore([recorded(34, 10000), recorded(33, 10000), recorded(33, 10000)]);
    expect(score.percentHundredths).toBe(10000);
  });

  it("ignores an assessment with a zero maximum instead of dividing by it", () => {
    const score = computeSubjectScore([
      recorded(50, 10000),
      { weightPercent: 50, maxScoreHundredths: 0, scoreHundredths: 0, status: "RECORDED" },
    ]);
    expect(score.percentHundredths).toBe(5000);
    expect(Number.isNaN(score.percentHundredths)).toBe(false);
  });

  it("returns null for no marks at all rather than NaN", () => {
    expect(computeSubjectScore([]).percentHundredths).toBeNull();
  });
});

describe("computeOverallPercent", () => {
  it("averages subject percentages equally", () => {
    expect(computeOverallPercent([8000, 7000, 6000])).toBe(7000);
  });

  it("leaves out subjects with no basis rather than counting them as zero", () => {
    // Counting the null as 0 would drag a strong student's average down for
    // a subject they were excused from entirely.
    expect(computeOverallPercent([8000, null, 6000])).toBe(7000);
  });

  it("returns null when there is nothing to judge", () => {
    expect(computeOverallPercent([])).toBeNull();
    expect(computeOverallPercent([null, null])).toBeNull();
  });
});

describe("formatting", () => {
  it("renders percentages and scores without float maths", () => {
    expect(formatPercent(8567)).toBe("85.67%");
    expect(formatPercent(10000)).toBe("100.00%");
    expect(formatPercent(null)).toBe("—");
    expect(formatScore(1750)).toBe("17.50");
    expect(formatScore(1800)).toBe("18");
    expect(formatScore(null)).toBe("—");
  });
});
