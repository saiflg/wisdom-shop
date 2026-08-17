/**
 * The receipt a family gets when money arrives.
 *
 * A payment confirmation is the one message a school sends that people keep.
 * It has to say four things without being read twice: how much arrived, what
 * it was for, what is still owed, and a number to quote when arguing about
 * it later.
 *
 * Pure, so the wording and the arithmetic can be argued with in a test
 * rather than by paying a school fee.
 */

/** `RCT-000001`. Zero-padded so receipts sort lexicographically, like invoices. */
export function formatReceiptNumber(sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error("Receipt sequence must be a positive whole number");
  }
  return `RCT-${String(sequence).padStart(6, "0")}`;
}

const METHOD_WORDS: Record<string, string> = {
  CASH: "cash",
  BANK_TRANSFER: "bank transfer",
  CARD: "card",
  CHEQUE: "cheque",
  GATEWAY: "online payment",
  OTHER: "other",
};

export function describeMethod(method: string): string {
  return METHOD_WORDS[method] ?? method.toLowerCase().replace(/_/g, " ");
}

export function formatAmount(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * What remains, in words rather than a number alone.
 *
 * "Balance: 0.00" makes a parent look twice to work out whether that is good
 * news. Saying "paid in full" does not.
 */
export function describeBalance(outstandingCents: number, currency: string): string {
  if (outstandingCents <= 0) return "This invoice is now paid in full.";
  return `${formatAmount(outstandingCents, currency)} is still outstanding.`;
}

export interface ReceiptInput {
  receiptNumber: string;
  invoiceNumber: string;
  studentName: string;
  amountCents: number;
  totalCents: number;
  paidCents: number;
  currency: string;
  method: string;
  receivedAt: Date;
}

export interface Receipt {
  receiptNumber: string;
  invoiceNumber: string;
  studentName: string;
  amountPaid: string;
  invoiceTotal: string;
  paidToDate: string;
  balance: string;
  balanceCents: number;
  method: string;
  paidOn: string;
  settled: boolean;
}

/** A date a person reads, not an ISO timestamp. */
export function formatReceiptDate(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export function buildReceipt(input: ReceiptInput): Receipt {
  // Clamped at zero: an overpayment recorded by hand must not print as a
  // negative balance, which reads like the school owes the family money.
  const outstanding = Math.max(0, input.totalCents - input.paidCents);

  return {
    receiptNumber: input.receiptNumber,
    invoiceNumber: input.invoiceNumber,
    studentName: input.studentName,
    amountPaid: formatAmount(input.amountCents, input.currency),
    invoiceTotal: formatAmount(input.totalCents, input.currency),
    paidToDate: formatAmount(input.paidCents, input.currency),
    balance: describeBalance(outstanding, input.currency),
    balanceCents: outstanding,
    method: describeMethod(input.method),
    paidOn: formatReceiptDate(input.receivedAt),
    settled: outstanding === 0,
  };
}
