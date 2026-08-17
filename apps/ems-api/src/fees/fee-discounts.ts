/**
 * Money taken off a family's bill, and the standing awards that produce it.
 *
 * Two things share one mechanism, deliberately. A **discount** is a reduction
 * on one invoice. A **scholarship** is a standing entitlement that produces
 * one on every invoice raised while it runs. Modelling them separately would
 * mean two ways to reduce a bill, two ways to get the arithmetic wrong, and
 * two places to look when a family asks why they were charged what they were.
 *
 * The invoice's `totalCents` stays what it has always been: the amount
 * payable. A discount lowers it and records how much was taken off, so the
 * gross is always recoverable and every existing payment rule keeps working
 * untouched.
 *
 * Pure, because this is the arithmetic that decides what a family owes.
 */

export type DiscountKind = "PERCENT" | "FIXED";

export interface DiscountInput {
  kind: DiscountKind;
  /** Percentage points (0–100) for PERCENT; minor units for FIXED. */
  value: number;
}

/**
 * What a discount is worth against a given gross.
 *
 * Percentages are taken against the **gross** — what the fee lines add up to
 * — not against whatever is left after other discounts. Two 10% awards on a
 * 100,000 bill come to 20,000, not 19,000, and a school explaining a bill to
 * a parent should not have to explain an order of application as well.
 *
 * Rounded to the nearest minor unit, then capped by the caller. Rounding is
 * arithmetic; the cap is policy, and they are kept apart.
 */
export function discountValue(input: DiscountInput, grossCents: number): number {
  if (!Number.isInteger(grossCents) || grossCents < 0) {
    throw new Error("A gross amount must be a whole number of minor units");
  }

  if (input.kind === "FIXED") {
    if (!Number.isInteger(input.value)) {
      throw new Error("A fixed discount must be a whole number of minor units");
    }
    return Math.max(0, input.value);
  }

  if (input.value < 0 || input.value > 100) {
    throw new Error("A percentage discount must be between 0 and 100");
  }
  return Math.round((grossCents * input.value) / 100);
}

export interface InvoiceForDiscount {
  /** What is currently payable, before this discount. */
  totalCents: number;
  /** Already taken off by earlier discounts. */
  discountCents: number;
  paidCents: number;
  status: string;
}

export interface DiscountOutcome {
  /** The new payable amount. */
  totalCents: number;
  /** The running total taken off. */
  discountCents: number;
  /** What this discount was actually worth after capping. */
  appliedCents: number;
}

/** The gross this invoice started from: payable plus everything already given. */
export function grossOf(invoice: Pick<InvoiceForDiscount, "totalCents" | "discountCents">): number {
  return invoice.totalCents + invoice.discountCents;
}

/**
 * Why a discount cannot be applied, or null.
 *
 * The one that matters: a discount that would take the payable amount below
 * what the family has ALREADY PAID. That does not reduce a bill, it creates a
 * credit — money the school now owes back — and credits are not modelled
 * here, exactly as overpayment is refused rather than absorbed. Refusing is
 * the honest failure.
 */
export function discountProblem(invoice: InvoiceForDiscount, input: DiscountInput): string | null {
  if (invoice.status === "VOID") return "A voided invoice cannot be discounted.";
  if (invoice.status === "PAID") {
    return "That invoice is already settled. Discounting it now would mean refunding money, which has to be handled separately.";
  }

  if (input.kind === "PERCENT" && (input.value <= 0 || input.value > 100)) {
    return "A percentage must be between 0 and 100.";
  }
  if (input.kind === "FIXED" && (!Number.isInteger(input.value) || input.value <= 0)) {
    return "A discount must be a whole amount greater than zero.";
  }

  const worth = discountValue(input, grossOf(invoice));
  if (worth <= 0) return "That discount comes to nothing.";

  const room = invoice.totalCents - invoice.paidCents;
  if (room <= 0) {
    return "There is nothing left to discount on that invoice.";
  }
  if (worth > room) {
    return `That is more than the family still owes. The most that can be taken off is ${room / 100}.`;
  }

  return null;
}

/**
 * Applies a discount, having checked it.
 *
 * Never lets the payable amount fall below what has been paid — belt and
 * braces with `discountProblem`, because this is the function that decides
 * what a family owes and a caller that forgets to check must not be able to
 * create a refund by accident.
 */
export function applyDiscount(invoice: InvoiceForDiscount, input: DiscountInput): DiscountOutcome {
  const problem = discountProblem(invoice, input);
  if (problem) throw new Error(problem);

  const worth = discountValue(input, grossOf(invoice));
  const capped = Math.min(worth, invoice.totalCents - invoice.paidCents);

  return {
    totalCents: invoice.totalCents - capped,
    discountCents: invoice.discountCents + capped,
    appliedCents: capped,
  };
}

/** Undoing one. The gross is restored; payments are untouched. */
export function removeDiscount(invoice: InvoiceForDiscount, appliedCents: number): DiscountOutcome {
  if (appliedCents > invoice.discountCents) {
    throw new Error("That discount is larger than the total discounted on this invoice");
  }
  return {
    totalCents: invoice.totalCents + appliedCents,
    discountCents: invoice.discountCents - appliedCents,
    appliedCents: -appliedCents,
  };
}

/** "20% off" / "NGN 5,000.00 off" — what a parent reads on the invoice. */
export function describeDiscount(input: DiscountInput, currency: string): string {
  if (input.kind === "PERCENT") return `${input.value}% off`;
  return `${currency} ${(input.value / 100).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} off`;
}

/* --------------------------------------------------------------- awards */

export interface ScholarshipLike {
  kind: DiscountKind;
  value: number;
  startDate: Date | null;
  endDate: Date | null;
  status: string;
}

/**
 * Whether a standing award should produce a discount on an invoice raised
 * today.
 *
 * Dates are inclusive at both ends: an award running "to 31 July" covers the
 * invoice raised on 31 July. An award with no end date runs until it is
 * withdrawn, which is the common case for a full scholarship.
 */
export function scholarshipApplies(award: ScholarshipLike, on: Date): boolean {
  if (award.status !== "ACTIVE") return false;
  const day = on.getTime();
  if (award.startDate && day < startOfDay(award.startDate).getTime()) return false;
  if (award.endDate && day > endOfDay(award.endDate).getTime()) return false;
  return true;
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setUTCHours(23, 59, 59, 999);
  return copy;
}

export function describeAward(award: ScholarshipLike, currency: string): string {
  const amount = describeDiscount({ kind: award.kind, value: award.value }, currency);
  if (award.status !== "ACTIVE") return `${amount} — withdrawn`;
  if (award.endDate) return `${amount} until ${award.endDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`;
  return `${amount}, ongoing`;
}
