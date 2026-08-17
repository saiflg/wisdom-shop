/**
 * One place to answer "who did that, and when".
 *
 * **Nothing writes here.** This module reads the trails the product already
 * keeps — bank-detail reveals, attendance amendments, payments, payroll
 * approvals, announcements, invitations, moderation — and presents them as
 * one list.
 *
 * That is the whole design decision, and it is deliberate. A separate
 * append-only audit table would have to be written to from every one of
 * those places, and the one call somebody forgets to add is precisely the
 * event a school will one day need. The existing rows are trustworthy for
 * the opposite reason: they are written as part of the operation itself, not
 * alongside it, so an attendance mark cannot be amended without the
 * amendment existing.
 *
 * Every source already snapshots the actor's name by value, so this log says
 * what was recorded at the time rather than resolving a name that may since
 * have changed or been deleted.
 *
 * Pure, so the merging and the wording can be argued with in a test.
 */

export type AuditCategory =
  | "STAFF_PRIVACY"
  | "CHILD_RECORD"
  | "MONEY"
  | "COMMUNICATION"
  | "ACCESS"
  | "MODERATION";

export interface AuditEntry {
  id: string;
  at: Date;
  /** Snapshotted when it happened. Never resolved from the id now. */
  actorName: string;
  actorUserId: string | null;
  category: AuditCategory;
  /** One sentence, past tense, naming what was done and to whom. */
  summary: string;
  /** Why, when the action required a reason. Null when none was asked for. */
  reason: string | null;
  /** Which trail this came from, so a reader can go and look at the source. */
  source: string;
}

const CATEGORY_LABELS: Record<AuditCategory, string> = {
  STAFF_PRIVACY: "Staff privacy",
  CHILD_RECORD: "Child's record",
  MONEY: "Money",
  COMMUNICATION: "Communication",
  ACCESS: "Access",
  MODERATION: "Moderation",
};

export function categoryLabel(category: AuditCategory): string {
  return CATEGORY_LABELS[category] ?? "Other";
}

/**
 * When no person did it.
 *
 * A gateway payment has no school user behind it, and recording one would be
 * a lie in the one log that answers "who". Naming the system plainly is
 * better than attributing it to whoever happened to be logged in.
 */
export const SYSTEM_ACTOR = "The system";

export function actorOf(name: string | null | undefined, userId: string | null | undefined): {
  actorName: string;
  actorUserId: string | null;
} {
  const trimmed = name?.trim();
  // "gateway" is the sentinel FeesService writes for money that arrived
  // without anybody in the school touching it.
  if (!trimmed || userId === "gateway") {
    return { actorName: trimmed && userId !== "gateway" ? trimmed : SYSTEM_ACTOR, actorUserId: null };
  }
  return { actorName: trimmed, actorUserId: userId ?? null };
}

/**
 * Merge trails into one list, newest first.
 *
 * The trap this exists to close: each source must be over-fetched to `limit`
 * and merged *before* slicing. Fetching `limit / sources` from each instead
 * would silently drop a busy day's payments because attendance had older
 * rows to fill the quota — a log that quietly omits things is worse than no
 * log.
 */
export function mergeEntries(sources: AuditEntry[][], limit: number): AuditEntry[] {
  return sources
    .flat()
    .sort((a, b) => b.at.getTime() - a.at.getTime() || a.id.localeCompare(b.id))
    .slice(0, limit);
}

export interface AuditFilter {
  categories?: AuditCategory[];
  /** Matched against the actor's name and the summary, case-insensitively. */
  query?: string;
  from?: Date | null;
  to?: Date | null;
}

export function matchesFilter(entry: AuditEntry, filter: AuditFilter): boolean {
  if (filter.categories?.length && !filter.categories.includes(entry.category)) return false;
  if (filter.from && entry.at.getTime() < filter.from.getTime()) return false;
  // Inclusive of the whole end day: somebody filtering "to 17 August" means
  // the end of the 17th, not midnight at its start.
  if (filter.to && entry.at.getTime() > endOfDay(filter.to).getTime()) return false;

  const needle = filter.query?.trim().toLowerCase();
  if (!needle) return true;

  // The reason is searched too: "why did somebody open that bank record" is
  // exactly the question this log is opened for.
  return [entry.actorName, entry.summary, entry.reason ?? ""]
    .some((field) => field.toLowerCase().includes(needle));
}

export function endOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setUTCHours(23, 59, 59, 999);
  return copy;
}

export function money(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/* ------------------------------------------------------------------ wording
 *
 * One sentence per source, past tense, naming what was done and to whom. Kept
 * here rather than in the service so the phrasing is testable and so adding a
 * source is a change in one place.
 */

export function bankAccessSummary(staffName: string): string {
  return `Revealed ${staffName}'s bank account number`;
}

export function attendanceAmendmentSummary(from: string, to: string, studentName: string | null): string {
  const who = studentName ? `${studentName}'s` : "a";
  return `Changed ${who} attendance mark from ${from.toLowerCase()} to ${to.toLowerCase()}`;
}

export function paymentSummary(amount: string, invoiceNumber: string, receiptNumber: string | null): string {
  const receipt = receiptNumber ? ` (receipt ${receiptNumber})` : "";
  return `Recorded ${amount} against invoice ${invoiceNumber}${receipt}`;
}

export function payrollSummary(action: "approved" | "marked as paid", year: number, month: number): string {
  const name = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${action === "approved" ? "Approved" : "Marked as paid"} the ${name} payroll`;
}

export function announcementSummary(title: string, audience: string, reached: number): string {
  return `Announced "${title}" to ${audience.toLowerCase().replace(/_/g, " ")} — reached ${reached}`;
}

export function invitationSummary(
  state: "sent" | "accepted" | "cancelled",
  personName: string,
): string {
  if (state === "accepted") return `${personName} set their own password from an invitation`;
  return `${state === "sent" ? "Invited" : "Cancelled the invitation for"} ${personName}`;
}

export function moderationSummary(reporterName: string, reviewed: boolean): string {
  return reviewed
    ? `Reviewed a class message reported by ${reporterName}`
    : `Reported a class message`;
}
