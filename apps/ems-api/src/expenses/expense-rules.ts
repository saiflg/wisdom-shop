export type ExpenseStatus = "REQUESTED" | "APPROVED" | "PAID" | "REJECTED";

export interface Actor {
  isAdmin: boolean;
  /** Whether this is the person who asked for the money. */
  isRequester: boolean;
}

export interface ExpenseLike {
  category: string;
  amountCents: number;
  status: ExpenseStatus;
}

/**
 * Whether an expense may move from one state to another, and why not if not.
 *
 * The rule this exists for is segregation of duties: **nobody approves their
 * own spending.** It is the oldest control in bookkeeping and the one a
 * school with three administrators is most likely to lose, because the person
 * who needs the diesel and the person who can approve it are often the same
 * person. Expressed here rather than as a role check on a route, because a
 * route reached by an admin who is also the requester is exactly the case
 * `@Roles("SCHOOL_ADMIN")` waves through.
 */
export function checkTransition(from: ExpenseStatus, to: ExpenseStatus, actor: Actor): string | null {
  if (from === to) return "That expense is already in that state";
  if (from === "PAID") return "That expense has already been paid";

  switch (to) {
    case "APPROVED":
      if (from !== "REQUESTED" && from !== "REJECTED") return "Only a requested expense can be approved";
      if (!actor.isAdmin) return "Only an administrator can approve spending";
      if (actor.isRequester) return "Spending cannot be approved by the person who asked for it";
      return null;

    case "REJECTED":
      if (from !== "REQUESTED" && from !== "APPROVED") return "Only a requested expense can be turned down";
      if (!actor.isAdmin) return "Only an administrator can turn down spending";
      if (actor.isRequester) return "Spending cannot be decided by the person who asked for it";
      return null;

    case "PAID":
      // Paying out on something nobody approved is the failure this whole
      // sequence exists to prevent, so it is checked even though the screen
      // does not offer the button.
      if (from !== "APPROVED") return "Money cannot be paid out on an expense nobody approved";
      if (!actor.isAdmin) return "Only an administrator can record a payment";
      return null;

    case "REQUESTED":
      if (from !== "REJECTED") return "Only a rejected expense can be asked for again";
      if (!actor.isRequester && !actor.isAdmin) return "Only the person who asked can raise it again";
      return null;

    default:
      return "That is not a state an expense can be in";
  }
}

/** The moves this person can make, derived from the rule that decides. */
export function availableTransitions(from: ExpenseStatus, actor: Actor): ExpenseStatus[] {
  const all: ExpenseStatus[] = ["REQUESTED", "APPROVED", "PAID", "REJECTED"];
  return all.filter((to) => checkTransition(from, to, actor) === null);
}

/**
 * Whether this expense is money the school has actually committed.
 *
 * A request nobody has approved is not spending — it is somebody asking.
 * Counting it would overstate what a school has spent, which is the number a
 * head teacher makes decisions on, and it would overstate it in the direction
 * that makes them cut something they did not need to cut.
 */
export function isCommitted(status: ExpenseStatus): boolean {
  return status === "APPROVED" || status === "PAID";
}

export interface ExpenseSummary {
  /** Approved and paid together: money the school has committed. */
  committedCents: number;
  /** Out of the door already. */
  paidCents: number;
  /** Approved but not yet paid — what is owed. */
  outstandingCents: number;
  /** Asked for and not yet decided. Not spending, shown separately. */
  pendingCents: number;
  byCategory: { category: string; amountCents: number }[];
}

/**
 * What a set of expenses adds up to.
 *
 * Four numbers rather than one, because they answer different questions and
 * a single "total" would have to pick one silently. `byCategory` counts only
 * committed money, for the same reason as above.
 */
export function summariseExpenses(expenses: ExpenseLike[]): ExpenseSummary {
  let committedCents = 0;
  let paidCents = 0;
  let pendingCents = 0;
  const categories = new Map<string, number>();

  for (const expense of expenses) {
    const amount = Math.max(0, expense.amountCents);

    if (expense.status === "REQUESTED") {
      pendingCents += amount;
      continue;
    }
    if (expense.status === "REJECTED") continue;

    committedCents += amount;
    if (expense.status === "PAID") paidCents += amount;

    const key = expense.category.trim();
    if (key) categories.set(key, (categories.get(key) ?? 0) + amount);
  }

  const byCategory = [...categories.entries()]
    .map(([category, amountCents]) => ({ category, amountCents }))
    // Largest first — the question is always "what is the money going on" —
    // with ties broken by name so the order never reshuffles between loads.
    .sort((a, b) => b.amountCents - a.amountCents || a.category.localeCompare(b.category));

  return {
    committedCents,
    paidCents,
    outstandingCents: committedCents - paidCents,
    pendingCents,
    byCategory,
  };
}

/**
 * Why this amount cannot be recorded, or null.
 *
 * Minor units only, and positive. An expense is money leaving; a negative
 * one is a refund, which is a different thing that should be recorded as
 * what it is rather than as spending with a minus in front of it.
 */
export function validateExpenseAmount(amountCents: number): string | null {
  if (!Number.isFinite(amountCents)) return "That amount is not a number";
  if (!Number.isInteger(amountCents)) return "Amounts must be in whole minor units";
  if (amountCents <= 0) return "The amount must be above zero";
  if (amountCents > 1_000_000_000) return "That amount is larger than this screen will accept";
  return null;
}
