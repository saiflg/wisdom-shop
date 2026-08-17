import type { MessageEvent } from "ems-tenant-client";

/**
 * Template rendering for parent notifications.
 *
 * The whole design point is that this **fails closed**. A template naming a
 * placeholder the event cannot supply, or supplying one that is empty,
 * refuses to render rather than substituting a blank. "Dear ," or "was marked
 * absent on " landing in a parent's inbox is worse than a message that did
 * not go out: the first is visibly broken software talking about their child,
 * the second is a gap the school can see in the outbox and fix.
 *
 * Pure and synchronous, so the rules can be read and tested without a
 * database, a gateway or a network.
 */

export interface RenderContext {
  [key: string]: string | undefined;
}

export type RenderResult =
  | { ok: true; text: string }
  | { ok: false; problem: string; missing: string[] };

/** `{{name}}` with optional inner whitespace. */
const PLACEHOLDER = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;

/**
 * The placeholders each event can supply.
 *
 * Declared here rather than inferred from whatever the caller happens to pass
 * so the template editor can offer an accurate palette, and so a template
 * referring to a field its event never sets is caught when it is saved rather
 * than at 7am when a register is taken.
 */
export const EVENT_PLACEHOLDERS: Record<MessageEvent, readonly string[]> = {
  ATTENDANCE_ABSENT: ["schoolName", "guardianName", "studentName", "className", "date"],
  FEE_INVOICE_ISSUED: ["schoolName", "guardianName", "studentName", "invoiceNumber", "amount", "dueDate"],
  FEE_INVOICE_OVERDUE: ["schoolName", "guardianName", "studentName", "invoiceNumber", "amount", "dueDate"],
  // A receipt has to answer four questions without being read twice: how
  // much arrived, what for, what is left, and a number to quote later.
  FEE_PAYMENT_RECEIVED: [
    "schoolName",
    "guardianName",
    "studentName",
    "receiptNumber",
    "invoiceNumber",
    "amountPaid",
    "balance",
    "method",
    "paidOn",
  ],
  RESULTS_PUBLISHED: ["schoolName", "guardianName", "studentName", "term", "academicYear", "className"],
  MANUAL: ["schoolName", "guardianName", "studentName"],
};

/** Every distinct placeholder a template refers to, in first-seen order. */
export function extractPlaceholders(template: string): string[] {
  const seen: string[] = [];
  for (const match of template.matchAll(PLACEHOLDER)) {
    const name = match[1] as string;
    if (!seen.includes(name)) seen.push(name);
  }
  return seen;
}

/**
 * Checks a template against what its event can actually supply.
 *
 * Used when a school saves a template, so a bad placeholder is a validation
 * error in front of the person who typed it.
 */
export function validateTemplate(body: string, event: MessageEvent): string | null {
  const allowed = EVENT_PLACEHOLDERS[event];
  const unknown = extractPlaceholders(body).filter((name) => !allowed.includes(name));
  if (unknown.length > 0) {
    return `This message uses ${unknown.map((n) => `{{${n}}}`).join(", ")}, which ${
      unknown.length === 1 ? "is not something" : "are not things"
    } we know for this event. Available: ${allowed.map((n) => `{{${n}}}`).join(", ")}`;
  }
  return null;
}

/**
 * Renders a template, or explains why it cannot.
 *
 * A placeholder is "missing" if the context has no entry for it *or* the
 * entry is empty/whitespace — an empty string is exactly the case that
 * produces a visibly broken message, so it is treated as absent rather than
 * as a legitimate value.
 */
export function renderTemplate(template: string, context: RenderContext): RenderResult {
  const missing: string[] = [];

  const text = template.replace(PLACEHOLDER, (_whole, name: string) => {
    const value = context[name];
    if (value === undefined || value.trim() === "") {
      if (!missing.includes(name)) missing.push(name);
      return "";
    }
    return value;
  });

  if (missing.length > 0) {
    return {
      ok: false,
      missing,
      problem: `Nothing to put in ${missing.map((n) => `{{${n}}}`).join(", ")}`,
    };
  }

  return { ok: true, text };
}

/**
 * The de-duplication key for an event.
 *
 * Encodes the event and the thing it is about, never a timestamp — the point
 * is that repeating the same action produces the same key and so cannot
 * notify a family twice. Re-saving a register, re-raising a class's invoices
 * and republishing results all land on the key they landed on before, and the
 * unique index turns the second attempt into a no-op.
 */
export function buildDedupeKey(event: MessageEvent, parts: (string | number)[]): string {
  return [event, ...parts.map(String)].join(":");
}
