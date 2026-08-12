/**
 * What a school office needs to know about its families this morning.
 *
 * Deliberately not a wall of statistics. Every figure here is one somebody
 * can act on today: a family waiting for an answer, a child missing from
 * school, a bill nobody has paid, a parent the school cannot actually reach.
 * A count of "total families" tells nobody to do anything, so it appears once
 * as context and never as an alert.
 *
 * Pure, so the rules can be argued with in a test rather than clicked at in a
 * browser.
 */

export interface OverviewInput {
  guardians: {
    guardianUserId: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    /** Null means no password is set, so this person cannot sign in. */
    hasPassword: boolean;
    childNames: string[];
  }[];
  /** Threads where the family spoke last and nobody has replied. */
  awaitingReply: { studentProfileId: string; studentName: string; waitingSince: Date }[];
  absentToday: { studentProfileId: string; studentName: string; className: string | null }[];
  outstandingInvoices: {
    studentProfileId: string;
    studentName: string;
    outstandingCents: number;
    currency: string;
    dueDate: Date | null;
  }[];
}

export interface ParentAlert {
  kind: "AWAITING_REPLY" | "ABSENT" | "UNPAID" | "UNREACHABLE" | "NO_PORTAL_ACCESS";
  /** Ordering weight. Lower sorts first. */
  urgency: number;
  headline: string;
  detail: string;
  href: string | null;
}

/** How many whole days ago, by calendar date rather than elapsed hours. */
export function daysAgo(then: Date, now: Date): number {
  const a = Date.UTC(then.getUTCFullYear(), then.getUTCMonth(), then.getUTCDate());
  const b = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function formatMoney(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * A family the school has no electronic way of reaching.
 *
 * Phone counts. A parent with only a number is contactable — by a person, on a
 * telephone — and treating them as unreachable would tell an office to chase
 * an email address it does not need. A parent with neither is genuinely
 * unreachable and that is worth an alert.
 */
export function isUnreachable(guardian: { email: string | null; phone: string | null }): boolean {
  return !guardian.email && !guardian.phone;
}

/**
 * A parent who cannot use the portal, but could.
 *
 * Having an email address but no password means an account exists on paper and
 * has never been set up — the school thinks this family can see their child's
 * marks, and they cannot. A parent with no email at all is a different problem
 * (see isUnreachable) and is not counted twice here.
 */
export function lacksPortalAccess(guardian: { email: string | null; hasPassword: boolean }): boolean {
  return Boolean(guardian.email) && !guardian.hasPassword;
}

export function buildAlerts(input: OverviewInput, now: Date): ParentAlert[] {
  const alerts: ParentAlert[] = [];

  // Unanswered families first, and older ones ahead of newer. A parent who
  // wrote on Monday and has heard nothing by Thursday is the school's most
  // urgent relationship problem, and it is invisible unless something says so.
  for (const thread of input.awaitingReply) {
    const days = daysAgo(thread.waitingSince, now);
    alerts.push({
      kind: "AWAITING_REPLY",
      urgency: 100 - Math.min(days, 90),
      headline: `${thread.studentName}'s family is waiting for a reply`,
      detail:
        days === 0 ? "Written today" : days === 1 ? "Waiting since yesterday" : `Waiting ${days} days`,
      href: "/parent-messages",
    });
  }

  for (const child of input.absentToday) {
    alerts.push({
      kind: "ABSENT",
      urgency: 200,
      headline: `${child.studentName} is absent today`,
      detail: child.className ? `Marked absent in ${child.className}` : "Marked absent",
      href: "/attendance",
    });
  }

  for (const invoice of input.outstandingInvoices) {
    const overdue = invoice.dueDate ? daysAgo(invoice.dueDate, now) : 0;
    alerts.push({
      kind: "UNPAID",
      // Overdue bills sort above merely unpaid ones, but below a child who is
      // missing from school — money can wait a day, a missing child cannot.
      urgency: overdue > 0 ? 300 : 400,
      headline: `${invoice.studentName}: ${formatMoney(invoice.outstandingCents, invoice.currency)} outstanding`,
      detail: invoice.dueDate
        ? overdue > 0
          ? `Overdue by ${plural(overdue, "day", "days")}`
          : "Not yet due"
        : "No due date set",
      href: "/invoices",
    });
  }

  for (const guardian of input.guardians) {
    const name = `${guardian.firstName} ${guardian.lastName}`;
    const children = guardian.childNames.join(", ");

    if (isUnreachable(guardian)) {
      alerts.push({
        kind: "UNREACHABLE",
        urgency: 500,
        headline: `${name} has no email or phone on file`,
        detail: children ? `Parent of ${children}` : "No contact details at all",
        href: "/guardians",
      });
    } else if (lacksPortalAccess(guardian)) {
      alerts.push({
        kind: "NO_PORTAL_ACCESS",
        urgency: 600,
        headline: `${name} cannot sign in yet`,
        detail: "Has an email address but no password set",
        href: "/guardians",
      });
    }
  }

  return alerts.sort((a, b) => a.urgency - b.urgency || a.headline.localeCompare(b.headline));
}

export interface ParentsOverview {
  familyCount: number;
  awaitingReplyCount: number;
  absentTodayCount: number;
  unpaidCount: number;
  outstandingTotals: { currency: string; cents: number }[];
  unreachableCount: number;
  noPortalAccessCount: number;
  alerts: ParentAlert[];
}

/**
 * Totals per currency rather than one number.
 *
 * A school with fees in two currencies has two answers, and adding them
 * produces a third that is true in neither.
 */
export function outstandingByCurrency(
  invoices: { outstandingCents: number; currency: string }[],
): { currency: string; cents: number }[] {
  const totals = new Map<string, number>();
  for (const invoice of invoices) {
    totals.set(invoice.currency, (totals.get(invoice.currency) ?? 0) + invoice.outstandingCents);
  }
  return [...totals.entries()]
    .map(([currency, cents]) => ({ currency, cents }))
    .sort((a, b) => b.cents - a.cents);
}

export function buildOverview(input: OverviewInput, now: Date): ParentsOverview {
  return {
    familyCount: input.guardians.length,
    awaitingReplyCount: input.awaitingReply.length,
    absentTodayCount: input.absentToday.length,
    unpaidCount: input.outstandingInvoices.length,
    outstandingTotals: outstandingByCurrency(input.outstandingInvoices),
    unreachableCount: input.guardians.filter(isUnreachable).length,
    noPortalAccessCount: input.guardians.filter(lacksPortalAccess).length,
    alerts: buildAlerts(input, now),
  };
}
