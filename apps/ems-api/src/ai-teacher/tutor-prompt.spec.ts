import {
  buildCoursePrompt,
  buildLessonPrompt,
  buildTutorPrompt,
  MAX_TRANSCRIPT_TURNS,
  trimTranscript,
  type TranscriptTurn,
} from "./tutor-prompt";

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

  it("asks for a diagram, restricted to what the sanitiser will actually accept", () => {
    const prompt = buildTutorPrompt(CONTEXT, [], "Hi");
    expect(prompt).toMatch(/inline SVG/);
    expect(prompt).toMatch(/viewBox/);
    // Asking for anything the sanitiser drops on arrival would only waste it.
    expect(prompt).toMatch(/script, style, image, use, href/);
  });

  it("makes a diagram the default rather than something to consider", () => {
    // A student following a lesson on a screen learns more from seeing a
    // thing than from reading about it. Asked "if it would help", models
    // mostly decided it would not.
    const prompt = buildTutorPrompt(CONTEXT, [], "Hi");
    expect(prompt).toMatch(/default, not the exception/);
    expect(prompt).toMatch(/Draw a picture/);
  });

  it("still names the cases where drawing would be noise", () => {
    // "Always draw" produces a picture of a definition, and the same picture
    // twice running.
    const prompt = buildTutorPrompt(CONTEXT, [], "Hi");
    expect(prompt).toMatch(/nothing to show/);
    expect(prompt).toMatch(/never repeat the same diagram/i);
  });

  it("names the constructs that silently cost a whole diagram", () => {
    // The sanitiser drops the entire document on any one of these, so a
    // single stray comment or arrowhead marker loses the picture. Each line
    // here is something that actually happened before anyone could see it.
    const prompt = buildTutorPrompt(CONTEXT, [], "Hi");
    expect(prompt).toMatch(/comments/i);
    expect(prompt).toMatch(/<defs>/);
    expect(prompt).toMatch(/polygon/);
    expect(prompt).toMatch(/&#/);
  });

  it("asks for a title and description, which is what the alt text is built from", () => {
    expect(buildTutorPrompt(CONTEXT, [], "Hi")).toMatch(/<title>.*<desc>|<desc>/);
  });
});

describe("buildCoursePrompt", () => {
  const bounds = { min: 3, max: 12 };

  it("asks for an ordered course on the student's topic", () => {
    const prompt = buildCoursePrompt(CONTEXT, bounds);
    expect(prompt).toContain("Adding fractions with unlike denominators");
    expect(prompt).toContain("Mathematics");
    expect(prompt).toContain("Grade 5");
    expect(prompt).toMatch(/in the order they should be taught/);
  });

  it("states the lesson-count bounds it was given", () => {
    const prompt = buildCoursePrompt(CONTEXT, { min: 4, max: 8 });
    expect(prompt).toContain("between 4 and 8 lessons");
  });

  it("carries the school's curriculum standard into the plan", () => {
    const prompt = buildCoursePrompt({ ...CONTEXT, country: "Nigeria", curriculumStandard: "NERDC" }, bounds);
    expect(prompt).toContain("NERDC");
    expect(prompt).toContain("Nigeria");
  });

  it("requires the course to cover any objectives it was given", () => {
    const prompt = buildCoursePrompt({ ...CONTEXT, objectives: ["Find a common denominator"] }, bounds);
    expect(prompt).toContain("Find a common denominator");
  });

  it("asks for titles and objectives, which is what the parser reads", () => {
    expect(buildCoursePrompt(CONTEXT, bounds)).toMatch(/short title and one to three objectives/);
  });
});

describe("buildLessonPrompt", () => {
  const lesson = { title: "Equivalent fractions", objectives: ["Spot equivalent fractions"] };

  it("says which lesson of how many is being taught", () => {
    const prompt = buildLessonPrompt(CONTEXT, lesson, { index: 1, total: 5 }, []);
    expect(prompt).toContain("lesson 2 of 5");
    expect(prompt).toContain("Equivalent fractions");
    expect(prompt).toContain("Spot equivalent fractions");
  });

  it("tells the tutor to build on earlier lessons rather than repeat them", () => {
    const prompt = buildLessonPrompt(CONTEXT, lesson, { index: 2, total: 5 }, []);
    expect(prompt).toMatch(/build on them, do not repeat them/);
    expect(prompt).toMatch(/Do not summarise the whole course/);
  });

  it("asks the last lesson to sum the course up", () => {
    const prompt = buildLessonPrompt(CONTEXT, lesson, { index: 4, total: 5 }, []);
    expect(prompt).toMatch(/This is the last lesson/);
    expect(prompt).not.toMatch(/Do not summarise the whole course/);
  });

  it("replays the class so far, which is what makes resuming continuous", () => {
    const prompt = buildLessonPrompt(CONTEXT, lesson, { index: 1, total: 3 }, [
      { role: "TUTOR", content: "Lesson one covered what a fraction is." },
      { role: "STUDENT", content: "Got it." },
    ]);
    expect(prompt).toContain("Teacher: Lesson one covered what a fraction is.");
    expect(prompt).toContain("Student: Got it.");
  });

  it("tells the student they may pause", () => {
    expect(buildLessonPrompt(CONTEXT, lesson, { index: 0, total: 3 }, [])).toMatch(/pause and come back/);
  });

  it("carries the same child-safety rules as a question does", () => {
    const prompt = buildLessonPrompt(CONTEXT, lesson, { index: 0, total: 3 }, []);
    expect(prompt).toMatch(/trusted adult/);
    expect(prompt).toMatch(/do not counsel them/);
    expect(prompt).toMatch(/Never ask for or repeat personal details/);
    expect(prompt).toMatch(/Never claim to be a human being/);
  });

  it("offers a diagram here too", () => {
    expect(buildLessonPrompt(CONTEXT, lesson, { index: 0, total: 3 }, [])).toMatch(/inline SVG/);
  });

  it("trims a long class transcript but keeps its opening", () => {
    const long: TranscriptTurn[] = Array.from({ length: 40 }, (_, i) => ({
      role: i % 2 === 0 ? ("TUTOR" as const) : ("STUDENT" as const),
      content: `turn ${i + 1}`,
    }));
    const prompt = buildLessonPrompt(CONTEXT, lesson, { index: 5, total: 8 }, long);
    expect(prompt).toContain("turn 1");
    expect(prompt).toContain("turn 40");
    expect(prompt).not.toContain("turn 20");
  });
});
