import {
  categoryKey,
  compareToActual,
  validateBudgetLines,
  validatePeriod,
  type BudgetLineLike,
  type SpendByCategory,
} from "./budget-rules";

const LINES: BudgetLineLike[] = [
  { category: "Diesel", amountCents: 100_000_00 },
  { category: "Stationery", amountCents: 20_000_00 },
  { category: "Repairs", amountCents: 50_000_00 },
];

describe("categoryKey", () => {
  it("ignores case and surrounding space", () => {
    // Expense categories are typed onto receipts by whoever raised them.
    expect(categoryKey("Diesel")).toBe(categoryKey("diesel "));
    expect(categoryKey("  STATIONERY")).toBe(categoryKey("Stationery"));
  });

  it("does not try to be clever about different words", () => {
    // A budget that guessed "Fuel" means "Diesel" would be worse than one
    // that says plainly that Fuel was not budgeted for.
    expect(categoryKey("Fuel")).not.toBe(categoryKey("Diesel"));
  });
});

describe("compareToActual", () => {
  it("puts spending beside its budget", () => {
    const result = compareToActual(LINES, [{ category: "Diesel", amountCents: 60_000_00 }]);
    const diesel = result.rows.find((row) => row.category === "Diesel");
    expect(diesel).toMatchObject({
      budgetedCents: 100_000_00,
      spentCents: 60_000_00,
      remainingCents: 40_000_00,
      overspent: false,
    });
  });

  // The failure this module exists to prevent.
  it("matches a receipt typed in different capitals", () => {
    // Otherwise the budget reports the whole allowance unspent while the
    // money is out of the door.
    const result = compareToActual(LINES, [{ category: "diesel ", amountCents: 60_000_00 }]);
    expect(result.rows.find((row) => row.category === "Diesel")?.spentCents).toBe(60_000_00);
    expect(result.unbudgetedCents).toBe(0);
  });

  it("marks a line as overspent when it is", () => {
    const result = compareToActual(LINES, [{ category: "Stationery", amountCents: 25_000_00 }]);
    const row = result.rows.find((r) => r.category === "Stationery");
    expect(row?.overspent).toBe(true);
    expect(row?.remainingCents).toBe(-5_000_00);
  });

  // The other thing it must never do.
  it("never hides money spent under a category nobody budgeted for", () => {
    // A budget screen that dropped this would report a school comfortably
    // within budget while it was not.
    const result = compareToActual(LINES, [{ category: "Legal fees", amountCents: 30_000_00 }]);
    const row = result.rows.find((r) => r.category === "Legal fees");
    expect(row).toMatchObject({ budgetedCents: 0, spentCents: 30_000_00, unbudgeted: true, overspent: true });
    expect(result.unbudgetedCents).toBe(30_000_00);
    expect(result.spentCents).toBe(30_000_00);
  });

  it("adds up several receipts in the same category", () => {
    const spend: SpendByCategory[] = [
      { category: "Diesel", amountCents: 30_000_00 },
      { category: "diesel", amountCents: 25_000_00 },
    ];
    expect(compareToActual(LINES, spend).rows.find((r) => r.category === "Diesel")?.spentCents).toBe(55_000_00);
  });

  it("keeps the budget's own spelling", () => {
    // The version the school chose deliberately, not the one typed onto a
    // receipt at the fuel station.
    const result = compareToActual([{ category: "Diesel", amountCents: 100_00 }], [
      { category: "DIESEL", amountCents: 50_00 },
    ]);
    expect(result.rows[0].category).toBe("Diesel");
  });

  it("shows trouble first", () => {
    // A budget is read to find what has gone wrong, not alphabetically.
    const result = compareToActual(LINES, [
      { category: "Diesel", amountCents: 10_000_00 },
      { category: "Stationery", amountCents: 25_000_00 },
    ]);
    expect(result.rows[0].category).toBe("Stationery");
    expect(result.rows[0].overspent).toBe(true);
  });

  it("totals budget, spend and what is left", () => {
    const result = compareToActual(LINES, [
      { category: "Diesel", amountCents: 60_000_00 },
      { category: "Repairs", amountCents: 10_000_00 },
    ]);
    expect(result.budgetedCents).toBe(170_000_00);
    expect(result.spentCents).toBe(70_000_00);
    expect(result.remainingCents).toBe(100_000_00);
  });

  it("copes with a budget nothing has been spent against", () => {
    const result = compareToActual(LINES, []);
    expect(result.spentCents).toBe(0);
    expect(result.remainingCents).toBe(170_000_00);
    expect(result.rows.every((row) => !row.overspent)).toBe(true);
  });

  it("copes with spending and no budget at all", () => {
    const result = compareToActual([], [{ category: "Diesel", amountCents: 5_000_00 }]);
    expect(result.budgetedCents).toBe(0);
    expect(result.unbudgetedCents).toBe(5_000_00);
  });
});

describe("validateBudgetLines", () => {
  it("accepts an ordinary budget", () => {
    expect(validateBudgetLines(LINES)).toBeNull();
  });

  it("refuses two lines that differ only by capitals", () => {
    // They would each get a line, spending would land on whichever matched
    // first, and the other would sit at zero looking deliberately unspent.
    expect(
      validateBudgetLines([
        { category: "Diesel", amountCents: 100_00 },
        { category: "diesel", amountCents: 200_00 },
      ]),
    ).toBe('There are two lines for "diesel"');
  });

  it("allows a line of zero", () => {
    // "We are budgeting nothing for this" is a real decision, and different
    // from not having a line at all.
    expect(validateBudgetLines([{ category: "Trips", amountCents: 0 }])).toBeNull();
  });

  it("refuses a negative line and a fractional one", () => {
    expect(validateBudgetLines([{ category: "Diesel", amountCents: -1 }])).toBe(
      "A budget line cannot be negative",
    );
    expect(validateBudgetLines([{ category: "Diesel", amountCents: 10.5 }])).toBe(
      "Amounts must be in whole minor units",
    );
  });

  it("refuses a blank category and an empty budget", () => {
    expect(validateBudgetLines([{ category: "  ", amountCents: 100 }])).toBe("Every line needs a category");
    expect(validateBudgetLines([])).toBe("A budget needs at least one line");
  });
});

describe("validatePeriod", () => {
  it("accepts a sensible term", () => {
    expect(validatePeriod(new Date("2026-09-01"), new Date("2026-12-15"))).toBeNull();
  });

  it("refuses a period that ends before it starts", () => {
    expect(validatePeriod(new Date("2026-12-15"), new Date("2026-09-01"))).toBe(
      "A budget cannot end before it starts",
    );
  });

  it("accepts a single day", () => {
    expect(validatePeriod(new Date("2026-09-01"), new Date("2026-09-01"))).toBeNull();
  });

  it("refuses dates that are not dates", () => {
    expect(validatePeriod(new Date("nonsense"), new Date("2026-09-01"))).toBe("Those dates are not valid");
  });
});
