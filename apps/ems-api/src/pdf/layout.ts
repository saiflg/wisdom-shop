/**
 * Page arithmetic for the documents a school hands out.
 *
 * The failure this exists to prevent is silent truncation. A class list that
 * quietly stops at the bottom of page one, or a report card missing its last
 * two subjects, looks entirely correct — nobody notices until a parent asks
 * why their child's best subject is absent. So the row-to-page maths is a
 * pure function with a test asserting that every row lands somewhere.
 *
 * All measurements are PDF points (72 to the inch), which is what pdfkit
 * works in.
 */

export interface PageGeometry {
  /** Usable height between the top and bottom margins. */
  contentHeight: number;
  /** Height of the title block, drawn on the first page only. */
  titleHeight: number;
  /** Height of the column headings, repeated on every page. */
  tableHeaderHeight: number;
  /** Height of one row. */
  rowHeight: number;
  /** Reserved at the foot of every page for the page number. */
  footerHeight: number;
}

export interface Pagination {
  /** How many rows fit on the first page, which also carries the title. */
  firstPageRows: number;
  /** How many rows fit on every page after the first. */
  laterPageRows: number;
  pageCount: number;
  /** Row indices per page, so a caller cannot mis-slice and lose rows. */
  pages: { start: number; end: number }[];
}

/**
 * Works out how the rows fall across pages.
 *
 * The first page is shorter than the rest because it carries the document
 * title. Getting that wrong by one row is exactly how the last entry of a
 * list disappears.
 */
export function paginate(rowCount: number, geometry: PageGeometry): Pagination {
  const { contentHeight, titleHeight, tableHeaderHeight, rowHeight, footerHeight } = geometry;

  if (rowHeight <= 0) {
    throw new Error("A row must have a height");
  }

  const firstAvailable = contentHeight - titleHeight - tableHeaderHeight - footerHeight;
  const laterAvailable = contentHeight - tableHeaderHeight - footerHeight;

  // At least one row per page even when the geometry is absurd: returning
  // zero would loop forever below, and a cramped page is a better failure
  // than a hang.
  const firstPageRows = Math.max(1, Math.floor(firstAvailable / rowHeight));
  const laterPageRows = Math.max(1, Math.floor(laterAvailable / rowHeight));

  const pages: { start: number; end: number }[] = [];

  if (rowCount === 0) {
    // An empty list still produces one page. A school asking for a class
    // list of an empty class should get a sheet saying so, not a zero-byte
    // file they will assume is broken.
    return { firstPageRows, laterPageRows, pageCount: 1, pages: [{ start: 0, end: 0 }] };
  }

  let cursor = 0;
  while (cursor < rowCount) {
    const capacity = pages.length === 0 ? firstPageRows : laterPageRows;
    const end = Math.min(cursor + capacity, rowCount);
    pages.push({ start: cursor, end });
    cursor = end;
  }

  return { firstPageRows, laterPageRows, pageCount: pages.length, pages };
}

/**
 * Trims text to fit a column, marking that it was cut.
 *
 * `measure` is supplied by the caller because only pdfkit knows how wide a
 * string is in the chosen font. Truncation is always visible — a name
 * silently cut from "Oluwaseun Adebayo-Williams" to "Oluwaseun Adebayo" is
 * a different person as far as a reader is concerned.
 */
export function fitText(
  text: string,
  maxWidth: number,
  measure: (value: string) => number,
  ellipsis = "…",
): string {
  if (!text) return "";
  if (measure(text) <= maxWidth) return text;

  // Nothing sensible fits: better an ellipsis than a column of garbage.
  if (measure(ellipsis) > maxWidth) return "";

  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (measure(text.slice(0, mid) + ellipsis) <= maxWidth) low = mid;
    else high = mid - 1;
  }

  return text.slice(0, low).trimEnd() + ellipsis;
}

/**
 * Column widths from proportional weights.
 *
 * Rounding is absorbed by the last column so the total always matches the
 * available width exactly — a table that overshoots by a point per column
 * drifts off the right margin over six columns.
 */
export function columnWidths(weights: number[], totalWidth: number): number[] {
  const sum = weights.reduce((total, weight) => total + weight, 0);
  if (sum <= 0) throw new Error("Column weights must add up to something");

  const widths = weights.map((weight) => Math.floor((weight / sum) * totalWidth));
  const used = widths.reduce((total, width) => total + width, 0);
  const last = widths.length - 1;
  widths[last] = (widths[last] as number) + (totalWidth - used);
  return widths;
}
