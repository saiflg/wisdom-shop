import { buildQuestionPrompt, normaliseGenerated } from "./question-prompt";

const subject = { name: "Mathematics", gradeLevel: "Grade 5" };
const settings = { country: "Nigeria", curriculumStandard: "NERDC" };

const good = {
  type: "SINGLE_CHOICE",
  prompt: "What is one half of eight?",
  options: [
    { key: "A", text: "2" },
    { key: "B", text: "4" },
    { key: "C", text: "6" },
  ],
  answer: ["B"],
  marks: 2,
};

describe("buildQuestionPrompt", () => {
  it("names the topic, subject, grade, country and standard", () => {
    const prompt = buildQuestionPrompt(subject, "Fractions", settings, 5);
    expect(prompt).toContain("Fractions");
    expect(prompt).toContain("Mathematics");
    expect(prompt).toContain("Grade 5");
    expect(prompt).toContain("Nigeria");
    expect(prompt).toContain("NERDC");
    expect(prompt).toContain("5 exam questions");
  });

  it("prefers an explicitly requested grade level over the subject's", () => {
    expect(buildQuestionPrompt(subject, "Fractions", settings, 3, "Grade 6")).toContain("Grade 6");
  });

  it("reads cleanly when the school has set no country or standard", () => {
    const prompt = buildQuestionPrompt(
      { name: "Mathematics", gradeLevel: null },
      "Fractions",
      { country: null, curriculumStandard: null },
      3,
    );
    expect(prompt).not.toContain("undefined");
    expect(prompt).not.toContain("null");
  });

  it("does not offer ESSAY as a type", () => {
    // An essay has no key to generate, and a model asked for one invents a
    // "model answer" that reads like a mark scheme without being one.
    expect(buildQuestionPrompt(subject, "Fractions", settings, 3)).not.toContain("ESSAY");
  });
});

describe("normaliseGenerated", () => {
  it("keeps a well-formed question and converts marks to hundredths", () => {
    const result = normaliseGenerated({ questions: [good] });
    expect(result.rejected).toEqual([]);
    expect(result.questions).toEqual([
      {
        type: "SINGLE_CHOICE",
        prompt: "What is one half of eight?",
        options: [
          { key: "A", text: "2" },
          { key: "B", text: "4" },
          { key: "C", text: "6" },
        ],
        answer: ["B"],
        marksHundredths: 200,
      },
    ]);
  });

  it("rejects an answer naming an option that is not there", () => {
    // The dangerous one: this would mark every student wrong, whatever they
    // chose, and nobody would see why.
    const result = normaliseGenerated({ questions: [{ ...good, answer: ["D"] }] });
    expect(result.questions).toEqual([]);
    expect(result.rejected[0]).toContain("not there");
  });

  it("rejects a single-choice question with two correct options", () => {
    const result = normaliseGenerated({ questions: [{ ...good, answer: ["A", "B"] }] });
    expect(result.questions).toEqual([]);
    expect(result.rejected[0]).toContain("single-answer");
  });

  it("rejects a multi-choice question with only one correct option", () => {
    const result = normaliseGenerated({
      questions: [{ ...good, type: "MULTI_CHOICE", answer: ["B"] }],
    });
    expect(result.questions).toEqual([]);
    expect(result.rejected[0]).toContain("only one correct option");
  });

  it("rejects a choice question with fewer than two options", () => {
    const result = normaliseGenerated({
      questions: [{ ...good, options: [{ key: "A", text: "2" }], answer: ["A"] }],
    });
    expect(result.rejected[0]).toContain("fewer than two options");
  });

  it("rejects duplicate option labels", () => {
    const result = normaliseGenerated({
      questions: [
        {
          ...good,
          options: [
            { key: "A", text: "2" },
            { key: "A", text: "4" },
          ],
        },
      ],
    });
    expect(result.rejected[0]).toContain("share a label");
  });

  it("rejects a question with no answer key at all", () => {
    expect(normaliseGenerated({ questions: [{ ...good, answer: [] }] }).rejected[0]).toContain(
      "no answer key",
    );
  });

  it("rejects a question with no text", () => {
    expect(normaliseGenerated({ questions: [{ ...good, prompt: "   " }] }).rejected[0]).toContain(
      "no question text",
    );
  });

  it("rejects an unrecognised type, including ESSAY", () => {
    expect(normaliseGenerated({ questions: [{ ...good, type: "ESSAY" }] }).rejected[0]).toContain(
      "unrecognised type",
    );
  });

  it("keeps short answers with every accepted spelling", () => {
    const result = normaliseGenerated({
      questions: [
        {
          type: "SHORT_ANSWER",
          prompt: "How many sides has a triangle?",
          options: [],
          answer: ["3", "three"],
          marks: 1,
        },
      ],
    });
    expect(result.questions[0]).toEqual({
      type: "SHORT_ANSWER",
      prompt: "How many sides has a triangle?",
      options: [],
      answer: ["3", "three"],
      marksHundredths: 100,
    });
  });

  it("uppercases and de-duplicates the answer keys", () => {
    const result = normaliseGenerated({
      questions: [{ ...good, type: "MULTI_CHOICE", answer: ["a", "A", "b"] }],
    });
    expect(result.questions[0].answer).toEqual(["A", "B"]);
  });

  it("falls back to one mark rather than rejecting a good question", () => {
    expect(normaliseGenerated({ questions: [{ ...good, marks: 0 }] }).questions[0].marksHundredths).toBe(100);
    expect(
      normaliseGenerated({ questions: [{ ...good, marks: "lots" }] }).questions[0].marksHundredths,
    ).toBe(100);
  });

  it("keeps the good questions and reports the bad ones from the same batch", () => {
    // The teacher asked for three and gets two — and is told why, rather
    // than being left to count.
    const result = normaliseGenerated({
      questions: [good, { ...good, answer: ["Z"] }, { ...good, prompt: "Another?" }],
    });
    expect(result.questions).toHaveLength(2);
    expect(result.rejected).toHaveLength(1);
  });

  it("fails closed on a response that is not a question list", () => {
    expect(normaliseGenerated(null).questions).toEqual([]);
    expect(normaliseGenerated({ questions: "sorry, I cannot" }).questions).toEqual([]);
    expect(normaliseGenerated({}).rejected[0]).toContain("no questions");
  });

  it("drops option entries that are not key/text pairs", () => {
    const result = normaliseGenerated({
      questions: [{ ...good, options: [{ key: "A", text: "2" }, "B", null, { key: "C", text: "6" }] }],
    });
    // Two survivors is still a valid question; the answer "B" no longer
    // names one of them, so it is rejected rather than silently re-lettered.
    expect(result.questions).toEqual([]);
    expect(result.rejected[0]).toContain("not there");
  });
});
