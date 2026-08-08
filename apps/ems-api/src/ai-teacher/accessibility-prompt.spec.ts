import { accessibilityInstructions, accessibilitySection, type AccessibilityNeeds } from "./accessibility-prompt";

const NONE: AccessibilityNeeds = { readingSupport: "NONE", describeVisuals: false };

describe("accessibilityInstructions", () => {
  it("adds nothing for a student with no particular need", () => {
    // Every line is sent and paid for on every request.
    expect(accessibilityInstructions(NONE)).toEqual([]);
    expect(accessibilityInstructions(null)).toEqual([]);
    expect(accessibilityInstructions(undefined)).toEqual([]);
  });

  it("asks for short sentences and defined terms when reading support is simplified", () => {
    const lines = accessibilityInstructions({ ...NONE, readingSupport: "SIMPLIFIED" }).join("\n");
    expect(lines).toMatch(/short sentences/i);
    expect(lines).toMatch(/everyday words/i);
    expect(lines).toMatch(/define/i);
  });

  it("asks for one checked step at a time when the student needs it", () => {
    const lines = accessibilityInstructions({ ...NONE, readingSupport: "STEP_BY_STEP" }).join("\n");
    expect(lines).toMatch(/one small step at a time/i);
    expect(lines).toMatch(/checked/i);
    expect(lines).toMatch(/number the steps/i);
  });

  it("does not stack both reading styles, which would contradict each other", () => {
    const stepwise = accessibilityInstructions({ ...NONE, readingSupport: "STEP_BY_STEP" }).join("\n");
    expect(stepwise).not.toMatch(/one idea per sentence/i);
  });

  it("asks for visuals to be described in words when a student needs that", () => {
    const lines = accessibilityInstructions({ ...NONE, describeVisuals: true }).join("\n");
    expect(lines).toMatch(/Describe anything visual in words/i);
    expect(lines).toMatch(/<title>/);
    expect(lines).toMatch(/<desc>/);
    // Colour-only meaning fails a colour-blind student as well as a blind one.
    expect(lines).toMatch(/Never rely on colour/i);
  });

  it("combines reading support with visual description", () => {
    const lines = accessibilityInstructions({ readingSupport: "SIMPLIFIED", describeVisuals: true });
    expect(lines.join("\n")).toMatch(/short sentences/i);
    expect(lines.join("\n")).toMatch(/Describe anything visual/i);
  });

  // The reason this file has tests at all.
  it("never discloses the note recording why the student needs this", () => {
    const needs: AccessibilityNeeds = {
      readingSupport: "SIMPLIFIED",
      describeVisuals: true,
      notes: "Diagnosed dyslexic in 2024; registered blind; uses JAWS at home",
    };

    const text = accessibilityInstructions(needs).join("\n");
    expect(text).not.toMatch(/dyslex/i);
    expect(text).not.toMatch(/blind/i);
    expect(text).not.toMatch(/JAWS/i);
    expect(text).not.toMatch(/diagnos/i);
    expect(text).not.toContain("2024");
  });

  it("never names a condition even in the section heading", () => {
    const section = accessibilitySection({
      readingSupport: "STEP_BY_STEP",
      describeVisuals: true,
      notes: "autistic, ADHD",
    });
    expect(section).not.toMatch(/autis/i);
    expect(section).not.toMatch(/ADHD/);
    expect(section).not.toMatch(/disab/i);
    expect(section).not.toMatch(/condition/i);
    expect(section).not.toMatch(/impair/i);
    // What it does say is about teaching, not about the child.
    expect(section).toContain("How this student learns best:");
  });
});

describe("accessibilitySection", () => {
  it("is empty when there is nothing to say", () => {
    expect(accessibilitySection(NONE)).toBe("");
    expect(accessibilitySection(null)).toBe("");
  });

  it("renders as a bulleted section a prompt can paste in", () => {
    const section = accessibilitySection({ ...NONE, readingSupport: "SIMPLIFIED" });
    expect(section.startsWith("\n")).toBe(true);
    expect(section).toContain("How this student learns best:");
    expect(section).toMatch(/^- /m);
  });
});
