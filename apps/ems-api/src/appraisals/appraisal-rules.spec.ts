import {
  appraisalProblem,
  availableTransitions,
  checkTransition,
  isVisibleToSubject,
  overallScore,
  validateRatings,
} from "./appraisal-rules";

const REVIEWER = { isAdmin: false, isReviewer: true, isSubject: false };
const SUBJECT = { isAdmin: false, isReviewer: false, isSubject: true };
const HEAD = { isAdmin: true, isReviewer: false, isSubject: false };

describe("checkTransition", () => {
  it("lets the reviewer share a draft", () => {
    expect(checkTransition("DRAFT", "SHARED", REVIEWER)).toBeNull();
  });

  it("does not let the subject see a draft into existence", () => {
    expect(checkTransition("DRAFT", "SHARED", SUBJECT)).toBe("Only the reviewer can share this appraisal");
  });

  // The rule this module exists for.
  it("lets only the person being appraised acknowledge it", () => {
    // An acknowledgement is a statement that somebody has seen what was
    // written about them. One entered by anybody else is a record of a
    // conversation that may never have happened — and that is exactly what
    // it would later be produced as evidence of.
    expect(checkTransition("SHARED", "ACKNOWLEDGED", SUBJECT)).toBeNull();
    expect(checkTransition("SHARED", "ACKNOWLEDGED", REVIEWER)).toBe(
      "Only the person being appraised can acknowledge it",
    );
    expect(checkTransition("SHARED", "ACKNOWLEDGED", HEAD)).toBe(
      "Only the person being appraised can acknowledge it",
    );
  });

  it("refuses to acknowledge something never shared", () => {
    // Otherwise an appraisal could be signed off without the subject ever
    // having been shown it.
    expect(checkTransition("DRAFT", "ACKNOWLEDGED", SUBJECT)).toBe(
      "This has to be shared before it can be acknowledged",
    );
  });

  it("lets a reviewer take a shared appraisal back to draft", () => {
    expect(checkTransition("SHARED", "DRAFT", REVIEWER)).toBeNull();
  });

  it("refuses to reopen one that has been acknowledged", () => {
    // Editing after acknowledgement would make the record disagree with what
    // the person actually saw and signed.
    expect(checkTransition("ACKNOWLEDGED", "DRAFT", REVIEWER)).toBe(
      "Only a shared appraisal can be taken back to draft",
    );
    expect(checkTransition("ACKNOWLEDGED", "SHARED", HEAD)).toBe("Only a draft can be shared");
  });
});

describe("availableTransitions", () => {
  it("offers the subject exactly one thing on a shared appraisal", () => {
    expect(availableTransitions("SHARED", SUBJECT)).toEqual(["ACKNOWLEDGED"]);
  });

  it("offers the reviewer nothing on a shared one but taking it back", () => {
    expect(availableTransitions("SHARED", REVIEWER)).toEqual(["DRAFT"]);
  });

  it("offers nothing at all once acknowledged", () => {
    for (const actor of [REVIEWER, SUBJECT, HEAD]) {
      expect(availableTransitions("ACKNOWLEDGED", actor)).toEqual([]);
    }
  });

  it("never offers a move checkTransition would refuse", () => {
    const states = ["DRAFT", "SHARED", "ACKNOWLEDGED"] as const;
    for (const actor of [REVIEWER, SUBJECT, HEAD]) {
      for (const from of states) {
        for (const to of availableTransitions(from, actor)) {
          expect(checkTransition(from, to, actor)).toBeNull();
        }
      }
    }
  });
});

describe("appraisalProblem", () => {
  it("accepts an ordinary appraisal", () => {
    expect(
      appraisalProblem({ subjectUserId: "teacher", reviewerUserId: "head", periodLabel: "First term" }),
    ).toBeNull();
  });

  // The other rule worth naming.
  it("refuses one somebody wrote about themselves", () => {
    // Not a lenient appraisal — not an appraisal. It is the kind of row that
    // only turns up years later, when somebody is looking for a reason.
    expect(
      appraisalProblem({ subjectUserId: "head", reviewerUserId: "head", periodLabel: "First term" }),
    ).toBe("Somebody cannot write their own appraisal");
  });

  it("wants to know which period it covers", () => {
    expect(appraisalProblem({ subjectUserId: "a", reviewerUserId: "b", periodLabel: "  " })).toBe(
      "Say which period this covers",
    );
  });
});

describe("validateRatings", () => {
  const GOOD = [
    { area: "Planning", score: 4 },
    { area: "Classroom management", score: 5 },
  ];

  it("accepts ordinary ratings", () => {
    expect(validateRatings(GOOD)).toBeNull();
  });

  it("accepts none at all, so a reviewer can fill it in over a week", () => {
    expect(validateRatings([])).toBeNull();
  });

  it("refuses a score off the scale", () => {
    expect(validateRatings([{ area: "Planning", score: 0 }])).toBe('"Planning" must be scored from 1 to 5');
    expect(validateRatings([{ area: "Planning", score: 6 }])).toBe('"Planning" must be scored from 1 to 5');
    expect(validateRatings([{ area: "Planning", score: 3.5 }])).toBe('"Planning" needs a whole score');
  });

  it("refuses two ratings for the same area", () => {
    // The average would otherwise depend on which one happened to be read
    // last.
    expect(
      validateRatings([
        { area: "Planning", score: 2 },
        { area: "planning", score: 5 },
      ]),
    ).toBe('There are two ratings for "planning"');
  });

  it("refuses a blank area", () => {
    expect(validateRatings([{ area: "   ", score: 3 }])).toBe("Every rating needs an area");
  });
});

describe("overallScore", () => {
  it("averages the ratings", () => {
    expect(
      overallScore([
        { area: "a", score: 4 },
        { area: "b", score: 5 },
      ]),
    ).toBe(4.5);
  });

  // The honest gap.
  it("is null when nothing has been rated", () => {
    // Zero is off the scale and reads as the worst possible appraisal; a
    // default of 3 puts a rating on somebody that no reviewer gave them.
    expect(overallScore([])).toBeNull();
  });

  it("keeps one decimal rather than rounding up a grade", () => {
    // 3.7 is honest; 4 is a promotion nobody awarded.
    expect(
      overallScore([
        { area: "a", score: 4 },
        { area: "b", score: 4 },
        { area: "c", score: 3 },
      ]),
    ).toBe(3.7);
  });
});

describe("isVisibleToSubject", () => {
  it("hides a draft and shows the rest", () => {
    // A half-written appraisal is not something to read about yourself.
    expect(isVisibleToSubject("DRAFT")).toBe(false);
    expect(isVisibleToSubject("SHARED")).toBe(true);
    expect(isVisibleToSubject("ACKNOWLEDGED")).toBe(true);
  });
});
