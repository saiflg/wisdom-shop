import {
  bySubject,
  buildTranscript,
  compareTerms,
  cumulativeAverage,
  formatPercent,
  gradePointAverage,
  termRank,
  type TermRow,
} from "./transcript";

function term(overrides: Partial<TermRow> = {}): TermRow {
  return {
    academicYear: "2026-2027",
    term: "Term 1",
    className: "JSS 1A",
    status: "PUBLISHED",
    overallPercentHundredths: 7000,
    publishedAt: new Date("2026-12-15T00:00:00.000Z"),
    subjects: [
      { subjectName: "Mathematics", percentHundredths: 7500, gradeLabel: "B", gradePoint: 4 },
      { subjectName: "English", percentHundredths: 6500, gradeLabel: "C", gradePoint: 3 },
    ],
    ...overrides,
  };
}

describe("published only", () => {
  it("EXCLUDES a draft term, even from staff", () => {
    // A report card lets a teacher see a draft because they are working on
    // it. A transcript leaves the building: one containing an unpublished
    // term is a document that changes after it has been issued.
    const transcript = buildTranscript([term(), term({ term: "Term 2", status: "DRAFT" })]);
    expect(transcript.termsCounted).toBe(1);
  });

  it("says so, rather than silently omitting it", () => {
    // A transcript that quietly drops a term looks complete and is not.
    const transcript = buildTranscript([term(), term({ term: "Term 2", status: "DRAFT" })]);
    expect(transcript.notes.join(" ")).toMatch(/1 term is not published yet/);
  });

  it("gets the plural right for several", () => {
    const transcript = buildTranscript([
      term(),
      term({ term: "Term 2", status: "DRAFT" }),
      term({ term: "Term 3", status: "DRAFT" }),
    ]);
    expect(transcript.notes.join(" ")).toMatch(/2 terms are not published yet and do not appear/);
  });
});

describe("cumulativeAverage", () => {
  it("is the mean of each term's overall", () => {
    expect(cumulativeAverage([term({ overallPercentHundredths: 6000 }), term({ overallPercentHundredths: 8000 })]))
      .toBe(7000);
  });

  it("SKIPS a term with no overall rather than counting it as zero", () => {
    // The commonest way an averaging bug quietly libels a child.
    const average = cumulativeAverage([
      term({ overallPercentHundredths: 8000 }),
      term({ overallPercentHundredths: null }),
    ]);
    expect(average).toBe(8000);
  });

  it("is null when nothing can be averaged", () => {
    expect(cumulativeAverage([])).toBeNull();
    expect(cumulativeAverage([term({ overallPercentHundredths: null })])).toBeNull();
  });

  it("counts each term once, whatever its subject count", () => {
    // Weighting by subjects would let a timetable change move a leaver's
    // average, which is not something a school can explain.
    const many = term({
      overallPercentHundredths: 5000,
      subjects: Array.from({ length: 9 }, (_, i) => ({
        subjectName: `S${i}`,
        percentHundredths: 5000,
        gradeLabel: "D",
        gradePoint: 2,
      })),
    });
    const few = term({ term: "Term 2", overallPercentHundredths: 9000 });
    expect(cumulativeAverage([many, few])).toBe(7000);
  });

  it("reports the missing overalls in the notes", () => {
    const transcript = buildTranscript([term(), term({ term: "Term 2", overallPercentHundredths: null })]);
    expect(transcript.notes.join(" ")).toMatch(/no overall mark/);
    expect(transcript.cumulativeAverage).toBe("70.00%");
  });
});

describe("gradePointAverage", () => {
  it("averages every subject in every term", () => {
    // 4 and 3 in one term, 4 and 3 in another.
    expect(gradePointAverage([term(), term({ term: "Term 2" })])).toBe(3.5);
  });

  it("is null when the scale carries no points, rather than inventing them", () => {
    const noPoints = term({
      subjects: [{ subjectName: "Mathematics", percentHundredths: 7500, gradeLabel: "B", gradePoint: null }],
    });
    expect(gradePointAverage([noPoints])).toBeNull();
    expect(buildTranscript([noPoints]).gradePointAverage).toBeNull();
  });

  it("ignores the subjects that have no point, keeping the ones that do", () => {
    const mixed = term({
      subjects: [
        { subjectName: "Mathematics", percentHundredths: 7500, gradeLabel: "B", gradePoint: 4 },
        { subjectName: "Art", percentHundredths: 8000, gradeLabel: "A", gradePoint: null },
      ],
    });
    expect(gradePointAverage([mixed])).toBe(4);
  });
});

describe("term ordering", () => {
  it("reads a number out of the term name", () => {
    expect(termRank("Term 1")).toBe(1);
    expect(termRank("Term 3")).toBe(3);
  });

  it("understands the written ordinals schools use", () => {
    expect(termRank("First Term")).toBe(1);
    expect(termRank("Second Term")).toBe(2);
  });

  it("puts an unrecognised name last rather than first", () => {
    // Sorting "Michaelmas" to the front would silently reorder a record.
    expect(termRank("Michaelmas")).toBeGreaterThan(termRank("Term 3"));
  });

  it("orders by year first, then term", () => {
    const rows = [
      term({ academicYear: "2027-2028", term: "Term 1" }),
      term({ academicYear: "2026-2027", term: "Term 3" }),
      term({ academicYear: "2026-2027", term: "Term 1" }),
    ];
    const ordered = [...rows].sort(compareTerms).map((r) => `${r.academicYear} ${r.term}`);
    expect(ordered).toEqual(["2026-2027 Term 1", "2026-2027 Term 3", "2027-2028 Term 1"]);
  });

  it("is stable for two terms it cannot rank", () => {
    const rows = [term({ term: "Trinity" }), term({ term: "Michaelmas" })];
    expect([...rows].sort(compareTerms).map((r) => r.term)).toEqual(["Michaelmas", "Trinity"]);
  });
});

describe("buildTranscript", () => {
  it("lists the years covered, earliest first", () => {
    const transcript = buildTranscript([
      term({ academicYear: "2027-2028" }),
      term({ academicYear: "2026-2027" }),
    ]);
    expect(transcript.years).toEqual(["2026-2027", "2027-2028"]);
  });

  it("formats every figure once, so surfaces cannot disagree", () => {
    const transcript = buildTranscript([term({ overallPercentHundredths: 7250 })]);
    expect(transcript.terms[0]?.overall).toBe("72.50%");
    expect(transcript.cumulativeAverage).toBe("72.50%");
  });

  it("is empty and calm for a student with nothing published", () => {
    const transcript = buildTranscript([]);
    expect(transcript.terms).toEqual([]);
    expect(transcript.cumulativeAverage).toBeNull();
    expect(transcript.gradePointAverage).toBeNull();
  });
});

describe("bySubject", () => {
  it("answers 'how did they do at mathematics' across the whole record", () => {
    const transcript = buildTranscript([
      term({ term: "Term 1" }),
      term({
        term: "Term 2",
        subjects: [{ subjectName: "Mathematics", percentHundredths: 8500, gradeLabel: "A", gradePoint: 5 }],
      }),
    ]);
    const maths = bySubject(transcript).find((s) => s.subjectName === "Mathematics");
    expect(maths?.entries).toHaveLength(2);
    expect(maths?.best).toBe("85.00%");
    expect(maths?.average).toBe("80.00%");
  });

  it("sorts subjects alphabetically, so two transcripts compare", () => {
    const names = bySubject(buildTranscript([term()])).map((s) => s.subjectName);
    expect(names).toEqual(["English", "Mathematics"]);
  });

  it("includes a subject taken in only one term", () => {
    const transcript = buildTranscript([
      term({ subjects: [{ subjectName: "Art", percentHundredths: 9000, gradeLabel: "A", gradePoint: 5 }] }),
    ]);
    expect(bySubject(transcript)[0]?.subjectName).toBe("Art");
  });
});

describe("formatPercent", () => {
  it("always shows two decimals", () => {
    expect(formatPercent(7000)).toBe("70.00%");
    expect(formatPercent(7)).toBe("0.07%");
  });

  it("is null rather than a zero when there is nothing to show", () => {
    expect(formatPercent(null)).toBeNull();
  });
});
