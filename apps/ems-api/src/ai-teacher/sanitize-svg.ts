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
 * The outcome of checking a diagram, with a reason when it was refused.
 *
 * The reason exists because "no diagram" had two indistinguishable causes —
 * the model drew nothing, or it drew something we dropped — and no way to
 * tell them apart. That is fine for safety and useless for improving the
 * prompt: a model that keeps adding `<!-- labels -->` or arrowhead markers
 * would fail silently forever, and every lesson would simply be missing its
 * picture with nobody any the wiser.
 *
 * The reason is for the log, never for the student.
 */
export type SvgCheck = { ok: true; svg: string } | { ok: false; reason: string };

/**
 * Returns the diagram if every element, attribute and value is permitted,
 * and says why not otherwise. Never returns modified markup: the input is
 * either safe as written or it is not stored.
 */
export function checkSvg(input: string | null | undefined): SvgCheck {
  if (typeof input !== "string") return { ok: false, reason: "not a string" };

  // Comments are stripped rather than treated as grounds for rejection.
  //
  // This is the one place the "never modify, only accept or reject" rule is
  // relaxed, and it is worth it: an `<!-- the base -->` label is the single
  // commonest thing a model puts in a diagram, it renders nothing, and it was
  // costing every picture in the lesson. Telling the model not to was tried
  // and it kept doing it anyway.
  //
  // Safe because stripping happens *before* validation, not after: anything a
  // comment was concealing — the classic `<!--<script>-->` — is revealed to
  // the allowlist rather than hidden from it, and rejected there. Removing
  // text can only ever expose more to the checks below, never less.
  const svg = stripComments(input).trim();
  if (svg.length === 0) return { ok: false, reason: "empty" };
  if (svg.length > MAX_LENGTH) return { ok: false, reason: `longer than ${MAX_LENGTH} characters` };

  const lower = svg.toLowerCase();
  if (!lower.startsWith("<svg") || !lower.endsWith("</svg>")) {
    return { ok: false, reason: "does not start with <svg and end with </svg>" };
  }
  // Without a viewBox the diagram cannot be scaled to a phone, and a fixed
  // enormous width is its own denial of readability.
  if (!lower.includes("viewbox")) return { ok: false, reason: "no viewBox" };

  for (const forbidden of FORBIDDEN_SUBSTRINGS) {
    if (lower.includes(forbidden)) {
      // Named, because "<!" is nearly always an ordinary SVG comment rather
      // than an attack, and that is worth knowing when reading the log.
      return { ok: false, reason: `contains forbidden "${forbidden}"` };
    }
  }

  let match: RegExpExecArray | null;
  let sawRoot = false;
  TAG.lastIndex = 0;

  let consumed = 0;
  while ((match = TAG.exec(svg)) !== null) {
    const [tag, rawName, rawAttributes = ""] = match;
    const name = rawName.toLowerCase();

    if (!ALLOWED_ELEMENTS.has(name)) return { ok: false, reason: `disallowed element <${name}>` };
    if (name === "svg") sawRoot = true;

    // Text outside tags is inert once every tag is known-good, but a stray
    // "<" that failed to parse as a tag would be skipped silently here, so
    // account for every character.
    if (svg.slice(consumed, match.index).includes("<")) {
      return { ok: false, reason: "a '<' that did not parse as a tag" };
    }
    consumed = match.index + tag.length;

    const attributes = checkAttributes(rawAttributes);
    if (attributes) return { ok: false, reason: `<${name}>: ${attributes}` };
  }

  if (!sawRoot) return { ok: false, reason: "no <svg> root" };
  if (svg.slice(consumed).includes("<")) return { ok: false, reason: "trailing '<' after the last tag" };

  return { ok: true, svg };
}

/**
 * Returns the diagram if it is safe, and `null` otherwise.
 *
 * Kept as the plain answer for callers that only need yes or no; anything
 * wanting to know *why* uses `checkSvg`.
 */
export function sanitizeSvg(input: string | null | undefined): string | null {
  const result = checkSvg(input);
  return result.ok ? result.svg : null;
}

/**
 * Removes `<!-- ... -->` comments, including unterminated ones.
 *
 * An unterminated comment is cut to the end of the document rather than left
 * alone: a browser treats `<!--` with no close as swallowing everything after
 * it, so leaving it in place would mean the validator and the browser
 * disagreed about where the markup ends — which is exactly how a sanitiser
 * gets bypassed. Cutting it makes them agree, and anything real that gets
 * removed with it simply fails the "must end in </svg>" check.
 */
function stripComments(input: string): string {
  let output = "";
  let index = 0;

  for (;;) {
    const start = input.indexOf("<!--", index);
    if (start === -1) return output + input.slice(index);

    output += input.slice(index, start);
    const end = input.indexOf("-->", start + 4);
    if (end === -1) return output;
    index = end + 3;
  }
}

/** Null when every attribute is permitted, otherwise the reason it is not. */
function checkAttributes(raw: string): string | null {
  const attributes = raw.trim();
  if (attributes.length === 0) return null;

  let matched = "";
  let match: RegExpExecArray | null;
  ATTRIBUTE.lastIndex = 0;

  while ((match = ATTRIBUTE.exec(attributes)) !== null) {
    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";

    if (!ALLOWED_ATTRIBUTES.has(name)) return `disallowed attribute "${name}"`;

    const lowerValue = value.toLowerCase();
    for (const forbidden of FORBIDDEN_IN_VALUE) {
      if (lowerValue.includes(forbidden)) return `"${name}" contains forbidden "${forbidden}"`;
    }

    matched += match[0];
  }

  // Anything left over is an attribute the pattern above did not recognise —
  // a valueless flag, or something stranger. Either way, not understood is
  // not allowed.
  const leftover = attributes.replace(ATTRIBUTE, "").trim();
  if (leftover.length > 0 && BARE_ATTRIBUTE.test(leftover)) return "an attribute with no value";
  if (leftover.replace(/[\s/]/g, "").length > 0) return "an attribute that could not be parsed";

  if (matched.length === 0 && attributes.replace(/[\s/]/g, "").length > 0) {
    return "an attribute that could not be parsed";
  }
  return null;
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
  /**
   * Why a diagram that *was* offered did not survive — null when none was
   * offered at all. The caller logs it. Without this the two cases are
   * indistinguishable, and a prompt that keeps producing rejected diagrams
   * looks exactly like a model that never draws.
   */
  rejected: string | null;
} {
  const start = reply.search(/<svg[\s>]/i);
  if (start === -1) return { text: reply.trim(), diagram: null, diagramAlt: null, rejected: null };

  const endMarker = reply.toLowerCase().lastIndexOf("</svg>");
  if (endMarker === -1) {
    // An opening tag with no close: the model started a diagram and was cut
    // off, which is a truncated reply rather than an unsafe one.
    return { text: reply.trim(), diagram: null, diagramAlt: null, rejected: "unclosed <svg>" };
  }

  const candidate = reply.slice(start, endMarker + "</svg>".length);
  const text = (reply.slice(0, start) + reply.slice(endMarker + "</svg>".length))
    // Models like to fence the diagram; the fences are left behind once the
    // diagram is lifted out.
    .replace(/```(?:svg|xml|html)?/gi, "")
    .trim();

  const result = checkSvg(candidate);
  if (!result.ok) return { text, diagram: null, diagramAlt: null, rejected: result.reason };

  return { text, diagram: result.svg, diagramAlt: describeSvg(result.svg), rejected: null };
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
