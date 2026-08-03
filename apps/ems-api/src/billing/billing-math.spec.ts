import {
  addInterval,
  computeInvoiceTotals,
  daysInMonth,
  formatInvoiceNumber,
  formatMoney,
  periodFor,
} from "./billing-math";

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

describe("computeInvoiceTotals", () => {
  it("multiplies quantity by unit price and sums the lines", () => {
    const result = computeInvoiceTotals([
      { description: "Growth plan", quantity: 1, unitPriceCents: 4500000 },
      { description: "Extra seats", quantity: 12, unitPriceCents: 25000 },
    ]);
    expect(result.lines[0]?.amountCents).toBe(4500000);
    expect(result.lines[1]?.amountCents).toBe(300000);
    expect(result.subtotalCents).toBe(4800000);
    expect(result.totalCents).toBe(4800000);
  });

  it("always has a total equal to the sum of its lines", () => {
    // The invariant the e2e suite also checks from the outside.
    const result = computeInvoiceTotals([
      { description: "a", quantity: 3, unitPriceCents: 333 },
      { description: "b", quantity: 7, unitPriceCents: 101 },
      { description: "c", quantity: 1, unitPriceCents: 1 },
    ]);
    const summed = result.lines.reduce((sum, line) => sum + line.amountCents, 0);
    expect(result.subtotalCents).toBe(summed);
    expect(result.totalCents).toBe(summed);
  });

  it("stays exact where floating point would not", () => {
    // 0.1 + 0.2 in float is 0.30000000000000004; in minor units it is 30.
    const result = computeInvoiceTotals([
      { description: "ten cents", quantity: 1, unitPriceCents: 10 },
      { description: "twenty cents", quantity: 1, unitPriceCents: 20 },
    ]);
    expect(result.totalCents).toBe(30);
    expect(Number.isInteger(result.totalCents)).toBe(true);
  });

  it("handles an empty invoice as zero rather than NaN", () => {
    expect(computeInvoiceTotals([])).toEqual({ lines: [], subtotalCents: 0, totalCents: 0 });
  });

  it("allows a zero-priced line but rejects negative or fractional money", () => {
    expect(computeInvoiceTotals([{ description: "comp", quantity: 1, unitPriceCents: 0 }]).totalCents).toBe(0);
    expect(() => computeInvoiceTotals([{ description: "x", quantity: 1, unitPriceCents: -1 }])).toThrow();
    expect(() => computeInvoiceTotals([{ description: "x", quantity: 1, unitPriceCents: 10.5 }])).toThrow();
  });

  it("rejects a zero or fractional quantity", () => {
    expect(() => computeInvoiceTotals([{ description: "x", quantity: 0, unitPriceCents: 100 }])).toThrow();
    expect(() => computeInvoiceTotals([{ description: "x", quantity: 1.5, unitPriceCents: 100 }])).toThrow();
  });
});

describe("daysInMonth", () => {
  it("knows month lengths", () => {
    expect(daysInMonth(2026, 0)).toBe(31);
    expect(daysInMonth(2026, 3)).toBe(30);
  });

  it("handles leap years, including the century rules", () => {
    expect(daysInMonth(2026, 1)).toBe(28);
    expect(daysInMonth(2028, 1)).toBe(29);
    expect(daysInMonth(1900, 1)).toBe(28); // divisible by 100, not 400
    expect(daysInMonth(2000, 1)).toBe(29); // divisible by 400
  });
});

describe("addInterval", () => {
  it("advances a month normally", () => {
    expect(addInterval(utc(2026, 0, 15), "MONTHLY")).toEqual(utc(2026, 1, 15));
  });

  it("clamps 31 January to the end of February instead of overflowing into March", () => {
    // The bug this exists to prevent: naive setMonth gives 3 March, which
    // would bill the customer early and skip February entirely.
    expect(addInterval(utc(2026, 0, 31), "MONTHLY")).toEqual(utc(2026, 1, 28));
    expect(addInterval(utc(2028, 0, 31), "MONTHLY")).toEqual(utc(2028, 1, 29));
  });

  it("clamps 31 to 30 for short months", () => {
    expect(addInterval(utc(2026, 2, 31), "MONTHLY")).toEqual(utc(2026, 3, 30));
    expect(addInterval(utc(2026, 4, 31), "MONTHLY")).toEqual(utc(2026, 5, 30));
  });

  it("rolls December into the next January", () => {
    expect(addInterval(utc(2026, 11, 15), "MONTHLY")).toEqual(utc(2027, 0, 15));
  });

  it("advances a year, clamping 29 February on a non-leap target", () => {
    expect(addInterval(utc(2026, 5, 10), "YEARLY")).toEqual(utc(2027, 5, 10));
    expect(addInterval(utc(2028, 1, 29), "YEARLY")).toEqual(utc(2029, 1, 28));
  });

  it("never produces a date in a month it did not intend", () => {
    // Walk every start-of-month-end across a year and assert the month
    // advanced by exactly one, which is what overflow would break.
    for (let month = 0; month < 12; month++) {
      const start = utc(2026, month, daysInMonth(2026, month));
      const next = addInterval(start, "MONTHLY");
      expect(next.getUTCMonth()).toBe((month + 1) % 12);
    }
  });

  it("preserves the time of day", () => {
    const start = new Date(Date.UTC(2026, 0, 15, 9, 30, 15, 250));
    const next = addInterval(start, "MONTHLY");
    expect(next.getUTCHours()).toBe(9);
    expect(next.getUTCMinutes()).toBe(30);
    expect(next.getUTCSeconds()).toBe(15);
    expect(next.getUTCMilliseconds()).toBe(250);
  });
});

describe("periodFor", () => {
  it("returns a period ending one interval after it starts", () => {
    const { start, end } = periodFor(utc(2026, 0, 1), "MONTHLY");
    expect(start).toEqual(utc(2026, 0, 1));
    expect(end).toEqual(utc(2026, 1, 1));
  });

  it("never returns an end at or before its start", () => {
    for (let month = 0; month < 12; month++) {
      for (const interval of ["MONTHLY", "YEARLY"] as const) {
        const { start, end } = periodFor(utc(2026, month, 28), interval);
        expect(end.getTime()).toBeGreaterThan(start.getTime());
      }
    }
  });
});

describe("formatInvoiceNumber", () => {
  it("zero-pads so numbers sort lexicographically", () => {
    expect(formatInvoiceNumber(1)).toBe("INV-000001");
    expect(formatInvoiceNumber(42)).toBe("INV-000042");
    expect(["INV-000002", "INV-000010", "INV-000001"].sort()).toEqual([
      "INV-000001",
      "INV-000002",
      "INV-000010",
    ]);
  });

  it("does not truncate past six digits", () => {
    expect(formatInvoiceNumber(1234567)).toBe("INV-1234567");
  });

  it("rejects a non-positive or fractional sequence", () => {
    expect(() => formatInvoiceNumber(0)).toThrow();
    expect(() => formatInvoiceNumber(-1)).toThrow();
    expect(() => formatInvoiceNumber(1.5)).toThrow();
  });
});

describe("formatMoney", () => {
  it("renders minor units as major with two decimals", () => {
    expect(formatMoney(4500000, "NGN")).toBe("NGN 45,000.00");
    expect(formatMoney(1, "USD")).toBe("USD 0.01");
    expect(formatMoney(0, "USD")).toBe("USD 0.00");
  });

  it("keeps trailing zeros rather than dropping them", () => {
    expect(formatMoney(1050, "USD")).toBe("USD 10.50");
    expect(formatMoney(1000, "USD")).toBe("USD 10.00");
  });

  it("handles negatives without mangling the sign", () => {
    expect(formatMoney(-2550, "USD")).toBe("-USD 25.50");
  });
});
