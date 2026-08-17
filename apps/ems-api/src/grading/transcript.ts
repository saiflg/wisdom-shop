/**
 * A student's whole academic record, across years.
 *
 * Derived from the term results the school has already published — nothing
 * new is stored. A transcript that could drift from the report cards it
 * summarises would be worse than none, so there is exactly one source and
 * this module only arranges it.
 *
 * **Published only, for everybody, including staff.** The report card lets a
 * teacher see a draft because they are working on it. A transcript is a
 * formal document that leaves the building: one containing an unpublished
 * term is a document that changes after it has been issued, which is how a
 * school ends up with two different transcripts for one child.
 *
 * Pure, so the arithmetic can be argued with in a test rather than by
 * publishing a term.
 */

export interface SubjectRow {
  subjectName: string;
  percentHundredths: number;
  gradeLabel: string;
  gradePoint: number | null;
}

export interface TermRow {
  academicYear: string;
  term: string;
  className: string | null;
  status: string;
  /** Null when the school published a term without an overall figure. */
  overallPercentHundredths: number | null;
  publishedAt: Date | null;
  subjects: SubjectRow[];
}

export interface TranscriptTerm extends TermRow {
  /** "72.50%" — formatted once, so every surface agrees. */
  overall: string | null;
  subjectCount: number;
}

export interface Transcript {
  terms: TranscriptTerm[];
  /** Distinct academic years covered, earliest first. */
  years: string[];
  termsCounted: number;
  /**
   * The mean of each term's overall, each term counting once.
   *
   * Not weighted by how many subjects a term had: a term with nine subjects
   * is not a bigger part of a child's record than one with six, and
   * weighting would let a timetable change move a leaver's average.
   */
  cumulativeAverage: string | null;
  cumulativeAverageHundredths: number | null;
  /** Null unless the school's grade scale carries points. */
  gradePointAverage: string | null;
  /** Said plainly when a figure could not be worked out, rather than a zero. */
  notes: string[];
}

/**
 * Term order within a year.
 *
 * The term is free text — "Term 1", "First Term", "Michaelmas" — because
 * schools name them differently and an enum would churn. A leading number is
 * used when there is one, since that is the common case and gets ordering
 * right without a lookup table; everything else falls back to alphabetical,
 * which is at least stable.
 */
export function termRank(term: string): number {
  const digits = /(\d+)/.exec(term);
  if (digits) return Number(digits[1]);

  const words: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4 };
  const lower = term.toLowerCase();
  for (const [word, rank] of Object.entries(words)) {
    if (lower.includes(word)) return rank;
  }
  return Number.MAX_SAFE_INTEGER;
}

export function compareTerms(a: TermRow, b: TermRow): number {
  if (a.academicYear !== b.academicYear) return a.academicYear.localeCompare(b.academicYear);
  const rank = termRank(a.term) - termRank(b.term);
  return rank !== 0 ? rank : a.term.localeCompare(b.term);
}

export function formatPercent(hundredths: number | null): string | null {
  if (hundredths === null || Number.isNaN(hundredths)) return null;
  return `${(hundredths / 100).toFixed(2)}%`;
}

/**
 * The mean of the terms that actually have an overall.
 *
 * A term published without one is skipped, never counted as zero — the
 * commonest way an averaging bug quietly libels a child.
 */
export function cumulativeAverage(terms: readonly TermRow[]): number | null {
  const figures = terms
    .map((term) => term.overallPercentHundredths)
    .filter((value): value is number => value !== null && !Number.isNaN(value));

  if (figures.length === 0) return null;
  return Math.round(figures.reduce((sum, value) => sum + value, 0) / figures.length);
}

/**
 * Grade point average, across every subject in every term.
 *
 * Per subject rather than per term, because that is what a grade point is:
 * the value of one grade in one subject. Returns null when the school's
 * scale carries no points, rather than inventing them.
 */
export function gradePointAverage(terms: readonly TermRow[]): number | null {
  const points = terms
    .flatMap((term) => term.subjects)
    .map((subject) => subject.gradePoint)
    .filter((value): value is number => value !== null && !Number.isNaN(value));

  if (points.length === 0) return null;
  return points.reduce((sum, value) => sum + value, 0) / points.length;
}

export function buildTranscript(rows: readonly TermRow[]): Transcript {
  // Published only. Filtered here rather than trusted from the query, so a
  // caller that forgets cannot produce a transcript containing a draft.
  const published = rows.filter((row) => row.status === "PUBLISHED");
  const ordered = [...published].sort(compareTerms);

  const notes: string[] = [];

  const withoutOverall = ordered.filter((term) => term.overallPercentHundredths === null);
  if (withoutOverall.length > 0) {
    notes.push(
      `${withoutOverall.length} ${withoutOverall.length === 1 ? "term has" : "terms have"} no overall mark and ` +
        `${withoutOverall.length === 1 ? "is" : "are"} not counted in the average.`,
    );
  }

  const draftCount = rows.length - published.length;
  if (draftCount > 0) {
    // Said out loud: a transcript that silently omits a term looks complete
    // and is not, and the school needs to know why before issuing it.
    notes.push(
      `${draftCount} ${draftCount === 1 ? "term is" : "terms are"} not published yet and ` +
        `${draftCount === 1 ? "does" : "do"} not appear.`,
    );
  }

  const average = cumulativeAverage(ordered);
  const gpa = gradePointAverage(ordered);

  return {
    terms: ordered.map((term) => ({
      ...term,
      overall: formatPercent(term.overallPercentHundredths),
      subjectCount: term.subjects.length,
    })),
    years: [...new Set(ordered.map((term) => term.academicYear))],
    termsCounted: ordered.length,
    cumulativeAverage: formatPercent(average),
    cumulativeAverageHundredths: average,
    gradePointAverage: gpa === null ? null : gpa.toFixed(2),
    notes,
  };
}

/**
 * One line per subject, across the whole record.
 *
 * The question a receiving school asks is "how did they do at mathematics",
 * not "what did term two look like" — so the same rows are offered the other
 * way round as well.
 */
export interface SubjectHistory {
  subjectName: string;
  entries: { academicYear: string; term: string; percent: string; gradeLabel: string }[];
  best: string | null;
  average: string | null;
}

export function bySubject(transcript: Transcript): SubjectHistory[] {
  const grouped = new Map<string, { academicYear: string; term: string; hundredths: number; gradeLabel: string }[]>();

  for (const term of transcript.terms) {
    for (const subject of term.subjects) {
      const list = grouped.get(subject.subjectName) ?? [];
      list.push({
        academicYear: term.academicYear,
        term: term.term,
        hundredths: subject.percentHundredths,
        gradeLabel: subject.gradeLabel,
      });
      grouped.set(subject.subjectName, list);
    }
  }

  return [...grouped.entries()]
    .map(([subjectName, entries]) => {
      const marks = entries.map((entry) => entry.hundredths);
      const mean = Math.round(marks.reduce((sum, value) => sum + value, 0) / marks.length);
      return {
        subjectName,
        entries: entries.map((entry) => ({
          academicYear: entry.academicYear,
          term: entry.term,
          percent: formatPercent(entry.hundredths) ?? "—",
          gradeLabel: entry.gradeLabel,
        })),
        best: formatPercent(Math.max(...marks)),
        average: formatPercent(mean),
      };
    })
    .sort((a, b) => a.subjectName.localeCompare(b.subjectName));
}
