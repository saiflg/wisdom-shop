import { columnWidths, fitText, paginate, type PageGeometry } from "./layout";

// Roughly A4 portrait with 50pt margins.
const A4: PageGeometry = {
  contentHeight: 742,
  titleHeight: 90,
  tableHeaderHeight: 24,
  rowHeight: 22,
  footerHeight: 30,
};

/** One unit per character — enough to test the fitting logic itself. */
const monospace = (value: string) => value.length;

describe("paginate", () => {
  it("fits a short list on one page", () => {
    const plan = paginate(10, A4);
    expect(plan.pageCount).toBe(1);
    expect(plan.pages).toEqual([{ start: 0, end: 10 }]);
  });

  it("gives the first page fewer rows, because it carries the title", () => {
    const plan = paginate(200, A4);
    expect(plan.firstPageRows).toBeLessThan(plan.laterPageRows);
  });

  it("NEVER drops a row, at any list length", () => {
    // The whole reason this is a pure function. A class list that quietly
    // stops at the bottom of page one looks entirely correct.
    for (const rowCount of [1, 2, 25, 26, 27, 50, 51, 99, 100, 101, 500, 1000]) {
      const plan = paginate(rowCount, A4);
      const covered = plan.pages.reduce((total, page) => total + (page.end - page.start), 0);
      expect(covered).toBe(rowCount);
    }
  });

  it("produces pages that are contiguous and non-overlapping", () => {
    // Two pages both starting at row 30 would print duplicates; a gap would
    // lose someone. Neither is visible on a printed sheet.
    const plan = paginate(500, A4);
    expect(plan.pages[0]?.start).toBe(0);
    for (let i = 1; i < plan.pages.length; i += 1) {
      expect(plan.pages[i]?.start).toBe(plan.pages[i - 1]?.end);
    }
    expect(plan.pages[plan.pages.length - 1]?.end).toBe(500);
  });

  it("never emits an empty page in the middle of a list", () => {
    for (const rowCount of [26, 27, 53, 54]) {
      const plan = paginate(rowCount, A4);
      for (const page of plan.pages) expect(page.end).toBeGreaterThan(page.start);
    }
  });

  it("gives an empty list one page rather than a zero-byte file", () => {
    // A school asking for the list of an empty class should get a sheet
    // saying so, not a file they will assume is corrupt.
    const plan = paginate(0, A4);
    expect(plan.pageCount).toBe(1);
    expect(plan.pages).toEqual([{ start: 0, end: 0 }]);
  });

  it("still makes progress when the geometry is absurd", () => {
    // Zero capacity would loop forever; a cramped page is the better failure.
    const cramped = paginate(5, { ...A4, contentHeight: 60 });
    expect(cramped.firstPageRows).toBeGreaterThanOrEqual(1);
    expect(cramped.pageCount).toBe(5);
  });

  it("refuses a zero row height rather than dividing by it", () => {
    expect(() => paginate(10, { ...A4, rowHeight: 0 })).toThrow(/height/i);
  });
});

describe("fitText", () => {
  it("leaves text that already fits alone", () => {
    expect(fitText("Ada One", 20, monospace)).toBe("Ada One");
  });

  it("marks truncation visibly", () => {
    // A name silently cut from "Adebayo-Williams" to "Adebayo" is a
    // different person as far as a reader is concerned.
    const fitted = fitText("Oluwaseun Adebayo-Williams", 12, monospace);
    expect(fitted).toContain("…");
    expect(fitted.length).toBeLessThanOrEqual(12);
  });

  it("never returns something wider than the column", () => {
    for (const width of [1, 2, 5, 10, 25, 40]) {
      const fitted = fitText("Oluwaseun Adebayo-Williams", width, monospace);
      expect(monospace(fitted)).toBeLessThanOrEqual(width);
    }
  });

  it("returns nothing when not even the ellipsis fits", () => {
    expect(fitText("Anything", 0, monospace)).toBe("");
  });

  it("handles empty input", () => {
    expect(fitText("", 10, monospace)).toBe("");
  });

  it("does not leave a dangling space before the ellipsis", () => {
    const fitted = fitText("Ada Bola Chi", 6, monospace);
    expect(fitted).not.toMatch(/ …$/);
  });
});

describe("columnWidths", () => {
  it("splits the width in proportion to the weights", () => {
    expect(columnWidths([1, 1], 100)).toEqual([50, 50]);
    expect(columnWidths([3, 1], 100)).toEqual([75, 25]);
  });

  it("always totals exactly the available width", () => {
    // A point of rounding error per column drifts off the right margin.
    for (const weights of [[1, 1, 1], [2, 3, 5, 7], [1, 1, 1, 1, 1, 1]]) {
      for (const total of [495, 500, 501, 723]) {
        const widths = columnWidths(weights, total);
        expect(widths.reduce((sum, width) => sum + width, 0)).toBe(total);
      }
    }
  });

  it("refuses weights that add up to nothing", () => {
    expect(() => columnWidths([0, 0], 100)).toThrow(/add up/i);
  });
});
