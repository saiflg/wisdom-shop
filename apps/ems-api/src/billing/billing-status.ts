import type { InvoiceStatus, SubscriptionStatus } from "ems-control-client";

/**
 * Billing state machines, in the same shape as school-lifecycle.ts.
 *
 * These matter more than they look: an invoice that can go back from PAID
 * to DRAFT lets someone silently rewrite a settled financial record, and a
 * CANCELED subscription that can be edited in place loses the fact that it
 * ever ended.
 */

export const SUBSCRIPTION_TRANSITIONS: Readonly<Record<SubscriptionStatus, readonly SubscriptionStatus[]>> = {
  TRIALING: ["ACTIVE", "CANCELED"],
  ACTIVE: ["PAST_DUE", "CANCELED"],
  PAST_DUE: ["ACTIVE", "CANCELED"],
  // Terminal. Restarting a relationship creates a new subscription rather
  // than resurrecting the old one, so the cancellation stays on the record.
  CANCELED: [],
};

/**
 * DRAFT is the only editable state. Once an invoice is OPEN it has been
 * sent to a customer, so it can only be settled or voided — never amended
 * and never deleted.
 */
export const INVOICE_TRANSITIONS: Readonly<Record<InvoiceStatus, readonly InvoiceStatus[]>> = {
  DRAFT: ["OPEN", "VOID"],
  OPEN: ["PAID", "VOID", "UNCOLLECTIBLE"],
  PAID: [],
  VOID: [],
  UNCOLLECTIBLE: ["PAID"],
};

export function canTransitionSubscription(from: SubscriptionStatus, to: SubscriptionStatus): boolean {
  return SUBSCRIPTION_TRANSITIONS[from].includes(to);
}

export function canTransitionInvoice(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return INVOICE_TRANSITIONS[from].includes(to);
}

export function explainSubscriptionRefusal(from: SubscriptionStatus, to: SubscriptionStatus): string | null {
  if (canTransitionSubscription(from, to)) return null;
  if (from === to) return `This subscription is already ${from.toLowerCase().replace("_", " ")}`;
  if (from === "CANCELED") return "This subscription was cancelled — create a new one instead of reviving it";
  return `A subscription cannot go from ${from.toLowerCase()} to ${to.toLowerCase()}`;
}

export function explainInvoiceRefusal(from: InvoiceStatus, to: InvoiceStatus): string | null {
  if (canTransitionInvoice(from, to)) return null;
  if (from === to) return `This invoice is already ${from.toLowerCase()}`;
  if (from === "PAID") return "This invoice is paid — issue a credit note rather than changing it";
  if (from === "VOID") return "This invoice was voided and cannot be changed";
  return `An invoice cannot go from ${from.toLowerCase()} to ${to.toLowerCase()}`;
}

/** Only a DRAFT invoice may have its lines or amounts edited. */
export function isInvoiceEditable(status: InvoiceStatus): boolean {
  return status === "DRAFT";
}
