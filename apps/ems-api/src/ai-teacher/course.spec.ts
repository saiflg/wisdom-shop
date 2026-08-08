import {
  courseFromSchemeWeeks,
  isComplete,
  lessonAt,
  MAX_LESSONS,
  parseCourse,
  percentComplete,
  type Course,
} from "./course";

const COURSE: Course = {
  lessons: [
    { title: "What a fraction is", objectives: ["Name the parts"] },
    { title: "Equivalent fractions", objectives: [] },
    { title: "Adding fractions", objectives: ["Find a common denominator"] },
  ],
};

describe("parseCourse", () => {
  it("reads a well-formed course", () => {
    const parsed = parseCourse({ lessons: [{ title: "One", objectives: ["a", "b"] }] });
    expect(parsed).toEqual({ lessons: [{ title: "One", objectives: ["a", "b"] }] });
  });

  it("keeps a lesson that has no objectives", () => {
    expect(parseCourse({ lessons: [{ title: "One" }] })).toEqual({ lessons: [{ title: "One", objectives: [] }] });
  });

  it("drops entries with no title rather than teaching a blank lesson", () => {
    const parsed = parseCourse({ lessons: [{ title: "" }, { title: "  " }, { title: "Real" }, {}] });
    expect(parsed?.lessons).toEqual([{ title: "Real", objectives: [] }]);
  });

  it("drops non-string objectives instead of rendering [object Object]", () => {
    const parsed = parseCourse({ lessons: [{ title: "One", objectives: ["ok", 42, null, { a: 1 }] }] });
    expect(parsed?.lessons[0].objectives).toEqual(["ok"]);
  });

  it("caps a runaway course", () => {
    const lessons = Array.from({ length: 50 }, (_, i) => ({ title: `Lesson ${i}`, objectives: [] }));
    expect(parseCourse({ lessons })?.lessons).toHaveLength(MAX_LESSONS);
  });

  it("returns null rather than an empty course, so continue always has something to teach", () => {
    expect(parseCourse({ lessons: [] })).toBeNull();
    expect(parseCourse({ lessons: [{ title: "" }] })).toBeNull();
  });

  it("returns null for anything that is not a course", () => {
    expect(parseCourse(null)).toBeNull();
    expect(parseCourse(undefined)).toBeNull();
    expect(parseCourse("lessons")).toBeNull();
    expect(parseCourse({ lessons: "not an array" })).toBeNull();
    expect(parseCourse({})).toBeNull();
  });

  it("trims whitespace the model leaves behind", () => {
    const parsed = parseCourse({ lessons: [{ title: "  Padded  ", objectives: ["  spaced  "] }] });
    expect(parsed?.lessons[0]).toEqual({ title: "Padded", objectives: ["spaced"] });
  });
});

describe("lessonAt", () => {
  it("returns the lesson at a position", () => {
    expect(lessonAt(COURSE, 0)?.title).toBe("What a fraction is");
    expect(lessonAt(COURSE, 2)?.title).toBe("Adding fractions");
  });

  it("returns null past the end, which is how a finished course is detected", () => {
    expect(lessonAt(COURSE, 3)).toBeNull();
    expect(lessonAt(COURSE, 99)).toBeNull();
  });

  it("returns null for a negative position or a missing course", () => {
    expect(lessonAt(COURSE, -1)).toBeNull();
    expect(lessonAt(null, 0)).toBeNull();
  });
});

describe("isComplete", () => {
  it("is false while lessons remain", () => {
    expect(isComplete(COURSE, 0)).toBe(false);
    expect(isComplete(COURSE, 2)).toBe(false);
  });

  it("is true once the last lesson has been taught", () => {
    expect(isComplete(COURSE, 3)).toBe(true);
    expect(isComplete(COURSE, 4)).toBe(true);
  });

  it("is false with no course at all, rather than claiming a class nobody took is done", () => {
    expect(isComplete(null, 0)).toBe(false);
  });
});

describe("percentComplete", () => {
  it("runs from 0 to 100", () => {
    expect(percentComplete(COURSE, 0)).toBe(0);
    expect(percentComplete(COURSE, 3)).toBe(100);
  });

  it("rounds to whole percent", () => {
    expect(percentComplete(COURSE, 1)).toBe(33);
    expect(percentComplete(COURSE, 2)).toBe(67);
  });

  it("never exceeds 100 or drops below 0", () => {
    expect(percentComplete(COURSE, 99)).toBe(100);
    expect(percentComplete(COURSE, -5)).toBe(0);
  });

  it("is 0 rather than NaN with no course", () => {
    expect(percentComplete(null, 3)).toBe(0);
    expect(percentComplete({ lessons: [] }, 0)).toBe(0);
  });
});

describe("courseFromSchemeWeeks", () => {
  it("uses the school's own weeks in week order", () => {
    const course = courseFromSchemeWeeks([
      { weekNumber: 2, topic: "Second", objectives: ["b"] },
      { weekNumber: 1, topic: "First", objectives: ["a"] },
    ]);
    expect(course?.lessons.map((l) => l.title)).toEqual(["First", "Second"]);
  });

  it("does not mutate the caller's array while sorting", () => {
    const weeks = [{ weekNumber: 2, topic: "Second" }, { weekNumber: 1, topic: "First" }];
    courseFromSchemeWeeks(weeks);
    expect(weeks[0].topic).toBe("Second");
  });

  it("skips weeks with no topic", () => {
    const course = courseFromSchemeWeeks([{ weekNumber: 1, topic: "  " }, { weekNumber: 2, topic: "Real" }]);
    expect(course?.lessons).toHaveLength(1);
  });

  it("returns null when the scheme has nothing usable, so the caller can generate instead", () => {
    expect(courseFromSchemeWeeks([])).toBeNull();
    expect(courseFromSchemeWeeks(undefined)).toBeNull();
    expect(courseFromSchemeWeeks([{ weekNumber: 1 }])).toBeNull();
  });

  it("caps a very long scheme of work", () => {
    const weeks = Array.from({ length: 40 }, (_, i) => ({ weekNumber: i + 1, topic: `Week ${i + 1}` }));
    expect(courseFromSchemeWeeks(weeks)?.lessons).toHaveLength(MAX_LESSONS);
  });
});
