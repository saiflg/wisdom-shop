/**
 * Makes a model-written diagram safe to render in a student's browser.
 *
 * This is untrusted input. The model is told to produce a small subset of
 * SVG, but "was told to" is not a security control: a prompt-injected page,
 * a compromised provider, or simply a creative model can emit a `<script>`,
 * an `onload=`, or a `<foreignObject>` full of HTML, and the result would run
 * inside a child's session on the school's origin.
 *
 * Two deliberate choices:
 *
 * 1. **Allowlist, not blocklist.** Anything not explicitly permitted is
 *    grounds for rejection. Blocklists lose to encodings, namespaces and
 *    constructs nobody thought of.
 * 2. **Fails closed, whole document.** A diagram that trips any rule is
 *    dropped entirely rather than cleaned up and kept — same rule as the
 *    messaging templates. A missing diagram costs a student nothing; a
 *    half-sanitised one that still runs costs everything. The lesson text is
 *    unaffected either way.
 */

/** Enough for a detailed diagram, small enough that nothing pathological is stored. */
const MAX_LENGTH = 20_000;

/**
 * Shapes and text only. No `image`, `use`, `a`, `foreignObject`, `script`,
 * `style`, or gradients: each either fetches something, references something,
 * or executes something, and none of them are needed to draw a number line.
 */
const ALLOWED_ELEMENTS = new Set([
  "svg",
  "g",
  "title",
  "desc",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
]);

/**
 * Geometry and presentation only.
 *
 * No `href`/`xlink:href` (fetches), no `style` or `class` (CSS is its own
 * attack surface and needs no allowance here), no `id` (nothing may be
 * referenced), and no `on*` — which is covered anyway by not being listed.
 */
const ALLOWED_ATTRIBUTES = new Set([
  "xmlns",
  "viewbox",
  "width",
  "height",
  "x",
  "y",
  "dx",
  "dy",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "d",
  "points",
  "fill",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "font-size",
  "font-family",
  "font-weight",
  "text-anchor",
  "dominant-baseline",
  "opacity",
  "fill-opacity",
  "stroke-opacity",
  "transform",
]);

/**
 * Constructs that are never acceptable anywhere in the document, checked
 * before parsing so that a malformed document cannot slip past the tokeniser.
 *
 * `&#` is here because a numeric entity is how `javascript&#58;` becomes
 * `javascript:` after the browser decodes it — the tokeniser sees neither.
 */
const FORBIDDEN_SUBSTRINGS = [
  "<script",
  "<style",
  "<foreignobject",
  "<iframe",
  "<image",
  "<use",
  "<animate",
  "<set",
  "<!",
  "<?",
  "javascript:",
  "data:",
  "url(",
  "expression(",
  "&#",
  "xlink:",
  "href",
];

/** Attribute values may describe geometry and colour, and nothing else. */
const FORBIDDEN_IN_VALUE = ["<", ">", "url(", "javascript:", "data:", "&#", "expression("];

const TAG = /<\s*\/?\s*([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)\/?\s*>/g;
const ATTRIBUTE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
/** A bare attribute with no value, which no allowed attribute has. */
const BARE_ATTRIBUTE = /(^|\s)([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?=\s|$)(?!\s*=)/;

/**
 * Returns the diagram if every element, attribute and value is permitted,
 * and `null` otherwise. Never returns modified markup: the input is either
 * safe as written or it is not stored.
 */
export function sanitizeSvg(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;

  const svg = input.trim();
  if (svg.length === 0 || svg.length > MAX_LENGTH) return null;

  const lower = svg.toLowerCase();
  if (!lower.startsWith("<svg") || !lower.endsWith("</svg>")) return null;
  // Without a viewBox the diagram cannot be scaled to a phone, and a fixed
  // enormous width is its own denial of readability.
  if (!lower.includes("viewbox")) return null;

  for (const forbidden of FORBIDDEN_SUBSTRINGS) {
    if (lower.includes(forbidden)) return null;
  }

  let match: RegExpExecArray | null;
  let sawRoot = false;
  TAG.lastIndex = 0;

  let consumed = 0;
  while ((match = TAG.exec(svg)) !== null) {
    const [tag, rawName, rawAttributes = ""] = match;
    const name = rawName.toLowerCase();

    if (!ALLOWED_ELEMENTS.has(name)) return null;
    if (name === "svg") sawRoot = true;

    // Text outside tags is inert once every tag is known-good, but a stray
    // "<" that failed to parse as a tag would be skipped silently here, so
    // account for every character.
    if (svg.slice(consumed, match.index).includes("<")) return null;
    consumed = match.index + tag.length;

    if (!checkAttributes(rawAttributes)) return null;
  }

  if (!sawRoot) return null;
  if (svg.slice(consumed).includes("<")) return null;

  return svg;
}

function checkAttributes(raw: string): boolean {
  const attributes = raw.trim();
  if (attributes.length === 0) return true;

  let matched = "";
  let match: RegExpExecArray | null;
  ATTRIBUTE.lastIndex = 0;

  while ((match = ATTRIBUTE.exec(attributes)) !== null) {
    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";

    if (!ALLOWED_ATTRIBUTES.has(name)) return false;

    const lowerValue = value.toLowerCase();
    for (const forbidden of FORBIDDEN_IN_VALUE) {
      if (lowerValue.includes(forbidden)) return false;
    }

    matched += match[0];
  }

  // Anything left over is an attribute the pattern above did not recognise —
  // a valueless flag, or something stranger. Either way, not understood is
  // not allowed.
  const leftover = attributes.replace(ATTRIBUTE, "").trim();
  if (leftover.length > 0 && BARE_ATTRIBUTE.test(leftover)) return false;
  if (leftover.replace(/[\s/]/g, "").length > 0) return false;

  return matched.length > 0 || attributes.replace(/[\s/]/g, "").length === 0;
}

/**
 * Pulls a diagram out of a model's reply.
 *
 * The tutor is asked for prose with an optional diagram appended, because
 * asking for JSON would put the lesson text through an escaping round trip
 * for no benefit. Anything that fails to sanitise is discarded and the prose
 * is kept — a lesson without a picture is still a lesson.
 */
export function splitReplyAndDiagram(reply: string): {
  text: string;
  diagram: string | null;
  diagramAlt: string | null;
} {
  const start = reply.search(/<svg[\s>]/i);
  if (start === -1) return { text: reply.trim(), diagram: null, diagramAlt: null };

  const endMarker = reply.toLowerCase().lastIndexOf("</svg>");
  if (endMarker === -1) return { text: reply.trim(), diagram: null, diagramAlt: null };

  const candidate = reply.slice(start, endMarker + "</svg>".length);
  const text = (reply.slice(0, start) + reply.slice(endMarker + "</svg>".length))
    // Models like to fence the diagram; the fences are left behind once the
    // diagram is lifted out.
    .replace(/```(?:svg|xml|html)?/gi, "")
    .trim();

  const diagram = sanitizeSvg(candidate);
  return { text, diagram, diagramAlt: diagram ? describeSvg(diagram) : null };
}

/**
 * The diagram's own words, for a student who cannot see it.
 *
 * SVG already has the right places for this — `<title>` is the short name and
 * `<desc>` the longer explanation — and both are on the sanitiser's allowlist
 * precisely so they survive. Pulled out into its own column rather than left
 * inside the markup because a screen reader's support for `<desc>` on inline
 * SVG is inconsistent, and because a diagram nobody can describe should be
 * visibly missing its description rather than quietly inaccessible.
 */
export function describeSvg(svg: string): string | null {
  const title = firstTagText(svg, "title");
  const description = firstTagText(svg, "desc");

  const combined = [title, description]
    .filter((part): part is string => Boolean(part))
    // A model that repeats the title as the description should not produce
    // "Fractions. Fractions."
    .filter((part, index, all) => all.indexOf(part) === index)
    .join(". ");

  return combined.length > 0 ? combined : null;
}

function firstTagText(svg: string, tag: "title" | "desc"): string | null {
  const match = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}\\s*>`, "i").exec(svg);
  const text = match?.[1]?.replace(/\s+/g, " ").trim();
  return text && text.length > 0 ? text.replace(/\.$/, "") : null;
}
