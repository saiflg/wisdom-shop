export type WalletEntryKind = "TOPUP" | "REFUND" | "SPEND" | "ADJUSTMENT_CREDIT" | "ADJUSTMENT_DEBIT";

export interface WalletEntryLike {
  amountCents: number;
}

/**
 * Which way each kind moves the money.
 *
 * A caller never sends a sign. It sends "SPEND, 50000" and the direction is
 * decided here, so a minus sign that goes missing in a form, a JSON body or a
 * spreadsheet import cannot turn a deduction into a credit. That is also why
 * corrections are two kinds rather than one signed one.
 */
const DIRECTION: Record<WalletEntryKind, 1 | -1> = {
  TOPUP: 1,
  REFUND: -1,
  SPEND: -1,
  ADJUSTMENT_CREDIT: 1,
  ADJUSTMENT_DEBIT: -1,
};

export function directionOf(kind: WalletEntryKind): 1 | -1 {
  return DIRECTION[kind];
}

/**
 * The signed movement for a kind and a positive amount.
 *
 * Throws rather than coercing a bad amount: silently turning -500 into 500
 * would be the single most expensive kind of helpfulness in this file.
 */
export function signedAmount(kind: WalletEntryKind, amountCents: number): number {
  const problem = validateAmount(amountCents);
  if (problem) throw new Error(problem);
  return DIRECTION[kind] * amountCents;
}

/**
 * Why this amount cannot be used, or null when it can.
 *
 * Minor units only. A fractional kobo is not a rounding question, it is a
 * sign that somebody multiplied by a hundred somewhere they should not have,
 * and accepting it here would put the error beyond reach.
 */
export function validateAmount(amountCents: number): string | null {
  if (!Number.isFinite(amountCents)) return "That amount is not a number";
  if (!Number.isInteger(amountCents)) return "Amounts must be in whole minor units";
  if (amountCents <= 0) return "The amount must be above zero";
  if (amountCents > 1_000_000_00) return "That amount is larger than this screen will accept";
  return null;
}

/**
 * The balance implied by a set of entries.
 *
 * Used to reconcile against the stored column, not to decide a spend. If
 * these two ever disagree, the entries are the record of what happened and
 * the column is what needs explaining.
 */
export function balanceOf(entries: WalletEntryLike[]): number {
  return entries.reduce((total, entry) => total + entry.amountCents, 0);
}

/**
 * Whether a database error is the overdraft guard firing.
 *
 * The CHECK constraint is the thing that actually refuses an overdraft, so
 * its failure has to be turned back into a sentence a bursar can act on.
 * Matched on the constraint name: any other constraint failing is a
 * different problem and must not be reported as "not enough money", which
 * would send somebody looking for a payment that was never the issue.
 */
export function isOverdraft(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const haystack = [
    (error as { message?: unknown }).message,
    (error as { meta?: { message?: unknown } }).meta?.message,
    (error as { meta?: { constraint?: unknown } }).meta?.constraint,
  ]
    .filter((part): part is string => typeof part === "string")
    .join(" ");
  return haystack.includes("student_wallets_balance_not_negative");
}

/** Money for display: 123456 minor units reads as 1,234.56. */
export function formatAmount(amountCents: number): string {
  const sign = amountCents < 0 ? "-" : "";
  const absolute = Math.abs(amountCents);
  const major = Math.floor(absolute / 100).toLocaleString("en-NG");
  const minor = String(absolute % 100).padStart(2, "0");
  return `${sign}${major}.${minor}`;
}
