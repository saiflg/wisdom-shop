import {
  buildVoucher,
  DEFAULT_VOUCHER_COLUMNS,
  formatCents,
  type VoucherColumn,
  type VoucherPayslip,
} from "./voucher-layout";

function payslip(overrides: Partial<VoucherPayslip> = {}): VoucherPayslip {
  return {
    staffProfileId: "sp1",
    staffName: "Abdullahi Nuhu",
    staffNumber: "S001",
    bankName: "Jaiz",
    accountNumber: "0000075686",
    jobTitle: "Teacher",
    qualification: "Degree",
    startDate: "September 2008",
    remark: null,
    grossCents: 6_834_290,
    deductionsCents: 1_136_364,
    netCents: 5_697_926,
    lines: [
      { label: "Salary", kind: "EARNING", amountCents: 5_634_290 },
      { label: "Year Of Service", kind: "EARNING", amountCents: 1_200_000 },
      { label: "Loan", kind: "DEDUCTION", amountCents: 1_136_364 },
    ],
    ...overrides,
  };
}

function many(n: number, netCents = 100_000): VoucherPayslip[] {
  return Array.from({ length: n }, (_, i) =>
    payslip({ staffProfileId: `sp${i}`, staffName: `Staff ${i}`, netCents, lines: [] }),
  );
}

const COLUMNS: VoucherColumn[] = [
  { key: "sn", label: "S/N", source: { kind: "SERIAL" } },
  { key: "name", label: "Name", source: { kind: "STAFF", field: "name" } },
  { key: "net", label: "Net Salary", source: { kind: "TOTAL", of: "NET" }, money: true },
  { key: "loan", label: "Loan", source: { kind: "COMPONENT", label: "Loan" }, money: true },
  { key: "total", label: "Total", source: { kind: "PAGE_TOTAL" }, money: true },
];

const cellText = (v: ReturnType<typeof buildVoucher>, page: number, row: number, col: number) =>
  v.pages[page].rows[row].cells[col].text;

describe("formatCents", () => {
  it("renders minor units with thousands separators", () => {
    expect(formatCents(5_697_926)).toBe("56,979.26");
  });

  it("keeps two decimals on a round figure", () => {
    expect(formatCents(4_000_000)).toBe("40,000.00");
  });
});

describe("page subtotals", () => {
  it("totals only the rows on that page", () => {
    // The property that matters. A paper voucher is signed page by page, and
    // a subtotal that does not match the rows above it destroys trust in the
    // whole document.
    const voucher = buildVoucher(many(5, 100_000), COLUMNS, 2);

    expect(voucher.pages).toHaveLength(3);
    expect(voucher.pages[0].subtotalCents).toBe(200_000);
    expect(voucher.pages[1].subtotalCents).toBe(200_000);
    expect(voucher.pages[2].subtotalCents).toBe(100_000);
  });

  it("makes the page subtotals add up to the grand total", () => {
    const voucher = buildVoucher(many(17, 33_333), COLUMNS, 5);
    const summed = voucher.pages.reduce((total, page) => total + page.subtotalCents, 0);
    expect(summed).toBe(voucher.grandTotalCents);
    expect(voucher.grandTotalCents).toBe(17 * 33_333);
  });

  it("repeats the page subtotal on every row of that page, as the paper does", () => {
    const voucher = buildVoucher(many(4, 50_000), COLUMNS, 2);
    expect(cellText(voucher, 0, 0, 4)).toBe("1,000.00");
    expect(cellText(voucher, 0, 1, 4)).toBe("1,000.00");
  });

  it("puts a single leftover person on a page of their own", () => {
    const voucher = buildVoucher(many(7, 10_000), COLUMNS, 3);
    expect(voucher.pages).toHaveLength(3);
    expect(voucher.pages[2].rows).toHaveLength(1);
    expect(voucher.pages[2].subtotalCents).toBe(10_000);
  });

  it("refuses a page size of zero rather than looping forever", () => {
    expect(() => buildVoucher(many(3), COLUMNS, 0)).toThrow(/at least 1/);
  });
});

describe("serial numbers", () => {
  it("counts continuously across pages rather than restarting", () => {
    // S/N 1..50 down the whole voucher; restarting at each page would make
    // two people "number 1".
    const voucher = buildVoucher(many(5), COLUMNS, 2);
    expect(cellText(voucher, 0, 0, 0)).toBe("1");
    expect(cellText(voucher, 1, 0, 0)).toBe("3");
    expect(cellText(voucher, 2, 0, 0)).toBe("5");
  });
});

describe("components", () => {
  it("reads a named component off the payslip", () => {
    const voucher = buildVoucher([payslip()], COLUMNS, 10);
    expect(cellText(voucher, 0, 0, 3)).toBe("11,363.64");
  });

  it("matches the label ignoring case and stray spaces", () => {
    // The spreadsheet this replaces has a column literally named " Loan ".
    const voucher = buildVoucher(
      [payslip({ lines: [{ label: "  loan ", kind: "DEDUCTION", amountCents: 500_000 }] })],
      COLUMNS,
      10,
    );
    expect(cellText(voucher, 0, 0, 3)).toBe("5,000.00");
  });

  it("adds up two components sharing one label", () => {
    const voucher = buildVoucher(
      [
        payslip({
          lines: [
            { label: "Loan", kind: "DEDUCTION", amountCents: 100_000 },
            { label: "Loan", kind: "DEDUCTION", amountCents: 250_000 },
          ],
        }),
      ],
      COLUMNS,
      10,
    );
    expect(cellText(voucher, 0, 0, 3)).toBe("3,500.00");
  });

  it("leaves the cell blank when this person has no such component", () => {
    // Not "0.00": a column of zeroes hides the few rows that matter, which is
    // exactly what somebody scanning deductions is looking for.
    const voucher = buildVoucher([payslip({ lines: [] })], COLUMNS, 10);
    expect(cellText(voucher, 0, 0, 3)).toBe("");
  });

  it("keeps the column even when nobody has that component", () => {
    // The voucher must not change shape month to month, or a bursar comparing
    // March with April finds the columns have moved.
    const voucher = buildVoucher(many(3), COLUMNS, 10);
    expect(voucher.pages[0].rows[0].cells).toHaveLength(COLUMNS.length);
  });
});

describe("column totals", () => {
  it("totals the money columns across the whole run", () => {
    const voucher = buildVoucher(many(4, 25_000), COLUMNS, 2);
    expect(voucher.columnTotals[2]).toBe(100_000);
  });

  it("NEVER totals the repeated page-total column", () => {
    // It is printed once per row; adding it up would count each page as many
    // times as it has rows, and produce a grand total several times too big.
    const voucher = buildVoucher(many(4, 25_000), COLUMNS, 2);
    expect(voucher.columnTotals[4]).toBeNull();
  });

  it("leaves text columns without a total", () => {
    const voucher = buildVoucher(many(3), COLUMNS, 10);
    expect(voucher.columnTotals[1]).toBeNull();
  });
});

describe("an empty run", () => {
  it("produces no pages and a zero total rather than failing", () => {
    const voucher = buildVoucher([], COLUMNS, 20);
    expect(voucher.pages).toEqual([]);
    expect(voucher.grandTotalCents).toBe(0);
    expect(voucher.staffCount).toBe(0);
  });
});

describe("the default columns", () => {
  it("covers what a Nigerian school voucher prints", () => {
    const labels = DEFAULT_VOUCHER_COLUMNS.map((c) => c.label);
    expect(labels).toEqual(
      expect.arrayContaining([
        "S/N",
        "Name",
        "Bank",
        "Account Number",
        "Net Salary",
        "Qualification",
        "Designation",
        "Date Of Employment",
        "Gross Salary",
        "Total Deduction",
        "Remark",
        "Total",
      ]),
    );
  });

  it("has no duplicate keys, so a configuration cannot be ambiguous", () => {
    const keys = DEFAULT_VOUCHER_COLUMNS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("builds a whole voucher without throwing", () => {
    const voucher = buildVoucher(many(3), DEFAULT_VOUCHER_COLUMNS, 2);
    expect(voucher.pages[0].rows[0].cells).toHaveLength(DEFAULT_VOUCHER_COLUMNS.length);
  });
});
