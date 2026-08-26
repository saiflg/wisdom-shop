/**
 * Issuing a student's admission number.
 *
 * Schools write these as "abbreviation / year / serial" — DA/2026/0001 — and
 * the shape carries real meaning to the office: who issued it, when the child
 * joined, and the order they arrived in. Typing them by hand is how a roll
 * ends up with "76854433" next to "ADM-NEW-1" next to "DEMO-004", which is
 * exactly what this school's list looked like before.
 *
 * Pure and free of Nest so the format can be tested exhaustively without a
 * database. Claiming the serial is the impure half and lives in the service,
 * for the same reason receipt numbers do: a number must be claimed inside the
 * transaction that uses it, or two admissions on the same morning get the
 * same one.
 */

/** Words that carry no identity, so they earn no letter. */
const NOISE = new Set(["of", "the", "and", "for", "de", "la", "at"]);

/**
 * A school's letters, from its name.
 *
 * Initials of the significant words — "Demo Academy" is DA, "St Mary's
 * College of Arts" is SMCA. A single-word name has no initials worth having,
 * so it contributes its first three letters instead: "Kingsway" as "K" would
 * collide with every other K school the moment a group runs more than one.
 *
 * Capped at four characters. Longer stops being an abbreviation and starts
 * being a second name, and it has to fit on a printed ID card.
 */
export function schoolAbbreviation(name: string | null | undefined): string {
  const cleaned = (name ?? "")
    // Apostrophes and punctuation are not word breaks: "St Mary's" is two
    // words, not three, and "Mary's" must not contribute an S.
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .trim();

  if (!cleaned) return "SCH";

  const words = cleaned
    .split(/[\s-]+/)
    .filter(Boolean)
    .filter((word) => !NOISE.has(word.toLowerCase()));

  const significant = words.length > 0 ? words : cleaned.split(/[\s-]+/).filter(Boolean);

  if (significant.length === 1) {
    return significant[0].slice(0, 3).toUpperCase();
  }

  return significant
    .map((word) => word[0])
    .join("")
    .slice(0, 4)
    .toUpperCase();
}

export interface AdmissionNumberParts {
  /** The school's letters. Already trimmed and upper-cased by the caller. */
  abbreviation: string;
  /** The year the child was admitted, not today's year. */
  year: number;
  /** 1 for the first child admitted that year. */
  sequence: number;
}

/**
 * Four digits of serial, so a school admitting nine hundred children in a
 * year still sorts correctly in a spreadsheet — which is where these end up
 * whatever anybody intends. Beyond 9999 the number simply grows rather than
 * wrapping: a wrong-but-tidy number is worse than a long one.
 */
export function buildAdmissionNumber(parts: AdmissionNumberParts): string {
  const serial = String(Math.max(1, Math.trunc(parts.sequence))).padStart(4, "0");
  return `${parts.abbreviation}/${parts.year}/${serial}`;
}

/**
 * Whether a code looks like one this system issued.
 *
 * Used to leave hand-entered codes alone: a school migrating from paper has
 * its own numbering, and renumbering a child who has had the same admission
 * number for six years is not a tidy-up, it is losing their record.
 */
export function isGeneratedAdmissionNumber(code: string | null | undefined): boolean {
  return /^[A-Z]{1,4}\/\d{4}\/\d{4,}$/.test((code ?? "").trim());
}
