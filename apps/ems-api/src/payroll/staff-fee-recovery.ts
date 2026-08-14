/**
 * Recovering a staff member's own children's school fees from their salary.
 *
 * The school pays the teacher and settles their children's bill in one step,
 * instead of paying in full and then chasing the money back. That convenience
 * is only safe if three things hold, and each has been got wrong by real
 * payroll systems:
 *
 *   1. Never recover more than the family actually owes. Money taken against
 *      a bill that does not exist is money taken from somebody's wages.
 *
 *   2. Never take more in a month than the agreed amount. A teacher whose
 *      children owe a whole term must not lose an entire month's pay because
 *      a balance happened to be large.
 *
 *   3. Apply it to the oldest bill first. A part payment spread evenly across
 *      four invoices leaves four invoices unpaid; applied oldest-first it
 *      leaves three, and the family stops receiving arrears letters about the
 *      one that is now settled.
 *
 * Pure, so all three can be proven rather than discovered in a payslip.
 */

export interface OutstandingInvoice {
  invoiceId: string;
  studentProfileId: string;
  studentName: string;
  invoiceNumber: string;
  outstandingCents: number;
  currency: string;
  /** Null for an invoice with no due date; sorted after those that have one. */
  dueDate: Date | null;
  issuedAt: Date | null;
}

export interface Allocation {
  invoiceId: string;
  studentProfileId: string;
  studentName: string;
  invoiceNumber: string;
  amountCents: number;
}

export interface RecoveryPlan {
  /** What to deduct from this month's salary, in total. */
  totalCents: number;
  allocations: Allocation[];
  /** What the family still owes after this deduction. */
  remainingCents: number;
  /** Everything owed before it. */
  outstandingCents: number;
}

/**
 * Oldest first.
 *
 * By due date, falling back to when the invoice was issued. An invoice with
 * neither sorts last: it cannot be overdue if nobody said when it was due, and
 * guessing a date to sort by would silently prioritise it over a bill that
 * genuinely is late.
 */
export function oldestFirst(a: OutstandingInvoice, b: OutstandingInvoice): number {
  const aKey = a.dueDate?.getTime() ?? a.issuedAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const bKey = b.dueDate?.getTime() ?? b.issuedAt?.getTime() ?? Number.POSITIVE_INFINITY;
  if (aKey !== bKey) return aKey - bKey;
  // Stable tie-break so two invoices dated the same day do not swap order
  // between runs and make a plan look different each time it is previewed.
  return a.invoiceNumber.localeCompare(b.invoiceNumber);
}

/**
 * Work out this month's deduction and where it goes.
 *
 * `monthlyCapCents` of zero means the arrangement is off — not "take
 * everything". A default that emptied somebody's salary would be the worst
 * possible reading of an unset field.
 */
export function planRecovery(
  invoices: OutstandingInvoice[],
  monthlyCapCents: number,
): RecoveryPlan {
  const owing = invoices.filter((invoice) => invoice.outstandingCents > 0);
  const outstandingCents = owing.reduce((total, i) => total + i.outstandingCents, 0);

  if (monthlyCapCents <= 0 || outstandingCents === 0) {
    return { totalCents: 0, allocations: [], remainingCents: outstandingCents, outstandingCents };
  }

  const allocations: Allocation[] = [];
  let left = Math.min(monthlyCapCents, outstandingCents);

  for (const invoice of [...owing].sort(oldestFirst)) {
    if (left <= 0) break;
    const amountCents = Math.min(left, invoice.outstandingCents);
    allocations.push({
      invoiceId: invoice.invoiceId,
      studentProfileId: invoice.studentProfileId,
      studentName: invoice.studentName,
      invoiceNumber: invoice.invoiceNumber,
      amountCents,
    });
    left -= amountCents;
  }

  const totalCents = allocations.reduce((total, a) => total + a.amountCents, 0);

  return {
    totalCents,
    allocations,
    remainingCents: outstandingCents - totalCents,
    outstandingCents,
  };
}

/**
 * Whether a family's invoices can be recovered against at all.
 *
 * Mixed currencies are refused rather than guessed at. A salary is paid in one
 * currency, and deciding on the school's behalf which of two currencies a
 * deduction settles would be inventing an exchange rate.
 */
export function checkCurrencies(
  invoices: OutstandingInvoice[],
  salaryCurrency: string,
): { ok: true } | { ok: false; reason: string } {
  const currencies = new Set(
    invoices.filter((i) => i.outstandingCents > 0).map((i) => i.currency.toUpperCase()),
  );
  if (currencies.size === 0) return { ok: true };

  const salary = salaryCurrency.toUpperCase();
  const foreign = [...currencies].filter((c) => c !== salary);
  if (foreign.length > 0) {
    return {
      ok: false,
      reason: `These fees are billed in ${foreign.join(", ")} but salary is paid in ${salary}. Settle them separately.`,
    };
  }
  return { ok: true };
}

/**
 * The reference written on each fee payment.
 *
 * This is the idempotency key. The fee_payments table is unique on
 * (invoiceId, reference), so a payroll run applied twice is refused by the
 * database rather than by a caller remembering to check — the same guard the
 * gateway webhooks rely on.
 */
export function payrollPaymentReference(runId: string): string {
  return `payroll:${runId}`;
}
