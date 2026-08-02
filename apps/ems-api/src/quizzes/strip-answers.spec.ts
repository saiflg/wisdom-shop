import { stripAnswers, type QuizContent } from "./strip-answers";

function sampleContent(): QuizContent {
  return {
    questions: [
      {
        questionNumber: 1,
        prompt: "What is 2 + 2?",
        type: "MULTIPLE_CHOICE",
        options: ["3", "4", "5"],
        correctAnswer: "4",
        marks: 1,
      },
      {
        questionNumber: 2,
        prompt: "Name one prime number.",
        type: "SHORT_ANSWER",
        options: [],
        correctAnswer: "2",
        marks: 2,
      },
    ],
  };
}

describe("stripAnswers", () => {
  it("removes correctAnswer from every question", () => {
    const stripped = stripAnswers(sampleContent());
    expect(stripped.questions).toHaveLength(2);
    for (const question of stripped.questions) {
      expect(question).not.toHaveProperty("correctAnswer");
    }
  });

  it("leaves the answer out even when serialised, not just undefined", () => {
    // `toHaveProperty` would still pass for `{ correctAnswer: undefined }`,
    // which JSON.stringify drops but a structured logger might not.
    const serialised = JSON.stringify(stripAnswers(sampleContent()));
    expect(serialised).not.toContain("correctAnswer");
  });

  it("preserves every other field", () => {
    const stripped = stripAnswers(sampleContent());
    expect(stripped.questions[0]).toEqual({
      questionNumber: 1,
      prompt: "What is 2 + 2?",
      type: "MULTIPLE_CHOICE",
      options: ["3", "4", "5"],
      marks: 1,
    });
  });

  it("does not mutate the caller's object", () => {
    const original = sampleContent();
    stripAnswers(original);
    expect(original.questions[0].correctAnswer).toBe("4");
  });

  it("fails closed on malformed or empty content", () => {
    expect(stripAnswers(null)).toEqual({ questions: [] });
    expect(stripAnswers(undefined)).toEqual({ questions: [] });
    expect(stripAnswers({})).toEqual({ questions: [] });
    expect(stripAnswers({ questions: "not an array" })).toEqual({ questions: [] });
    expect(stripAnswers({ questions: [] })).toEqual({ questions: [] });
  });
});
