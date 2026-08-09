import {
  studentOptions,
  toStudentPaper,
  toStudentQuestion,
  type StoredExamQuestion,
} from "./student-paper";

const question = (overrides: Partial<StoredExamQuestion> = {}): StoredExamQuestion => ({
  id: "q1",
  orderIndex: 0,
  type: "SINGLE_CHOICE",
  prompt: "What is 2 + 2?",
  options: [
    { key: "A", text: "3" },
    { key: "B", text: "4" },
  ],
  answer: ["B"],
  marksHundredths: 200,
  ...overrides,
});

describe("toStudentQuestion", () => {
  it("keeps everything a student needs to answer", () => {
    expect(toStudentQuestion(question())).toEqual({
      id: "q1",
      type: "SINGLE_CHOICE",
      prompt: "What is 2 + 2?",
      options: [
        { key: "A", text: "3" },
        { key: "B", text: "4" },
      ],
      marksHundredths: 200,
    });
  });

  it("has no answer field at all, not an empty one", () => {
    const result = toStudentQuestion(question()) as Record<string, unknown>;
    expect("answer" in result).toBe(false);
  });

  it("does not mutate the row it was given", () => {
    // A staff-facing caller may still be holding this object.
    const stored = question();
    toStudentQuestion(stored);
    expect(stored.answer).toEqual(["B"]);
  });

  it("drops a field added to the model later rather than passing it through", () => {
    // The point of rebuilding instead of spreading: a new column is invisible
    // to students until somebody decides it should not be.
    const withExtra = { ...question(), markingNotes: "accept 'four'" } as StoredExamQuestion;
    const result = toStudentQuestion(withExtra) as Record<string, unknown>;
    expect("markingNotes" in result).toBe(false);
  });
});

describe("studentOptions", () => {
  it("passes through well-formed options", () => {
    expect(studentOptions([{ key: "A", text: "yes" }])).toEqual([{ key: "A", text: "yes" }]);
  });

  it("returns nothing for a written question with no options", () => {
    expect(studentOptions([])).toEqual([]);
  });

  it("fails closed on data it cannot parse", () => {
    // Passing an unparsed object through could carry the key inside it.
    expect(studentOptions({ correct: "B" })).toEqual([]);
    expect(studentOptions(null)).toEqual([]);
    expect(studentOptions("A, B, C")).toEqual([]);
  });

  it("drops entries that are not key/text pairs", () => {
    expect(studentOptions([{ key: "A", text: "yes" }, "B", null])).toEqual([
      { key: "A", text: "yes" },
    ]);
  });

  it("keeps only key and text from an option carrying extra fields", () => {
    expect(studentOptions([{ key: "A", text: "yes", isCorrect: true }])).toEqual([
      { key: "A", text: "yes" },
    ]);
  });
});

describe("toStudentPaper", () => {
  const paper = [
    question({ id: "q1", orderIndex: 0 }),
    question({ id: "q2", orderIndex: 1 }),
    question({ id: "q3", orderIndex: 2 }),
    question({ id: "q4", orderIndex: 3 }),
  ];

  it("keeps the teacher's order when shuffling is off", () => {
    const result = toStudentPaper(paper, { shuffle: false, seed: 5 });
    expect(result.map((q) => q.id)).toEqual(["q1", "q2", "q3", "q4"]);
  });

  it("sorts by orderIndex rather than trusting the array order", () => {
    const scrambled = [paper[2], paper[0], paper[3], paper[1]];
    const result = toStudentPaper(scrambled, { shuffle: false, seed: 5 });
    expect(result.map((q) => q.id)).toEqual(["q1", "q2", "q3", "q4"]);
  });

  it("gives the same student the same order twice", () => {
    const first = toStudentPaper(paper, { shuffle: true, seed: 77 });
    const second = toStudentPaper(paper, { shuffle: true, seed: 77 });
    expect(first.map((q) => q.id)).toEqual(second.map((q) => q.id));
  });

  it("loses no question when shuffling", () => {
    const result = toStudentPaper(paper, { shuffle: true, seed: 77 });
    expect(result.map((q) => q.id).sort()).toEqual(["q1", "q2", "q3", "q4"]);
  });

  it("strips the answer from every question in the paper", () => {
    for (const item of toStudentPaper(paper, { shuffle: true, seed: 3 })) {
      expect("answer" in (item as Record<string, unknown>)).toBe(false);
    }
  });

  it("handles an empty paper", () => {
    expect(toStudentPaper([], { shuffle: true, seed: 1 })).toEqual([]);
  });
});
