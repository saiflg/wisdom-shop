/**
 * Turns a school's curriculum plus a conversation so far into one prompt.
 *
 * Kept pure and separate from the service because this text is the whole
 * product: it is what makes the AI Teacher a *school's* tutor rather than a
 * general chatbot with a school logo on it. It is also where the rules that
 * protect a child live, so it deserves tests that read like requirements.
 */

import { accessibilitySection, type AccessibilityNeeds } from "./accessibility-prompt";

export interface TutorContext {
  subjectName: string;
  gradeLevel: string | null;
  topic: string;
  /** Objectives from the anchored scheme-of-work week, when the session has one. */
  objectives?: string[];
  country?: string | null;
  curriculumStandard?: string | null;
  /**
   * How this student is taught. Carries the accommodation only — never the
   * note saying why it is needed. See accessibility-prompt.ts.
   */
  accessibility?: AccessibilityNeeds | null;
}

export interface TranscriptTurn {
  role: "STUDENT" | "TUTOR";
  content: string;
}

export type { AccessibilityNeeds };

/**
 * How much of the conversation is replayed to the provider.
 *
 * Not unbounded: every replayed turn is billed again on every question, so a
 * long session would get quadratically expensive as well as eventually
 * overflowing the model's context.
 */
export const MAX_TRANSCRIPT_TURNS = 16;

/**
 * Keeps the conversation within budget while preserving the opening.
 *
 * The first turn is kept deliberately. It states what the student came to
 * learn, and dropping it is exactly how a tutor forty questions in ends up
 * cheerfully discussing something else entirely.
 */
export function trimTranscript(turns: TranscriptTurn[], max: number = MAX_TRANSCRIPT_TURNS): TranscriptTurn[] {
  if (max <= 0) return [];
  if (turns.length <= max) return [...turns];
  if (max === 1) return [turns[0]];

  return [turns[0], ...turns.slice(-(max - 1))];
}

function describeLearner(context: TutorContext): string {
  const grade = context.gradeLevel?.trim();
  return grade ? `a ${grade} student` : "a school student";
}

export function buildTutorPrompt(
  context: TutorContext,
  transcript: TranscriptTurn[],
  question: string,
): string {
  const lines: string[] = [];

  lines.push(
    `You are a patient, encouraging teacher helping ${describeLearner(context)} with ${context.subjectName}.`,
  );

  const standard = context.curriculumStandard?.trim();
  const country = context.country?.trim();
  if (standard && country) lines.push(`Follow the ${standard} curriculum as taught in ${country}.`);
  else if (standard) lines.push(`Follow the ${standard} curriculum.`);
  else if (country) lines.push(`Follow the curriculum as taught in ${country}.`);

  lines.push(`Today's topic: ${context.topic.trim()}`);

  const objectives = (context.objectives ?? []).map((o) => o.trim()).filter(Boolean);
  if (objectives.length > 0) {
    lines.push("The class is working towards these objectives:");
    for (const objective of objectives) lines.push(`- ${objective}`);
  }

  lines.push("");
  lines.push("How to teach:");
  lines.push("- Explain in small steps, in plain language, and check understanding as you go.");
  lines.push("- Use examples a student this age would recognise.");
  lines.push(
    "- If the student asks for an answer to homework or a test, guide them to work it out themselves instead of handing it over.",
  );
  lines.push("- End with one short question that checks whether the explanation landed.");
  lines.push("- Keep each reply short enough to read on a phone.");
  lines.push("");
  lines.push("Rules you must not break:");
  lines.push(
    `- Stay on ${context.subjectName}. If asked about something unrelated, say kindly that this is a ${context.subjectName} lesson and offer to come back to the topic.`,
  );
  lines.push(
    "- Never ask for or repeat personal details: full name, address, phone number, email, passwords, or anything about the student's family.",
  );
  lines.push(
    "- If the student says anything suggesting they are unsafe, being hurt, or in distress, do not counsel them: tell them warmly to speak to their teacher or another trusted adult straight away, and say nothing else on the subject.",
  );
  lines.push("- Never claim to be a human being.");

  const accessibility = accessibilitySection(context.accessibility);
  if (accessibility) lines.push(accessibility);

  const trimmed = trimTranscript(transcript);
  if (trimmed.length > 0) {
    lines.push("");
    lines.push("The lesson so far:");
    for (const turn of trimmed) {
      lines.push(`${turn.role === "STUDENT" ? "Student" : "Teacher"}: ${turn.content}`);
    }
  }

  lines.push("");
  lines.push(`The student now asks: ${question.trim()}`);
  lines.push("");
  lines.push("Reply as the teacher, in prose. Do not prefix your reply with a name or label.");
  lines.push(DIAGRAM_INSTRUCTION);

  return lines.join("\n");
}

/**
 * What the tutor may draw.
 *
 * Deliberately a narrow subset, matching sanitize-svg.ts exactly: anything
 * outside it is thrown away on arrival, so asking for it would only waste a
 * diagram. Stated as "if it helps" because a picture of a definition is
 * clutter, and a model told to always draw will always draw.
 */
export const DIAGRAM_INSTRUCTION = [
  "",
  "Draw a picture for this reply, after the text, as inline SVG. A diagram is the",
  "default, not the exception: a student following a lesson on a screen learns more",
  "from seeing a thing than from reading about it, and almost anything can be drawn —",
  "a shape, a number line, a bar split into parts, two columns compared, a labelled",
  "example, the steps of a method laid out in order.",
  "",
  "Leave it out only when there is genuinely nothing to show — a one-line answer of",
  "'yes, that is right', or a reply that is purely a question back to the student.",
  "Never draw a picture of a definition, and never repeat the same diagram you drew",
  "in the previous turn; draw the next idea instead.",
  "",
  "It must be a single <svg> element with a viewBox, using only these elements:",
  "svg, g, title, desc, path, rect, circle, ellipse, line, polyline, polygon, text, tspan.",
  "Give it a <title> and a <desc> so a student who cannot see it still gets the picture.",
  "",
  // Every line below names something that silently binned a whole diagram
  // before anyone knew it was happening. The sanitiser drops the entire
  // document on any one of them, so a single stray comment costs the picture.
  "These will cause the diagram to be discarded, so do not use them:",
  "- XML or HTML comments of any kind (<!-- ... -->).",
  "- id or class attributes, <defs>, <marker>, or anything referring to another element.",
  "  For an arrowhead, draw a small <polygon> at the end of the line instead.",
  "- script, style, image, use, href, xlink, animation, gradients, or CSS.",
  "- entities such as &#8212; — write the character itself, or a plain word.",
  "Keep it simple and label it clearly: a number line, a bar split into parts, a labelled shape.",
].join("\n");

/**
 * Asks for the syllabus of an automatic class.
 *
 * Generated once, at the start. The model is asked for a sequence a student
 * can actually finish, because a forty-lesson course that nobody completes
 * teaches less than a six-lesson one they do.
 */
export function buildCoursePrompt(context: TutorContext, lessonCount: { min: number; max: number }): string {
  const lines: string[] = [];

  lines.push(
    `Plan a short course teaching ${describeLearner(context)} about "${context.topic.trim()}" in ${context.subjectName}.`,
  );

  const standard = context.curriculumStandard?.trim();
  const country = context.country?.trim();
  if (standard) lines.push(`Follow the ${standard} curriculum${country ? ` as taught in ${country}` : ""}.`);
  else if (country) lines.push(`Follow the curriculum as taught in ${country}.`);

  const objectives = (context.objectives ?? []).map((o) => o.trim()).filter(Boolean);
  if (objectives.length > 0) {
    lines.push("It must cover these objectives:");
    for (const objective of objectives) lines.push(`- ${objective}`);
  }

  lines.push("");
  lines.push(
    `Give between ${lessonCount.min} and ${lessonCount.max} lessons, in the order they should be taught, each building on the one before.`,
  );
  lines.push("Each lesson needs a short title and one to three objectives written in plain language.");
  lines.push("Cover the whole topic across the course rather than repeating the same ground.");

  return lines.join("\n");
}

/**
 * Teaches one lesson of the course.
 *
 * The transcript is replayed so the class carries on rather than restarting
 * — which is the whole promise of being able to pause and come back.
 */
export function buildLessonPrompt(
  context: TutorContext,
  course: { title: string; objectives: string[] },
  progress: { index: number; total: number },
  transcript: TranscriptTurn[],
): string {
  const lines: string[] = [];

  lines.push(
    `You are teaching ${describeLearner(context)} a course on "${context.topic.trim()}" in ${context.subjectName}.`,
  );
  lines.push(`This is lesson ${progress.index + 1} of ${progress.total}: ${course.title}`);

  const objectives = course.objectives.map((o) => o.trim()).filter(Boolean);
  if (objectives.length > 0) {
    lines.push("By the end of this lesson the student should be able to:");
    for (const objective of objectives) lines.push(`- ${objective}`);
  }

  lines.push("");
  lines.push("How to teach this lesson:");
  lines.push("- Teach it in one go: explain the idea, show a worked example, then check understanding.");
  lines.push("- Assume the earlier lessons in this course have been taught; build on them, do not repeat them.");
  lines.push("- Keep it to a few short paragraphs — a student is reading this on a phone.");
  lines.push("- End by inviting a question, and say they can pause and come back whenever they like.");
  lines.push(
    progress.index + 1 === progress.total
      ? "- This is the last lesson: finish by summing up what the whole course covered."
      : "- Do not summarise the whole course; there are more lessons to come.",
  );

  lines.push("");
  lines.push("Rules you must not break:");
  lines.push(`- Stay on ${context.subjectName}.`);
  lines.push(
    "- Never ask for or repeat personal details: full name, address, phone number, email, passwords, or anything about the student's family.",
  );
  lines.push(
    "- If the student says anything suggesting they are unsafe, being hurt, or in distress, do not counsel them: tell them warmly to speak to their teacher or another trusted adult straight away, and say nothing else on the subject.",
  );
  lines.push("- Never claim to be a human being.");

  const accessibility = accessibilitySection(context.accessibility);
  if (accessibility) lines.push(accessibility);

  const trimmed = trimTranscript(transcript);
  if (trimmed.length > 0) {
    lines.push("");
    lines.push("The class so far:");
    for (const turn of trimmed) {
      lines.push(`${turn.role === "STUDENT" ? "Student" : "Teacher"}: ${turn.content}`);
    }
  }

  lines.push("");
  lines.push("Teach the lesson now, in prose. Do not prefix your reply with a name or label.");
  lines.push(DIAGRAM_INSTRUCTION);

  return lines.join("\n");
}
