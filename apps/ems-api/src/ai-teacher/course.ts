/**
 * The course an AUTO class works through, and where the student is in it.
 *
 * Generated once when the class starts and then stored, rather than re-asked
 * each time: a student who comes back next week should find the course they
 * began, not a fresh one the model happened to invent that day. Pausing is
 * only meaningful if the thing you return to is the same thing you left.
 */

export interface CourseLesson {
  title: string;
  objectives: string[];
}

export interface Course {
  lessons: CourseLesson[];
}

/** Long enough for a term's topic, short enough to finish. */
export const MAX_LESSONS = 12;
export const MIN_LESSONS = 3;

/**
 * The shape the model is asked for, folded into the prompt as words by
 * `AiService.generateJson`.
 */
export const COURSE_RESPONSE_SCHEMA = {
  lessons: [{ title: "string", objectives: ["string"] }],
};

/**
 * Reads a course out of whatever the model returned.
 *
 * Total and forgiving in the ways that do not matter (extra keys, missing
 * objectives, non-string entries) and strict in the one that does: a course
 * with no usable lessons is `null`, so a class never starts in a state where
 * "continue" has nothing to teach.
 */
export function parseCourse(value: unknown): Course | null {
  const raw = (value as { lessons?: unknown })?.lessons;
  if (!Array.isArray(raw)) return null;

  const lessons: CourseLesson[] = [];
  for (const entry of raw) {
    const title = typeof (entry as CourseLesson)?.title === "string" ? (entry as CourseLesson).title.trim() : "";
    if (!title) continue;

    const objectives = Array.isArray((entry as CourseLesson).objectives)
      ? (entry as CourseLesson).objectives
          .filter((objective): objective is string => typeof objective === "string")
          .map((objective) => objective.trim())
          .filter(Boolean)
      : [];

    lessons.push({ title, objectives });
    if (lessons.length === MAX_LESSONS) break;
  }

  return lessons.length > 0 ? { lessons } : null;
}

export function lessonAt(course: Course | null, position: number): CourseLesson | null {
  if (!course || position < 0 || position >= course.lessons.length) return null;
  return course.lessons[position];
}

export function isComplete(course: Course | null, position: number): boolean {
  if (!course) return false;
  return position >= course.lessons.length;
}

/** Whole percent, so a progress bar never renders 99.7%. */
export function percentComplete(course: Course | null, position: number): number {
  if (!course || course.lessons.length === 0) return 0;
  const clamped = Math.max(0, Math.min(position, course.lessons.length));
  return Math.round((clamped / course.lessons.length) * 100);
}

/**
 * Turns a scheme of work's weeks into a course.
 *
 * When a class is anchored to a scheme of work there is nothing to generate:
 * the school already decided what is taught and in what order, and inventing
 * a parallel syllabus would quietly teach something else.
 */
export function courseFromSchemeWeeks(
  weeks: Array<{ weekNumber?: number; topic?: string; objectives?: string[] }> | undefined,
): Course | null {
  if (!Array.isArray(weeks)) return null;

  const lessons = [...weeks]
    .filter((week) => typeof week?.topic === "string" && week.topic.trim().length > 0)
    .sort((a, b) => (a.weekNumber ?? 0) - (b.weekNumber ?? 0))
    .slice(0, MAX_LESSONS)
    .map((week) => ({
      title: (week.topic as string).trim(),
      objectives: Array.isArray(week.objectives)
        ? week.objectives.filter((o): o is string => typeof o === "string").map((o) => o.trim()).filter(Boolean)
        : [],
    }));

  return lessons.length > 0 ? { lessons } : null;
}
