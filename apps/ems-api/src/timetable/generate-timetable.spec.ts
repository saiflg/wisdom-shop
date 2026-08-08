import {
  findGenerationClashes,
  generateTimetable,
  type AssignmentInput,
  type Slot,
} from "./generate-timetable";

const WEEKDAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] as const;

/** A week of `periodsPerDay` teaching slots across Monday to Friday. */
function week(periodsPerDay: number): Slot[] {
  const slots: Slot[] = [];
  for (const weekday of WEEKDAYS) {
    for (let index = 1; index <= periodsPerDay; index += 1) {
      slots.push({ weekday, periodId: `p${index}` });
    }
  }
  return slots;
}

const assignment = (over: Partial<AssignmentInput> & { id: string }): AssignmentInput => ({
  classId: "class-a",
  subjectId: "maths",
  teacherUserId: "teacher-1",
  periodsPerWeek: 1,
  ...over,
});

describe("generateTimetable", () => {
  it("places a simple week completely", () => {
    const result = generateTimetable(
      [
        assignment({ id: "a1", subjectId: "maths", periodsPerWeek: 4 }),
        assignment({ id: "a2", subjectId: "english", teacherUserId: "teacher-2", periodsPerWeek: 3 }),
      ],
      week(6),
    );

    expect(result.unplaced).toEqual([]);
    expect(result.placed).toHaveLength(7);
  });

  it("NEVER double-books a teacher", () => {
    // The invariant the whole feature rests on. One teacher across three
    // classes, all wanting a full load.
    const result = generateTimetable(
      [
        assignment({ id: "a1", classId: "class-a", periodsPerWeek: 5 }),
        assignment({ id: "a2", classId: "class-b", periodsPerWeek: 5 }),
        assignment({ id: "a3", classId: "class-c", periodsPerWeek: 5 }),
      ],
      week(6),
    );

    expect(findGenerationClashes(result.placed)).toEqual([]);
  });

  it("NEVER double-books a class", () => {
    const result = generateTimetable(
      [
        assignment({ id: "a1", subjectId: "maths", teacherUserId: "t1", periodsPerWeek: 6 }),
        assignment({ id: "a2", subjectId: "english", teacherUserId: "t2", periodsPerWeek: 6 }),
        assignment({ id: "a3", subjectId: "science", teacherUserId: "t3", periodsPerWeek: 6 }),
      ],
      week(6),
    );

    expect(findGenerationClashes(result.placed)).toEqual([]);
  });

  it("holds both invariants across many shapes of school", () => {
    // Property-style sweep rather than one lucky arrangement.
    for (const periodsPerDay of [3, 5, 8]) {
      for (const classCount of [1, 3, 6]) {
        for (const teacherCount of [1, 2, 5]) {
          const assignments: AssignmentInput[] = [];
          for (let c = 0; c < classCount; c += 1) {
            for (let s = 0; s < 4; s += 1) {
              assignments.push({
                id: `c${c}-s${s}`,
                classId: `class-${c}`,
                subjectId: `subject-${s}`,
                teacherUserId: `teacher-${s % teacherCount}`,
                periodsPerWeek: 3,
              });
            }
          }
          const result = generateTimetable(assignments, week(periodsPerDay));
          expect(findGenerationClashes(result.placed)).toEqual([]);
        }
      }
    }
  });

  it("reports what it could not place rather than quietly dropping it", () => {
    // A week that silently loses two of Maths' four periods looks finished
    // and is not.
    const result = generateTimetable(
      [assignment({ id: "a1", periodsPerWeek: 20 })],
      week(2), // only 10 slots exist
    );

    expect(result.placed).toHaveLength(10);
    expect(result.unplaced).toHaveLength(1);
    expect(result.unplaced[0]?.shortfall).toBe(10);
  });

  it("accounts for every requested period, placed or reported", () => {
    // Nothing may vanish: placed + shortfall must equal what was asked for.
    const assignments = [
      assignment({ id: "a1", classId: "class-a", periodsPerWeek: 7 }),
      assignment({ id: "a2", classId: "class-b", periodsPerWeek: 9 }),
      assignment({ id: "a3", classId: "class-c", subjectId: "art", teacherUserId: null, periodsPerWeek: 4 }),
    ];
    const result = generateTimetable(assignments, week(4));

    for (const input of assignments) {
      const placed = result.placed.filter((lesson) => lesson.assignmentId === input.id).length;
      const missing = result.unplaced.find((u) => u.assignmentId === input.id)?.shortfall ?? 0;
      expect(placed + missing).toBe(input.periodsPerWeek);
    }
  });

  it("explains a shortfall in terms a head teacher can act on", () => {
    const result = generateTimetable(
      [
        assignment({ id: "a1", classId: "class-a", periodsPerWeek: 10 }),
        assignment({ id: "a2", classId: "class-b", periodsPerWeek: 10 }),
      ],
      week(2),
    );
    expect(result.unplaced[0]?.reason).toMatch(/teaching in every period|no free periods|no period is free/i);
  });

  it("spreads a subject across different days before doubling up", () => {
    // Four periods of Maths should land on four days, not stack into one
    // afternoon.
    const result = generateTimetable([assignment({ id: "a1", periodsPerWeek: 4 })], week(6));
    const days = new Set(result.placed.map((lesson) => lesson.weekday));
    expect(days.size).toBe(4);
  });

  it("doubles up rather than leaving a period unplaced", () => {
    // Six periods across five days must put two on one day; a missing lesson
    // would be worse.
    const result = generateTimetable([assignment({ id: "a1", periodsPerWeek: 6 })], week(3));
    expect(result.unplaced).toEqual([]);
    expect(result.placed).toHaveLength(6);
  });

  it("places unstaffed assignments, which cannot clash with anyone", () => {
    // A school records what must be taught before it knows who will teach it.
    const result = generateTimetable(
      [
        assignment({ id: "a1", classId: "class-a", teacherUserId: null, periodsPerWeek: 3 }),
        assignment({ id: "a2", classId: "class-b", teacherUserId: null, periodsPerWeek: 3 }),
      ],
      week(4),
    );
    expect(result.unplaced).toEqual([]);
    expect(findGenerationClashes(result.placed)).toEqual([]);
  });

  it("is deterministic, so regenerating does not reshuffle the week", () => {
    // A school that has worked around one awkward slot should not find the
    // whole week rearranged after an unrelated edit.
    const assignments = [
      assignment({ id: "a1", classId: "class-a", periodsPerWeek: 4 }),
      assignment({ id: "a2", classId: "class-b", teacherUserId: "teacher-2", periodsPerWeek: 3 }),
    ];
    const first = generateTimetable(assignments, week(5));
    const second = generateTimetable(assignments, week(5));
    expect(second.placed).toEqual(first.placed);
  });

  it("does not depend on the order assignments arrive in", () => {
    const assignments = [
      assignment({ id: "a1", classId: "class-a", periodsPerWeek: 4 }),
      assignment({ id: "a2", classId: "class-b", teacherUserId: "teacher-2", periodsPerWeek: 3 }),
      assignment({ id: "a3", classId: "class-c", teacherUserId: "teacher-3", periodsPerWeek: 2 }),
    ];
    const forwards = generateTimetable(assignments, week(5));
    const backwards = generateTimetable([...assignments].reverse(), week(5));
    expect(backwards.placed).toEqual(forwards.placed);
  });

  it("handles a school with no periods set up yet", () => {
    const result = generateTimetable([assignment({ id: "a1", periodsPerWeek: 3 })], []);
    expect(result.placed).toEqual([]);
    expect(result.unplaced[0]?.reason).toMatch(/no teaching periods/i);
  });

  it("handles nothing to schedule", () => {
    expect(generateTimetable([], week(5))).toEqual({ placed: [], unplaced: [] });
  });
});

describe("findGenerationClashes", () => {
  it("finds a class double-booked", () => {
    const clashes = findGenerationClashes([
      { assignmentId: "a", classId: "c1", subjectId: "s1", teacherUserId: "t1", weekday: "MONDAY", periodId: "p1" },
      { assignmentId: "b", classId: "c1", subjectId: "s2", teacherUserId: "t2", weekday: "MONDAY", periodId: "p1" },
    ]);
    expect(clashes[0]).toMatch(/class c1 is double-booked/i);
  });

  it("finds a teacher double-booked", () => {
    const clashes = findGenerationClashes([
      { assignmentId: "a", classId: "c1", subjectId: "s1", teacherUserId: "t1", weekday: "MONDAY", periodId: "p1" },
      { assignmentId: "b", classId: "c2", subjectId: "s1", teacherUserId: "t1", weekday: "MONDAY", periodId: "p1" },
    ]);
    expect(clashes[0]).toMatch(/teacher t1 is double-booked/i);
  });

  it("does not treat two unstaffed lessons as a teacher clash", () => {
    const clashes = findGenerationClashes([
      { assignmentId: "a", classId: "c1", subjectId: "s1", teacherUserId: null, weekday: "MONDAY", periodId: "p1" },
      { assignmentId: "b", classId: "c2", subjectId: "s1", teacherUserId: null, weekday: "MONDAY", periodId: "p1" },
    ]);
    expect(clashes).toEqual([]);
  });

  it("passes a sound week", () => {
    expect(
      findGenerationClashes([
        { assignmentId: "a", classId: "c1", subjectId: "s1", teacherUserId: "t1", weekday: "MONDAY", periodId: "p1" },
        { assignmentId: "b", classId: "c1", subjectId: "s2", teacherUserId: "t1", weekday: "MONDAY", periodId: "p2" },
      ]),
    ).toEqual([]);
  });
});
