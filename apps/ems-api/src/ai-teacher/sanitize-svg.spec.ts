import { sanitizeSvg, splitReplyAndDiagram } from "./sanitize-svg";

const SAFE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40"><rect x="0" y="0" width="50" height="20" fill="#4f46e5"/><text x="10" y="35" font-size="8" fill="#111">1/2</text></svg>`;

describe("sanitizeSvg", () => {
  it("accepts a plain shapes-and-text diagram unchanged", () => {
    expect(sanitizeSvg(SAFE)).toBe(SAFE);
  });

  it("accepts the elements a teaching diagram actually needs", () => {
    const svg = `<svg viewBox="0 0 10 10"><g transform="translate(1,1)"><line x1="0" y1="0" x2="9" y2="0" stroke="black" stroke-width="0.2"/><circle cx="3" cy="0" r="0.4" fill="red"/><polyline points="0,0 2,2 4,0" fill="none" stroke="blue"/><polygon points="1,1 2,2 3,1"/><ellipse cx="5" cy="5" rx="2" ry="1"/><path d="M0 0 L5 5"/><text x="1" y="5"><tspan dy="1">x</tspan></text></g></svg>`;
    expect(sanitizeSvg(svg)).toBe(svg);
  });

  // Everything below is a way someone gets JavaScript into a child's session.
  it("rejects a script element", () => {
    expect(sanitizeSvg(`<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>`)).toBeNull();
  });

  it("rejects an event handler attribute", () => {
    expect(sanitizeSvg(`<svg viewBox="0 0 1 1"><rect onload="alert(1)" x="0"/></svg>`)).toBeNull();
    expect(sanitizeSvg(`<svg viewBox="0 0 1 1" onmouseover="alert(1)"></svg>`)).toBeNull();
  });

  it("rejects foreignObject, which smuggles arbitrary HTML in", () => {
    expect(
      sanitizeSvg(`<svg viewBox="0 0 1 1"><foreignObject><body xmlns="http://www.w3.org/1999/xhtml"/></foreignObject></svg>`),
    ).toBeNull();
  });

  it("rejects anything that fetches: image, use, href, xlink", () => {
    expect(sanitizeSvg(`<svg viewBox="0 0 1 1"><image href="http://evil/x.png"/></svg>`)).toBeNull();
    expect(sanitizeSvg(`<svg viewBox="0 0 1 1"><use xlink:href="#x"/></svg>`)).toBeNull();
    expect(sanitizeSvg(`<svg viewBox="0 0 1 1"><a href="http://evil">x</a></svg>`)).toBeNull();
  });

  it("rejects javascript: and data: URIs wherever they appear", () => {
    expect(sanitizeSvg(`<svg viewBox="0 0 1 1"><rect fill="javascript:alert(1)"/></svg>`)).toBeNull();
    expect(sanitizeSvg(`<svg viewBox="0 0 1 1"><rect fill="data:text/html,x"/></svg>`)).toBeNull();
  });

  it("rejects numeric entities, which decode to characters the parser never saw", () => {
    // javascript&#58;alert(1) becomes javascript:alert(1) in the browser.
    expect(sanitizeSvg(`<svg viewBox="0 0 1 1"><rect fill="javascript&#58;alert(1)"/></svg>`)).toBeNull();
  });

  it("rejects style elements, style attributes and url()", () => {
    expect(sanitizeSvg(`<svg viewBox="0 0 1 1"><style>*{x:y}</style></svg>`)).toBeNull();
    expect(sanitizeSvg(`<svg viewBox="0 0 1 1"><rect style="fill:red"/></svg>`)).toBeNull();
    expect(sanitizeSvg(`<svg viewBox="0 0 1 1"><rect fill="url(#g)"/></svg>`)).toBeNull();
  });

  it("rejects animation elements, which can retarget attributes at runtime", () => {
    expect(sanitizeSvg(`<svg viewBox="0 0 1 1"><animate attributeName="x" to="5"/></svg>`)).toBeNull();
    expect(sanitizeSvg(`<svg viewBox="0 0 1 1"><set attributeName="x" to="5"/></svg>`)).toBeNull();
  });

  it("rejects comments, CDATA and processing instructions", () => {
    expect(sanitizeSvg(`<svg viewBox="0 0 1 1"><!-- <script>alert(1)</script> --></svg>`)).toBeNull();
    expect(sanitizeSvg(`<svg viewBox="0 0 1 1"><![CDATA[<script>x</script>]]></svg>`)).toBeNull();
    expect(sanitizeSvg(`<?xml version="1.0"?><svg viewBox="0 0 1 1"></svg>`)).toBeNull();
  });

  it("rejects an unlisted element even when it looks harmless", () => {
    // Not "is this dangerous?" but "is this understood?".
    expect(sanitizeSvg(`<svg viewBox="0 0 1 1"><marker id="m"/></svg>`)).toBeNull();
    expect(sanitizeSvg(`<svg viewBox="0 0 1 1"><linearGradient/></svg>`)).toBeNull();
  });

  it("rejects an unlisted attribute", () => {
    expect(sanitizeSvg(`<svg viewBox="0 0 1 1"><rect id="target" x="0"/></svg>`)).toBeNull();
    expect(sanitizeSvg(`<svg viewBox="0 0 1 1"><rect class="thing" x="0"/></svg>`)).toBeNull();
  });

  it("is not fooled by case or spacing", () => {
    expect(sanitizeSvg(`<svg viewBox="0 0 1 1"><SCRIPT>alert(1)</SCRIPT></svg>`)).toBeNull();
    expect(sanitizeSvg(`<svg viewBox="0 0 1 1">< script >alert(1)</script></svg>`)).toBeNull();
    expect(sanitizeSvg(`<svg viewBox="0 0 1 1"><rect OnLoad="alert(1)"/></svg>`)).toBeNull();
  });

  it("requires a real svg root and a viewBox", () => {
    expect(sanitizeSvg(`<rect x="0"/>`)).toBeNull();
    expect(sanitizeSvg(`<div><svg viewBox="0 0 1 1"></svg></div>`)).toBeNull();
    // No viewBox means it cannot scale to a phone.
    expect(sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg"><rect x="0"/></svg>`)).toBeNull();
  });

  it("rejects a stray angle bracket that never parsed as a tag", () => {
    expect(sanitizeSvg(`<svg viewBox="0 0 1 1">2 < 3</svg>`)).toBeNull();
  });

  it("rejects empty, absent and oversized input", () => {
    expect(sanitizeSvg("")).toBeNull();
    expect(sanitizeSvg("   ")).toBeNull();
    expect(sanitizeSvg(null)).toBeNull();
    expect(sanitizeSvg(undefined)).toBeNull();
    expect(sanitizeSvg(123 as unknown as string)).toBeNull();
    expect(sanitizeSvg(`<svg viewBox="0 0 1 1">${"x".repeat(30000)}</svg>`)).toBeNull();
  });

  it("never returns partially cleaned markup", () => {
    // The contract is "safe as written, or nothing" — a caller must never
    // receive something that had a script removed and the rest kept.
    // Null, not "the safe half of it": a caller must never receive markup
    // that had a script removed and the rest kept.
    expect(sanitizeSvg(`<svg viewBox="0 0 1 1"><rect x="0"/><script>alert(1)</script></svg>`)).toBeNull();
  });
});

describe("splitReplyAndDiagram", () => {
  it("returns prose untouched when there is no diagram", () => {
    expect(splitReplyAndDiagram("A denominator is the number underneath.")).toEqual({
      text: "A denominator is the number underneath.",
      diagram: null,
    });
  });

  it("separates the lesson text from the diagram", () => {
    const result = splitReplyAndDiagram(`Here is a half.\n\n${SAFE}`);
    expect(result.text).toBe("Here is a half.");
    expect(result.diagram).toBe(SAFE);
  });

  it("keeps prose that follows the diagram", () => {
    const result = splitReplyAndDiagram(`Before.\n${SAFE}\nAfter.`);
    expect(result.text).toContain("Before.");
    expect(result.text).toContain("After.");
  });

  it("strips the code fences models wrap diagrams in", () => {
    const result = splitReplyAndDiagram("Look:\n```svg\n" + SAFE + "\n```");
    expect(result.text).toBe("Look:");
    expect(result.diagram).toBe(SAFE);
  });

  it("keeps the lesson and drops the diagram when the diagram is unsafe", () => {
    // The student still gets taught; they just do not get a picture.
    const result = splitReplyAndDiagram(
      `Here is a half.\n<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>`,
    );
    expect(result.text).toBe("Here is a half.");
    expect(result.diagram).toBeNull();
  });

  it("does not mistake an unterminated svg for a diagram", () => {
    const result = splitReplyAndDiagram("Here is a half. <svg viewBox=\"0 0 1 1\">");
    expect(result.diagram).toBeNull();
    expect(result.text).toContain("Here is a half.");
  });
});
