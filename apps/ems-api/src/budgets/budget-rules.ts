export interface BudgetLineLike {
  category: string;
  amountCents: number;
}

export interface SpendByCategory {
  category: string;
  amountCents: number;
}

export interface BudgetComparisonRow {
  /** The category as the budget spells it, or as the spending does when nothing was budgeted. */
  category: string;
  budgetedCents: number;
  spentCents: number;
  /** Budget less spending. Negative means overspent; that is the point. */
  remainingCents: number;
  overspent: boolean;
  /** True when money went out under a category nobody budgeted for. */
  unbudgeted: boolean;
}

export interface BudgetComparison {
  rows: BudgetComparisonRow[];
  budgetedCents: number;
  spentCents: number;
  remainingCents: number;
  /** Spending that matched no budget line at all. */
  unbudgetedCents: number;
}

/**
 * How a category name is matched between a budget and what was spent.
 *
 * Expense categories are free text, typed by whoever raised the request. A
 * budget line saying "Diesel" and a receipt saying "diesel " have to be the
 * same category, or the budget cheerfully reports the whole allowance
 * unspent while the money is out of the door. Case and surrounding space are
 * the two ways people differ; nothing cleverer is attempted, because a budget
 * that guesses "Fuel" means "Diesel" would be worse than one that says
 * plainly that "Fuel" was not budgeted for.
 */
export function categoryKey(category: string): string {
  return category.trim().toLowerCase();
}

/**
 * A budget beside what was actually spent.
 *
 * Spending that matches no line is not dropped and not folded into a total.
 * It gets its own row, marked `unbudgeted`. A budget screen that quietly
 * ignored money spent outside it would report a school comfortably within
 * budget while it was not, which is the one thing this screen must never do.
 */
export function compareToActual(lines: BudgetLineLike[], spend: SpendByCategory[]): BudgetComparison {
  const spentByKey = new Map<string, number>();
  const spellingByKey = new Map<string, string>();
  for (const item of spend) {
    const key = categoryKey(item.category);
    if (!key) continue;
    spentByKey.set(key, (spentByKey.get(key) ?? 0) + Math.max(0, item.amountCents));
    if (!spellingByKey.has(key)) spellingByKey.set(key, item.category.trim());
  }

  const rows: BudgetComparisonRow[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const key = categoryKey(line.category);
    if (!key) continue;
    seen.add(key);

    const budgetedCents = Math.max(0, line.amountCents);
    const spentCents = spentByKey.get(key) ?? 0;
    rows.push({
      // The budget's spelling wins where there is one: it is the version a
      // school chose deliberately rather than typed onto a receipt.
      category: line.category.trim(),
      budgetedCents,
      spentCents,
      remainingCents: budgetedCents - spentCents,
      overspent: spentCents > budgetedCents,
      unbudgeted: false,
    });
  }

  for (const [key, spentCents] of spentByKey) {
    if (seen.has(key)) continue;
    rows.push({
      category: spellingByKey.get(key) ?? key,
      budgetedCents: 0,
      spentCents,
      remainingCents: -spentCents,
      overspent: true,
      unbudgeted: true,
    });
  }

  // Trouble first: overspent lines, then the largest spend. A budget is read
  // to find what has gone wrong, not alphabetically.
  rows.sort(
    (a, b) =>
      Number(b.overspent) - Number(a.overspent) ||
      b.spentCents - a.spentCents ||
      a.category.localeCompare(b.category),
  );

  const budgetedCents = rows.reduce((total, row) => total + row.budgetedCents, 0);
  const spentCents = rows.reduce((total, row) => total + row.spentCents, 0);
  const unbudgetedCents = rows.reduce((total, row) => total + (row.unbudgeted ? row.spentCents : 0), 0);

  return {
    rows,
    budgetedCents,
    spentCents,
    remainingCents: budgetedCents - spentCents,
    unbudgetedCents,
  };
}

/**
 * Why these lines cannot be saved, or null.
 *
 * Two categories that differ only by capitals are the failure worth
 * refusing: they would each get their own line, spending would land on
 * whichever matched first, and the other would sit at zero looking
 * deliberately unspent.
 */
export function validateBudgetLines(lines: BudgetLineLike[]): string | null {
  if (lines.length === 0) return "A budget needs at least one line";

  const keys = new Set<string>();
  for (const line of lines) {
    const key = categoryKey(line.category);
    if (!key) return "Every line needs a category";
    if (keys.has(key)) return `There are two lines for "${line.category.trim()}"`;
    keys.add(key);

    if (!Number.isInteger(line.amountCents)) return "Amounts must be in whole minor units";
    if (line.amountCents < 0) return "A budget line cannot be negative";
  }
  return null;
}

/** Why this period makes no sense, or null. */
export function validatePeriod(from: Date, to: Date): string | null {
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return "Those dates are not valid";
  if (to.getTime() < from.getTime()) return "A budget cannot end before it starts";
  return null;
}
