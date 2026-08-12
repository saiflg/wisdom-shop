import {
  parseRowsPerPage,
  parseVoucherColumns,
  validateColumns,
} from "./voucher-settings";
import { DEFAULT_VOUCHER_COLUMNS, type VoucherColumn } from "./voucher-layout";

const NAME: VoucherColumn = { key: "name", label: "Name", source: { kind: "STAFF", field: "name" } };
const NET: VoucherColumn = { key: "net", label: "Net", source: { kind: "TOTAL", of: "NET" }, money: true };

describe("parseVoucherColumns", () => {
  it("keeps a well-formed configuration", () => {
    const parsed = parseVoucherColumns([
      { key: "sn", label: "S/N", source: { kind: "SERIAL" } },
      { key: "name", label: "Name", source: { kind: "STAFF", field: "name" } },
      { key: "pension", label: "Pension", source: { kind: "COMPONENT", label: "Pension" }, money: true },
    ]);
    expect(parsed.map((c) => c.key)).toEqual(["sn", "name", "pension"]);
    expect(parsed[2].money).toBe(true);
  });

  it("preserves the order the school chose", () => {
    // The order IS the voucher. Sorting or reordering it would silently
    // rearrange a document somebody signs.
    const parsed = parseVoucherColumns([
      { key: "net", label: "Net", source: { kind: "TOTAL", of: "NET" } },
      { key: "name", label: "Name", source: { kind: "STAFF", field: "name" } },
    ]);
    expect(parsed.map((c) => c.key)).toEqual(["net", "name"]);
  });

  describe("surviving nonsense", () => {
    it("falls back to the default layout when the column is not an array", () => {
      expect(parseVoucherColumns(null)).toEqual(DEFAULT_VOUCHER_COLUMNS);
      expect(parseVoucherColumns("columns")).toEqual(DEFAULT_VOUCHER_COLUMNS);
      expect(parseVoucherColumns({ key: "x" })).toEqual(DEFAULT_VOUCHER_COLUMNS);
    });

    it("falls back rather than producing a voucher with no columns", () => {
      // An empty voucher looks exactly like data loss to whoever opens it.
      expect(parseVoucherColumns([])).toEqual(DEFAULT_VOUCHER_COLUMNS);
      expect(parseVoucherColumns([{ nonsense: true }, 42, null])).toEqual(DEFAULT_VOUCHER_COLUMNS);
    });

    it("drops a column with an unknown source kind", () => {
      const parsed = parseVoucherColumns([
        { key: "name", label: "Name", source: { kind: "STAFF", field: "name" } },
        { key: "weird", label: "Weird", source: { kind: "SOMETHING_ELSE" } },
      ]);
      expect(parsed.map((c) => c.key)).toEqual(["name"]);
    });

    it("drops a staff column naming a field that does not exist", () => {
      const parsed = parseVoucherColumns([
        { key: "name", label: "Name", source: { kind: "STAFF", field: "name" } },
        { key: "salary", label: "Salary", source: { kind: "STAFF", field: "secretSalary" } },
      ]);
      expect(parsed.map((c) => c.key)).toEqual(["name"]);
    });

    it("drops a component column with no label to match on", () => {
      const parsed = parseVoucherColumns([
        { key: "name", label: "Name", source: { kind: "STAFF", field: "name" } },
        { key: "blank", label: "Blank", source: { kind: "COMPONENT", label: "   " } },
      ]);
      expect(parsed.map((c) => c.key)).toEqual(["name"]);
    });

    it("drops a duplicate key rather than shadowing the first", () => {
      const parsed = parseVoucherColumns([
        { key: "name", label: "Name", source: { kind: "STAFF", field: "name" } },
        { key: "name", label: "Name again", source: { kind: "STAFF", field: "jobTitle" } },
      ]);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].label).toBe("Name");
    });

    it("drops a column with no heading", () => {
      const parsed = parseVoucherColumns([
        { key: "name", label: "Name", source: { kind: "STAFF", field: "name" } },
        { key: "nameless", label: "  ", source: { kind: "SERIAL" } },
      ]);
      expect(parsed.map((c) => c.key)).toEqual(["name"]);
    });

    it("treats a missing money flag as text rather than guessing", () => {
      const parsed = parseVoucherColumns([
        { key: "name", label: "Name", source: { kind: "STAFF", field: "name" } },
      ]);
      expect(parsed[0].money).toBe(false);
    });
  });
});

describe("parseRowsPerPage", () => {
  it("keeps a sensible number", () => {
    expect(parseRowsPerPage(20)).toBe(20);
  });

  it("falls back for anything that is not a number", () => {
    expect(parseRowsPerPage("many")).toBe(16);
    expect(parseRowsPerPage(null)).toBe(16);
    expect(parseRowsPerPage(Number.NaN)).toBe(16);
  });

  it("refuses zero and negatives, which would loop forever or invert the page", () => {
    expect(parseRowsPerPage(0)).toBe(1);
    expect(parseRowsPerPage(-5)).toBe(1);
  });

  it("caps an absurd number so subtotals stay useful", () => {
    expect(parseRowsPerPage(1_000_000)).toBe(500);
  });

  it("truncates a fraction rather than producing half a row", () => {
    expect(parseRowsPerPage(12.9)).toBe(12);
  });
});

describe("validateColumns", () => {
  it("accepts a minimal usable voucher", () => {
    expect(validateColumns([NAME, NET])).toEqual([]);
  });

  it("insists on a net pay column", () => {
    // Losing it turns the voucher into a document nobody can pay from, and
    // it is an easy thing to delete while tidying up.
    const problems = validateColumns([NAME]);
    expect(problems.join(" ")).toMatch(/Net Salary/);
  });

  it("insists on the staff member's name", () => {
    const problems = validateColumns([NET]);
    expect(problems.join(" ")).toMatch(/name/i);
  });

  it("refuses an empty voucher", () => {
    expect(validateColumns([]).join(" ")).toMatch(/at least one column/);
  });

  it("reports duplicate ids", () => {
    const problems = validateColumns([NAME, NET, { ...NET, label: "Net again" }]);
    expect(problems.join(" ")).toMatch(/same id/);
  });

  it("allows exactly one page-total column but not two", () => {
    const pageTotal: VoucherColumn = { key: "t1", label: "Total", source: { kind: "PAGE_TOTAL" } };
    expect(validateColumns([NAME, NET, pageTotal])).toEqual([]);
    expect(
      validateColumns([NAME, NET, pageTotal, { ...pageTotal, key: "t2" }]).join(" "),
    ).toMatch(/one page-total/);
  });

  it("reports every problem at once rather than one per save", () => {
    const problems = validateColumns([]);
    expect(problems.length).toBeGreaterThan(1);
  });

  it("passes the default layout", () => {
    expect(validateColumns([...DEFAULT_VOUCHER_COLUMNS])).toEqual([]);
  });
});
