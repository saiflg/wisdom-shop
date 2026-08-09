import {
  markAnswer,
  normaliseText,
  paperTotalHundredths,
  scaleToAssessment,
  tallyAttempt,
  type MarkableQuestion,
} from "./marking";

const single = (answer: string[], marks = 200): MarkableQuestion => ({
  type: "SINGLE_CHOICE",
  answer,
  marksHundredths: marks,
});

describe("normaliseText", () => {
  it("ignores case and surrounding space", () => {
    expect(normaliseText("  Photosynthesis ")).toBe("photosynthesis");
  });

  it("collapses runs of inner whitespace", () => {
    expect(normaliseText("carbon\t\n  dioxide")).toBe("carbon dioxide");
  });

  it("leaves punctuation alone", () => {
    // Stripping it would eventually mark "1,000" and "1.000" the same.
    expect(normaliseText("1,000")).toBe("1,000");
  });
});

describe("markAnswer — single choice", () => {
  it("awards full marks for the right key", () => {
    expect(markAnswer(single(["B"]), ["B"])).toEqual({
      awardedHundredths: 200,
      autoMarked: true,
      needsReview: false,
    });
  });

  it("awards nothing for the wrong key, and needs no review", () => {
    expect(markAnswer(single(["B"]), ["C"])).toEqual({
      awardedHundredths: 0,
      autoMarked: true,
      needsReview: false,
    });
  });

  it("ignores case and padding in the key", () => {
    expect(markAnswer(single(["B"]), [" b "]).awardedHundredths).toBe(200);
  });

  it("accepts any of several keys when the teacher listed alternatives", () => {
    expect(markAnswer(single(["B", "D"]), ["D"]).awardedHundredths).toBe(200);
  });

  it("refuses to mark two selections on a single-answer question", () => {
    // A client bug or someone poking the API — picking one of them would be
    // inventing an answer the student did not give.
    expect(markAnswer(single(["B"]), ["B", "C"])).toEqual({
      awardedHundredths: null,
      autoMarked: false,
      needsReview: true,
    });
  });

  it("sends a question with no answer key to a human", () => {
    expect(markAnswer(single([]), ["B"])).toEqual({
      awardedHundredths: null,
      autoMarked: false,
      needsReview: true,
    });
  });
});

describe("markAnswer — true/false", () => {
  const question: MarkableQuestion = { type: "TRUE_FALSE", answer: ["TRUE"], marksHundredths: 100 };

  it("marks the right answer", () => {
    expect(markAnswer(question, ["true"]).awardedHundredths).toBe(100);
  });

  it("marks the wrong answer zero", () => {
    expect(markAnswer(question, ["FALSE"]).awardedHundredths).toBe(0);
  });
});

describe("markAnswer — multiple choice", () => {
  const question: MarkableQuestion = {
    type: "MULTI_CHOICE",
    answer: ["A", "C"],
    marksHundredths: 400,
  };

  it("awards full marks for exactly the right set", () => {
    expect(markAnswer(question, ["C", "A"]).awardedHundredths).toBe(400);
  });

  it("awards nothing for a partly right set", () => {
    // All-or-nothing, deliberately: partial credit needs a policy the
    // teacher chose, not one invented here.
    expect(markAnswer(question, ["A"]).awardedHundredths).toBe(0);
  });

  it("awards nothing when a wrong option is added to the right ones", () => {
    expect(markAnswer(question, ["A", "B", "C"]).awardedHundredths).toBe(0);
  });

  it("ignores duplicate selections of the same option", () => {
    expect(markAnswer(question, ["A", "A", "C"]).awardedHundredths).toBe(400);
  });
});

describe("markAnswer — short answer", () => {
  const question: MarkableQuestion = {
    type: "SHORT_ANSWER",
    answer: ["4", "four"],
    marksHundredths: 100,
  };

  it("accepts any spelling the teacher listed", () => {
    expect(markAnswer(question, ["Four"]).awardedHundredths).toBe(100);
    expect(markAnswer(question, ["4"]).awardedHundredths).toBe(100);
  });

  it("records zero but asks for review when nothing matches", () => {
    // "IV" may well be right; the teacher just didn't list it. The total
    // stays honest and a person confirms before it stands.
    expect(markAnswer(question, ["IV"])).toEqual({
      awardedHundredths: 0,
      autoMarked: true,
      needsReview: true,
    });
  });

  it("sends it to a human when the teacher listed no accepted answers", () => {
    const open: MarkableQuestion = { type: "SHORT_ANSWER", answer: [], marksHundredths: 100 };
    expect(markAnswer(open, ["anything"]).needsReview).toBe(true);
    expect(markAnswer(open, ["anything"]).awardedHundredths).toBeNull();
  });
});

describe("markAnswer — essays and blanks", () => {
  it("never machine-marks an essay, even an empty one", () => {
    const essay: MarkableQuestion = { type: "ESSAY", answer: [], marksHundredths: 1000 };
    expect(markAnswer(essay, [])).toEqual({
      awardedHundredths: null,
      autoMarked: false,
      needsReview: true,
    });
    expect(markAnswer(essay, ["A long answer"]).autoMarked).toBe(false);
  });

  it("marks an unanswered objective question zero without review", () => {
    expect(markAnswer(single(["B"]), [])).toEqual({
      awardedHundredths: 0,
      autoMarked: true,
      needsReview: false,
    });
  });

  it("treats whitespace-only as unanswered", () => {
    expect(markAnswer(single(["B"]), ["   "]).awardedHundredths).toBe(0);
    expect(markAnswer(single(["B"]), ["   "]).needsReview).toBe(false);
  });
});

describe("tallyAttempt", () => {
  it("keeps the machine's marks and the teacher's apart", () => {
    expect(
      tallyAttempt([
        { awardedHundredths: 200, autoMarked: true, needsReview: false },
        { awardedHundredths: 0, autoMarked: true, needsReview: false },
        { awardedHundredths: 600, autoMarked: false, needsReview: false },
      ]),
    ).toEqual({
      autoScoreHundredths: 200,
      manualScoreHundredths: 600,
      totalScoreHundredths: 800,
      needsReview: false,
    });
  });

  it("stays in review while any answer is unmarked", () => {
    const tally = tallyAttempt([
      { awardedHundredths: 200, autoMarked: true, needsReview: false },
      { awardedHundredths: null, autoMarked: false, needsReview: true },
    ]);
    expect(tally.needsReview).toBe(true);
    // The unmarked one contributes nothing rather than counting as zero.
    expect(tally.totalScoreHundredths).toBe(200);
  });

  it("stays in review for a flagged short answer even though it has a score", () => {
    expect(
      tallyAttempt([{ awardedHundredths: 0, autoMarked: true, needsReview: true }]).needsReview,
    ).toBe(true);
  });

  it("is zero for an empty paper", () => {
    expect(tallyAttempt([])).toEqual({
      autoScoreHundredths: 0,
      manualScoreHundredths: 0,
      totalScoreHundredths: 0,
      needsReview: false,
    });
  });
});

describe("paperTotalHundredths", () => {
  it("adds up every question, answered or not", () => {
    expect(paperTotalHundredths([{ marksHundredths: 200 }, { marksHundredths: 350 }])).toBe(550);
  });

  it("is zero for a paper with no questions", () => {
    expect(paperTotalHundredths([])).toBe(0);
  });
});

describe("scaleToAssessment", () => {
  it("scales onto the gradebook's own total", () => {
    // 30/40 on the paper is 15/20 in the gradebook, not 30.
    expect(scaleToAssessment(3000, 4000, 2000)).toBe(1500);
  });

  it("rounds to the nearest hundredth of a mark", () => {
    expect(scaleToAssessment(1000, 3000, 1000)).toBe(333);
  });

  it("returns zero rather than dividing by zero on an empty paper", () => {
    expect(scaleToAssessment(0, 0, 2000)).toBe(0);
  });

  it("keeps full marks full", () => {
    expect(scaleToAssessment(4000, 4000, 2000)).toBe(2000);
  });
});
