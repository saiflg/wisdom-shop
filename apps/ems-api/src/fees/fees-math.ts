import type { FeeInvoiceStatus } from "ems-tenant-client";

/**
 * Money arithmetic for school fees.
 *
 * Every amount is an integer count of minor units (kobo/cents). Floats are
 * rejected rather than rounded: a parent's balance is not a place to discover
 * that `0.1 + 0.2 !== 0.3`.
 *
 * These functions are pure and know nothing about Prisma, so the rules that
 * decide what a family owes can be tested exhaustively without a database.
 */

export interface FeeLineInput {
  label: string;
  amountCents: number;
}

function assertMinorUnits(amountCents: number, what: string): void {
  if (!Number.isInteger(amountCents)) {
    throw new Error(`${what} must be a whole number of minor units, not ${amountCents}`);
  }
  if (amountCents < 0) {
    throw new Error(`${what} cannot be negative`);
  }
}

/** Sums fee lines. An empty structure totals 0, which is a valid invoice. */
export function computeFeeTotal(lines: FeeLineInput[]): number {
  let total = 0;
  for (const line of lines) {
    assertMinorUnits(line.amountCents, `Fee line "${line.label}"`);
    total += line.amountCents;
  }
  return total;
}

export function balanceOf(totalCents: number, paidCents: number): number {
  return totalCents - paidCents;
}

/**
 * The single place an invoice's status is decided.
 *
 * Status is *derived* from the money rather than set by hand anywhere a
 * payment happens, so the ledger and the badge can never disagree — the
 * classic finance bug is a PAID invoice with a balance still on it.
 *
 * The zero-total case matters: a full scholarship or a fully waived invoice
 * has nothing to pay, and leaving it ISSUED would park it in the arrears
 * report forever, chasing a family for nothing.
 */
export function deriveInvoiceStatus(
  totalCents: number,
  paidCents: number,
  current: FeeInvoiceStatus,
): FeeInvoiceStatus {
  // Terminal states are never recomputed. A voided invoice that somehow has
  // a payment against it is a problem to investigate, not to silently undo.
  if (current === "VOID") return "VOID";
  if (current === "DRAFT") return "DRAFT";

  if (paidCents >= totalCents) return "PAID";
  if (paidCents > 0) return "PARTIALLY_PAID";
  return "ISSUED";
}

export interface PaymentOutcome {
  paidCents: number;
  status: FeeInvoiceStatus;
}

/**
 * Applies a payment to an invoice, or explains why it can't be applied.
 *
 * Overpayment is refused rather than absorbed. A school that takes more than
 * it is owed has created a credit it now has to track, and credits are not
 * modelled yet — silently swallowing the excess would lose real money that
 * belongs to a family. Refusing is the honest failure.
 */
export function applyPayment(
  totalCents: number,
  paidCents: number,
  status: FeeInvoiceStatus,
  amountCents: number,
): PaymentOutcome {
  if (status === "VOID") {
    throw new Error("A voided invoice cannot take payments");
  }
  if (status === "DRAFT") {
    throw new Error("A draft invoice must be issued before it can take payments");
  }
  if (!Number.isInteger(amountCents)) {
    throw new Error(`A payment must be a whole number of minor units, not ${amountCents}`);
  }
  if (amountCents <= 0) {
    throw new Error("A payment must be greater than zero");
  }

  const outstanding = balanceOf(totalCents, paidCents);
  if (outstanding <= 0) {
    throw new Error("That invoice is already settled");
  }
  if (amountCents > outstanding) {
    throw new Error(
      `That payment is larger than the outstanding balance (${amountCents} against ${outstanding}); ` +
        "record it as separate payments or correct the invoice first",
    );
  }

  const nextPaid = paidCents + amountCents;
  return { paidCents: nextPaid, status: deriveInvoiceStatus(totalCents, nextPaid, status) };
}

/** `FEE-000001`. Zero-padded so numbers sort lexicographically. */
export function formatFeeInvoiceNumber(sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error("Invoice sequence must be a positive whole number");
  }
  return `FEE-${String(sequence).padStart(6, "0")}`;
}

export interface FeesSummary {
  invoiced: number;
  collected: number;
  outstanding: number;
  invoiceCount: number;
}

/**
 * Reports collected and outstanding separately rather than as one "revenue"
 * figure — invoiced is not received, and merging them flatters the dashboard.
 * VOID invoices are excluded entirely: they are not owed and were never paid.
 */
export function summariseFees(
  invoices: { totalCents: number; paidCents: number; status: FeeInvoiceStatus }[],
): FeesSummary {
  const live = invoices.filter((invoice) => invoice.status !== "VOID" && invoice.status !== "DRAFT");

  let invoiced = 0;
  let collected = 0;
  for (const invoice of live) {
    invoiced += invoice.totalCents;
    collected += invoice.paidCents;
  }

  return { invoiced, collected, outstanding: invoiced - collected, invoiceCount: live.length };
}
