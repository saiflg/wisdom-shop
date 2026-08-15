import { pickVoice, speakableText, TEACHING_RATE } from "./use-lesson-voice";

const voice = (name: string, lang = "en-GB") => ({ name, lang }) as SpeechSynthesisVoice;

describe("speakableText", () => {
  it("does not read markdown punctuation aloud", () => {
    // Spoken literally this becomes "star star countable star star", which is
    // worse than no narration at all.
    expect(speakableText("A **countable** noun")).toBe("A countable noun");
    expect(speakableText("## Lesson 4")).toBe("Lesson 4");
    expect(speakableText("*emphasis* here")).toBe("emphasis here");
  });

  it("turns list markers into a pause rather than a symbol", () => {
    expect(speakableText("- one\n- two")).toBe(", one , two");
    expect(speakableText("1. first\n2. second")).toBe(", first , second");
  });

  it("reads a link's words and not its address", () => {
    expect(speakableText("See [the guide](https://example.com/x)")).toBe("See the guide");
  });

  it("drops code blocks and images entirely", () => {
    expect(speakableText("before\n```js\nconst x = 1;\n```\nafter")).toBe("before after");
    expect(speakableText("look ![a diagram](/img.png) here")).toBe("look here");
  });

  it("collapses whitespace so the voice does not pause oddly", () => {
    expect(speakableText("a\n\n\n   b")).toBe("a b");
  });

  it("returns empty for content that is only markup", () => {
    // The caller uses this to decide whether to speak at all.
    expect(speakableText("```\ncode\n```")).toBe("");
    expect(speakableText("   ")).toBe("");
  });
});

describe("pickVoice", () => {
  it("returns null when the browser offers nothing", () => {
    expect(pickVoice([])).toBeNull();
  });

  it("prefers a named natural female voice over anything else", () => {
    const chosen = pickVoice([voice("Microsoft David - English (United States)"), voice("Google UK English Female")]);
    expect(chosen?.name).toBe("Google UK English Female");
  });

  it("respects the preference order between two good voices", () => {
    const chosen = pickVoice([voice("Samantha"), voice("Google UK English Female")]);
    expect(chosen?.name).toBe("Google UK English Female");
  });

  it("falls back to any English voice that sounds feminine", () => {
    const chosen = pickVoice([voice("Daniel"), voice("Fiona")]);
    expect(chosen?.name).toBe("Fiona");
  });

  it("prefers an English voice over a non-English one", () => {
    const chosen = pickVoice([voice("Amélie", "fr-FR"), voice("Daniel", "en-GB")]);
    expect(chosen?.name).toBe("Daniel");
  });

  it("still returns something rather than nothing when no voice matches", () => {
    // A lesson read in the wrong voice beats a lesson read in no voice.
    const chosen = pickVoice([voice("Yuri", "ru-RU")]);
    expect(chosen?.name).toBe("Yuri");
  });
});

describe("TEACHING_RATE", () => {
  it("is slower than the browser default", () => {
    // The brief was unhurried. A teacher explaining something new does not
    // gabble, and 1.0 is noticeably brisk for a child.
    expect(TEACHING_RATE).toBeLessThan(1);
    // But not so slow it sounds broken.
    expect(TEACHING_RATE).toBeGreaterThan(0.6);
  });
});
