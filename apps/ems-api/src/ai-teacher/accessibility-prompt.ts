/**
 * Turns a student's accessibility profile into instructions for the tutor.
 *
 * The rule this file exists to enforce: **the profile changes how a lesson is
 * taught; it never says why.**
 *
 * A school may record that a student uses a screen reader, or has a reading
 * difficulty, or carries a diagnosis. That belongs in the school's own
 * database. What goes to a third-party AI provider is the accommodation on
 * its own — "use short sentences, define new terms" — with no hint of who
 * needs it or what condition prompted it. The provider learns how to teach;
 * it learns nothing about the child.
 *
 * This is not a nicety. Sending "this student is dyslexic" to an external API
 * is disclosing a child's health data to a processor nobody consented to, in
 * a request logged on someone else's infrastructure.
 */

export type ReadingSupport = "NONE" | "SIMPLIFIED" | "STEP_BY_STEP";

export interface AccessibilityNeeds {
  readingSupport: ReadingSupport;
  describeVisuals: boolean;
  /** Present on the record, deliberately unused here. See the file comment. */
  notes?: string | null;
}

const SIMPLIFIED = [
  "Write in short sentences, one idea per sentence.",
  "Use everyday words. When a subject word is unavoidable, define it the first time in a few plain words.",
  "Prefer a worked example over an abstract rule.",
];

const STEP_BY_STEP = [
  "Teach one small step at a time, and do not move on until you have checked the step landed.",
  "Number the steps so they are easy to follow and to come back to.",
  "Keep each step to two or three short sentences.",
  "Use everyday words, and define any subject word the first time you use it.",
];

const DESCRIBE_VISUALS = [
  "Describe anything visual in words as well: say what the picture shows and what it demonstrates, so the lesson makes sense without seeing it.",
  "If you draw a diagram, give it a <title> and a <desc> saying plainly what it shows.",
  "Never rely on colour, position or shape alone to make a point — say it in words too.",
];

/**
 * The instructions for these needs, or an empty array when there is nothing
 * to add.
 *
 * Returning nothing for a default profile matters: every line here is sent on
 * every request and paid for on every request, so a student with no
 * particular need should not be carrying instructions they do not need.
 */
export function accessibilityInstructions(needs: AccessibilityNeeds | null | undefined): string[] {
  if (!needs) return [];

  const lines: string[] = [];

  if (needs.readingSupport === "SIMPLIFIED") lines.push(...SIMPLIFIED);
  else if (needs.readingSupport === "STEP_BY_STEP") lines.push(...STEP_BY_STEP);

  if (needs.describeVisuals) lines.push(...DESCRIBE_VISUALS);

  return lines;
}

/**
 * The same instructions as a prompt section, or an empty string.
 *
 * Headed "How this student learns best" rather than anything clinical: the
 * model is being told how to teach, and a label would only invite it to
 * mention the label back to the child.
 */
export function accessibilitySection(needs: AccessibilityNeeds | null | undefined): string {
  const lines = accessibilityInstructions(needs);
  if (lines.length === 0) return "";

  return ["", "How this student learns best:", ...lines.map((line) => `- ${line}`)].join("\n");
}
