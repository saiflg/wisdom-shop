import type { BillingInterval } from "ems-control-client";

/**
 * Money and period arithmetic for billing.
 *
 * Every amount here is an integer count of minor units (kobo/cents), never
 * a float — `0.1 + 0.2 !== 0.3` in IEEE-754, and an invoice whose lines
 * don't sum to its total is a wrong invoice, not a rounding curiosity.
 */

export interface InvoiceLineInput {
  description: string;
  quantity: number;
  unitPriceCents: number;
}

export interface ComputedLine extends InvoiceLineInput {
  amountCents: number;
}

export interface InvoiceTotals {
  lines: ComputedLine[];
  subtotalCents: number;
  totalCents: number;
}

export function computeInvoiceTotals(lines: InvoiceLineInput[]): InvoiceTotals {
  const computed = lines.map((line) => {
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      throw new Error(`Invoice line "${line.description}" needs a whole quantity of at least 1`);
    }
    if (!Number.isInteger(line.unitPriceCents) || line.unitPriceCents < 0) {
      throw new Error(`Invoice line "${line.description}" needs a whole, non-negative unit price in minor units`);
    }
    return { ...line, amountCents: line.quantity * line.unitPriceCents };
  });

  const subtotalCents = computed.reduce((sum, line) => sum + line.amountCents, 0);
  // No tax or discount modelling yet, so total tracks subtotal exactly.
  // Kept as its own field so adding either later doesn't reshape the API.
  return { lines: computed, subtotalCents, totalCents: subtotalCents };
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, monthIndex: number): number {
  if (monthIndex === 1 && isLeapYear(year)) return 29;
  return DAYS_IN_MONTH[monthIndex] as number;
}

/**
 * Advances a date by one billing interval, clamping to the last day of the
 * target month.
 *
 * This is the part that bites: `new Date(2026, 0, 31)` plus one month via
 * naive `setMonth` lands on 3 March, because JavaScript rolls the overflow
 * forward. A school billed on the 31st would silently skip February
 * altogether and be charged early. Clamping instead gives 28 (or 29) Feb,
 * which is what every billing system does.
 *
 * Uses UTC throughout so a server timezone change can't shift a period
 * boundary by a day.
 */
export function addInterval(from: Date, interval: BillingInterval): Date {
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth();
  const day = from.getUTCDate();

  const targetYear = interval === "YEARLY" ? year + 1 : month === 11 ? year + 1 : year;
  const targetMonth = interval === "YEARLY" ? month : (month + 1) % 12;

  const clampedDay = Math.min(day, daysInMonth(targetYear, targetMonth));

  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      clampedDay,
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
      from.getUTCMilliseconds(),
    ),
  );
}

/** The period a new or renewing subscription runs for, starting at `start`. */
export function periodFor(start: Date, interval: BillingInterval): { start: Date; end: Date } {
  return { start, end: addInterval(start, interval) };
}

/** `INV-000001`. Zero-padded so invoice numbers sort lexicographically. */
export function formatInvoiceNumber(sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error("Invoice sequence must be a positive whole number");
  }
  return `INV-${String(sequence).padStart(6, "0")}`;
}

/** Display helper — minor units to a human string, without float maths. */
export function formatMoney(amountCents: number, currency: string): string {
  const negative = amountCents < 0;
  const absolute = Math.abs(amountCents);
  const major = Math.trunc(absolute / 100);
  const minor = absolute % 100;
  return `${negative ? "-" : ""}${currency} ${major.toLocaleString("en-US")}.${String(minor).padStart(2, "0")}`;
}
