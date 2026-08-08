import { buildTutorPrompt, MAX_TRANSCRIPT_TURNS, trimTranscript, type TranscriptTurn } from "./tutor-prompt";

const CONTEXT = {
  subjectName: "Mathematics",
  gradeLevel: "Grade 5",
  topic: "Adding fractions with unlike denominators",
};

function turns(count: number): TranscriptTurn[] {
  return Array.from({ length: count }, (_, index) => ({
    role: index % 2 === 0 ? ("STUDENT" as const) : ("TUTOR" as const),
    content: `turn ${index + 1}`,
  }));
}

describe("trimTranscript", () => {
  it("returns a short transcript untouched", () => {
    expect(trimTranscript(turns(4))).toHaveLength(4);
  });

  it("returns a copy rather than the caller's array", () => {
    const original = turns(2);
    const trimmed = trimTranscript(original);
    trimmed.push({ role: "STUDENT", content: "extra" });
    expect(original).toHaveLength(2);
  });

  it("caps a long transcript at the maximum", () => {
    expect(trimTranscript(turns(50))).toHaveLength(MAX_TRANSCRIPT_TURNS);
  });

  it("always keeps the opening turn, which is what states the topic", () => {
    const trimmed = trimTranscript(turns(50));
    expect(trimmed[0].content).toBe("turn 1");
  });

  it("keeps the most recent turns, so the tutor answers what was just asked", () => {
    const trimmed = trimTranscript(turns(50));
    expect(trimmed[trimmed.length - 1].content).toBe("turn 50");
    expect(trimmed[1].content).toBe("turn 36");
  });

  it("never drops a turn from the middle of a transcript that fits exactly", () => {
    const exact = turns(MAX_TRANSCRIPT_TURNS);
    expect(trimTranscript(exact).map((t) => t.content)).toEqual(exact.map((t) => t.content));
  });

  it("handles degenerate maximums without throwing", () => {
    expect(trimTranscript(turns(5), 0)).toEqual([]);
    expect(trimTranscript(turns(5), 1)).toEqual([{ role: "STUDENT", content: "turn 1" }]);
    expect(trimTranscript([], 10)).toEqual([]);
  });
});

describe("buildTutorPrompt", () => {
  it("names the subject, the topic and the year group", () => {
    const prompt = buildTutorPrompt(CONTEXT, [], "How do I start?");
    expect(prompt).toContain("Mathematics");
    expect(prompt).toContain("Adding fractions with unlike denominators");
    expect(prompt).toContain("Grade 5");
  });

  it("falls back to a generic learner when the subject has no year group", () => {
    const prompt = buildTutorPrompt({ ...CONTEXT, gradeLevel: null }, [], "Hello");
    expect(prompt).toContain("a school student");
    expect(prompt).not.toContain("a null student");
  });

  it("includes the week's objectives when the session is anchored to one", () => {
    const prompt = buildTutorPrompt(
      { ...CONTEXT, objectives: ["Find a common denominator", "Add and simplify"] },
      [],
      "Help",
    );
    expect(prompt).toContain("Find a common denominator");
    expect(prompt).toContain("Add and simplify");
  });

  it("omits the objectives section entirely when there are none", () => {
    expect(buildTutorPrompt(CONTEXT, [], "Help")).not.toContain("objectives");
  });

  it("ignores blank objectives rather than emitting empty bullets", () => {
    const prompt = buildTutorPrompt({ ...CONTEXT, objectives: ["  ", ""] }, [], "Help");
    expect(prompt).not.toContain("objectives");
    expect(prompt).not.toMatch(/^- $/m);
  });

  it("mentions the curriculum standard and country when the school set them", () => {
    const prompt = buildTutorPrompt(
      { ...CONTEXT, country: "Nigeria", curriculumStandard: "NERDC" },
      [],
      "Help",
    );
    expect(prompt).toContain("NERDC");
    expect(prompt).toContain("Nigeria");
  });

  it("copes with only one of country or standard being set", () => {
    expect(buildTutorPrompt({ ...CONTEXT, country: "Ghana" }, [], "Help")).toContain("Ghana");
    expect(buildTutorPrompt({ ...CONTEXT, curriculumStandard: "IGCSE" }, [], "Help")).toContain("IGCSE");
  });

  it("replays the conversation in order, labelled by speaker", () => {
    const prompt = buildTutorPrompt(
      CONTEXT,
      [
        { role: "STUDENT", content: "What is a denominator?" },
        { role: "TUTOR", content: "The number underneath." },
      ],
      "And the numerator?",
    );
    expect(prompt).toContain("Student: What is a denominator?");
    expect(prompt).toContain("Teacher: The number underneath.");
    expect(prompt.indexOf("What is a denominator?")).toBeLessThan(prompt.indexOf("The number underneath."));
  });

  it("puts the new question after the transcript", () => {
    const prompt = buildTutorPrompt(CONTEXT, [{ role: "STUDENT", content: "earlier" }], "the newest question");
    expect(prompt.indexOf("earlier")).toBeLessThan(prompt.indexOf("the newest question"));
  });

  it("omits the transcript section on the first question", () => {
    expect(buildTutorPrompt(CONTEXT, [], "First!")).not.toContain("The lesson so far");
  });

  // The rules below are the reason this file is tested at all. Each one is a
  // requirement for putting a chatbot in front of a child, not a nicety.
  it("tells the tutor to stay on the subject", () => {
    expect(buildTutorPrompt(CONTEXT, [], "Who won the World Cup?")).toMatch(/Stay on Mathematics/);
  });

  it("forbids asking for personal details", () => {
    const prompt = buildTutorPrompt(CONTEXT, [], "Hi");
    expect(prompt).toMatch(/Never ask for or repeat personal details/);
    expect(prompt).toMatch(/address/);
    expect(prompt).toMatch(/password/i);
  });

  it("hands a safeguarding disclosure to a trusted adult instead of counselling it", () => {
    const prompt = buildTutorPrompt(CONTEXT, [], "Hi");
    expect(prompt).toMatch(/do not counsel them/);
    expect(prompt).toMatch(/trusted adult/);
  });

  it("refuses to do homework for the student", () => {
    expect(buildTutorPrompt(CONTEXT, [], "Hi")).toMatch(/guide them to work it out themselves/);
  });

  it("forbids claiming to be human", () => {
    expect(buildTutorPrompt(CONTEXT, [], "Hi")).toMatch(/Never claim to be a human being/);
  });

  it("asks for prose, since a tutoring reply is not JSON", () => {
    expect(buildTutorPrompt(CONTEXT, [], "Hi")).toMatch(/in prose/);
  });

  it("trims a long transcript rather than sending all of it", () => {
    const prompt = buildTutorPrompt(CONTEXT, turns(60), "latest");
    expect(prompt).toContain("turn 1");
    expect(prompt).toContain("turn 60");
    expect(prompt).not.toContain("turn 30");
  });

  it("trims surrounding whitespace from the question and topic", () => {
    const prompt = buildTutorPrompt({ ...CONTEXT, topic: "  Fractions  " }, [], "  spaced out  ");
    expect(prompt).toContain("Today's topic: Fractions");
    expect(prompt).toContain("The student now asks: spaced out");
  });
});
