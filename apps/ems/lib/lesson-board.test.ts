import { tokenise, wordAt } from "@/components/lesson-board";

/**
 * The read-aloud highlight is driven by `charIndex` offsets the speech
 * synthesiser reports against the original string. If the split loses or
 * shifts a single character the highlight drifts further out of step with
 * every word — and a child following it to keep their place is worse off
 * than with no highlight at all.
 */
describe("tokenise", () => {
  it("keeps every character, so offsets stay true", () => {
    const text = "Two thirds  of\nthe class.";
    expect(tokenise(text).map((token) => token.text).join("")).toBe(text);
  });

  it("reports the offset of each word in the original string", () => {
    const text = "A parallelogram has parallel sides";
    for (const token of tokenise(text)) {
      expect(text.slice(token.start, token.start + token.text.length)).toBe(token.text);
    }
  });

  it("marks whitespace as not a word, so the highlight never lands on a gap", () => {
    const tokens = tokenise("base and height");
    expect(tokens.filter((token) => token.isWord).map((token) => token.text)).toEqual([
      "base",
      "and",
      "height",
    ]);
  });

  it("handles runs of spaces, newlines and tabs as one gap each", () => {
    const tokens = tokenise("one \n\t two");
    expect(tokens.map((token) => token.text)).toEqual(["one", " \n\t ", "two"]);
  });

  it("handles leading and trailing whitespace", () => {
    expect(tokenise("  hi  ").map((token) => token.text)).toEqual(["  ", "hi", "  "]);
  });

  it("handles an empty string and a single word", () => {
    expect(tokenise("")).toEqual([]);
    expect(tokenise("hello").map((token) => token.text)).toEqual(["hello"]);
  });
});

describe("wordAt", () => {
  const text = "The base is 8 cm";
  const tokens = tokenise(text);
  const wordSpokenAt = (offset: number) => tokens[wordAt(tokens, offset)]?.text;

  it("finds the word containing an offset", () => {
    expect(wordSpokenAt(text.indexOf("base"))).toBe("base");
    expect(wordSpokenAt(text.indexOf("cm"))).toBe("cm");
  });

  it("finds the word an offset falls inside, not only its first character", () => {
    // Chrome reports the start of a word; other engines are less exact.
    expect(wordSpokenAt(text.indexOf("base") + 2)).toBe("base");
  });

  it("stays on the previous word when the offset lands in a gap", () => {
    // Better than jumping ahead to a word that has not been spoken yet.
    expect(wordSpokenAt(text.indexOf(" ", text.indexOf("base")))).toBe("base");
  });

  it("returns -1 before the first word rather than highlighting something", () => {
    expect(wordAt(tokenise("  hi"), 0)).toBe(-1);
  });

  it("clamps to the last word for an offset past the end", () => {
    expect(wordSpokenAt(9999)).toBe("cm");
  });
});
