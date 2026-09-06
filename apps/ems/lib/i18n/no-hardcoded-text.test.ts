/**
 * Fails when a screen gains English that is not in the dictionaries.
 *
 * The whole app was swept by hand into five languages. Nothing stops the
 * next page from arriving with `<h1>Attendance</h1>` in it, and nobody
 * notices a single English word on an Arabic screen until a customer does.
 *
 * The sweep found seven separate blind spots in the throwaway script that
 * did it, and every one of them made the script say "done" when it was not:
 *
 *   - bare prose on its own line was not looked at at all
 *   - a capital was required, so "late" and "approved and paid" were hidden
 *   - the character class had no em-dash, and most prose here has one
 *   - the length floor was four, so "Day", "To" and "From" were below it
 *   - only page.tsx was scanned, so every component was invisible
 *   - a wrapped comment's later lines were read as prose
 *   - and the largest: a string in ARGUMENT position - every error toast and
 *     every validation message in the app - was never matched, because the
 *     pattern only looked after a colon or a question mark
 *
 * So the patterns below are deliberately wide and the exceptions are listed
 * one by one. A new exception should be rare and should say why it is one.
 */

import fs from "fs";
import path from "path";

const ROOT = path.join(__dirname, "..", "..");
const DIRS = ["app", "components"];

/** Text between tags: `>Some words<`. */
const JSX_TEXT = />\s*([A-Za-z][^<>{}\n]{2,}?)\s*</g;
/** Attributes a person reads. */
const PROP =
  /\b(label|title|placeholder|hint|heading|description|summary|emptyText|aria-label)=\{?"([^"]{2,})"/g;
/** A fallback or a branch: `? "Some words"`. */
const TERNARY = /[:?]\s*"([A-Z][^"]{3,})"/g;
/** An argument: `errorMessage(err, "...")`, `z.string().min(1, "...")`. */
const ARGUMENT = /[(,]\s*"([A-Z][^"]{6,})"/g;
/**
 * Prose welded to a value, in either of the two shapes it takes here.
 *
 * This is the ninth blind spot, and the one that survived longest, because
 * neither shape is a quoted string or text between two tags:
 *
 *     ` - paid by ${name}`          a template literal
 *     {count} of {total} handed in  between two interpolations
 *
 * The payroll screen passed every other check while telling an Arabic reader
 * "3 staff - net 450,000 - paid by Amina Yusuf - approved".
 */
const TEMPLATE = /`([^`]*)`/g;
const BETWEEN = /\}([^{}<>`"]{3,}?)[{<]/g;
/** Two Latin words in a row, which is the shortest thing that reads as prose. */
const PROSE = /[A-Za-z]{2,}\s+[A-Za-z]{2,}/;
/** Words that only look like prose because JavaScript spells them that way. */
const KEYWORDS = new Set([
  "finally", "catch", "else", "try", "return", "await", "const", "let", "var",
  "function", "if", "for", "while", "case", "default", "break", "continue",
  "new", "typeof", "instanceof", "in", "of", "do", "switch", "throw", "class",
  "extends", "null", "undefined", "true", "false",
]);

/**
 * Text that is data, not language.
 *
 * Enum values are matched by name in the database, HTTP verbs and header
 * names are protocol, and a placeholder showing the shape of a URL or an
 * account name is an example rather than a sentence. Budget categories,
 * terms and voucher headings are seeded into the database and edited by the
 * school, so translating them would break the matching they exist for -
 * the same call made throughout the sweep.
 */
const ALLOWED = new Set([
  // Values stored in, and matched by, the database.
  "First", "Second", "Third", "Term 1", "Exam", "Diesel", "Stationery",
  "Net Salary", "Gross Salary", "Total Deduction", "Afternoon",
  // Protocol and provider names.
  "POST", "PATCH", "PUT", "DELETE", "TLS", "SSL",
  "Paystack", "OPay", "Flutterwave", "Stripe", "Campus",
  // Format examples: what to type, not something to read.
  "NGN", "NERDC", "FCMB Pensions Ltd", "United Bank for Africa",
  "smtp.example.com", "Excel (.xlsx)", "CSV (.csv)", "my-school",
  // The product's own name, which does not change with the language.
  "Wisdom Campus", "Wisdom Teacher", "Wisdom Shop",
  // Type arguments the JSX pattern cannot tell from text: `<Promise<T>` and
  // `apiFetch<Row>(` both look like a word between angle brackets.
  "Promise", "apiFetch",
]);

const ALLOWED_PATTERNS = [
  /^[A-Z][A-Z0-9_]*$/, //          SCREAMING_CASE enum values
  /^https?:\/\//, //               URL examples
  /^\+\d{6,}$/, //                 phone-number examples
  /^[a-z][A-Za-z0-9]*\.[A-Za-z]/, // expressions: voice.voiceName
  /^[MmLlHhVvCcSsQqTtAaZz][\d\s.,-]/, // SVG path data
  /^[\d.,:\s%/-]+$/, //            digits and punctuation
];

function allowed(text: string): boolean {
  const trimmed = text.trim();
  if (ALLOWED.has(trimmed)) return true;
  return ALLOWED_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx")) out.push(full);
    }
  };
  for (const dir of DIRS) walk(path.join(ROOT, dir));
  return out;
}

/**
 * The `export const metadata` block, which is not a screen.
 *
 * It is the browser tab title and the text a link preview shows, rendered on
 * the server from a request that does not carry the reader's language - the
 * language lives in localStorage, because it belongs to the person and not
 * the request. Translating these needs generateMetadata reading the school's
 * configured locale, which is a separate piece of work; leaving them out of
 * this check is deliberate rather than an oversight.
 */
function metadataLines(source: string): Set<number> {
  const lines = source.split("\n");
  const inside = new Set<number>();
  let depth = 0;
  let open = false;
  lines.forEach((line, index) => {
    if (!open && /export const metadata\b/.test(line)) open = true;
    if (!open) return;
    inside.add(index);
    depth += (line.match(/[{[]/g) ?? []).length - (line.match(/[}\]]/g) ?? []).length;
    if (depth <= 0 && /[};]/.test(line) && index > 0) open = false;
  });
  return inside;
}

/** Comments explain the code and are never rendered. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

/** Is this offset inside a `t(...)` or `tPlural(...)` call on this line? */
function insideTranslate(line: string, at: number): boolean {
  for (const call of line.matchAll(/\bt(?:Plural)?\(/g)) {
    let depth = 0;
    let i = call.index! + call[0].length - 1;
    for (; i < line.length; i++) {
      if (line[i] === "(") depth++;
      else if (line[i] === ")" && --depth === 0) break;
    }
    if (call.index! <= at && at <= i) return true;
  }
  return false;
}

describe("no hardcoded English on a screen", () => {
  it("finds nothing outside the dictionaries", () => {
    const findings: string[] = [];

    for (const file of sourceFiles()) {
      const relative = path.relative(ROOT, file).replace(/\\/g, "/");
      const source = stripComments(fs.readFileSync(file, "utf8"));
      const lines = source.split("\n");
      const metadata = metadataLines(source);

      lines.forEach((line, index) => {
        const report = (text: string | undefined, at: number) => {
          if (!text || metadata.has(index)) return;
          if (allowed(text) || insideTranslate(line, at)) return;
          findings.push(`${relative}:${index + 1}  ${text.trim()}`);
        };
        // Anything with a class name on it is styling, not language.
        if (!/className|clsx|import |require\(|href=|src=/.test(line)) {
          for (const m of line.matchAll(TEMPLATE)) {
            const literal = m[1]!.replace(/\$\{[^}]*\}/g, " ");
            if (PROSE.test(literal)) report(literal.trim(), m.index!);
          }
          for (const m of line.matchAll(BETWEEN)) {
            const segment = m[1]!.trim().replace(/^[.·\s]+|[.·\s]+$/g, "");
            if (KEYWORDS.has(segment.toLowerCase())) continue;
            if (PROSE.test(segment)) report(segment, m.index!);
          }
        }
        for (const m of line.matchAll(JSX_TEXT)) report(m[1], m.index!);
        for (const m of line.matchAll(PROP)) report(m[2], m.index!);
        for (const m of line.matchAll(TERNARY)) report(m[1], m.index!);
        for (const m of line.matchAll(ARGUMENT)) report(m[1], m.index!);
      });
    }

    expect(findings).toEqual([]);
  });
});
