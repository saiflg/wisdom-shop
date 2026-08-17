import { Injectable } from "@nestjs/common";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import {
  actorOf,
  announcementSummary,
  attendanceAmendmentSummary,
  bankAccessSummary,
  categoryLabel,
  invitationSummary,
  matchesFilter,
  mergeEntries,
  moderationSummary,
  money,
  paymentSummary,
  payrollSummary,
  type AuditCategory,
  type AuditEntry,
  type AuditFilter,
} from "./audit-log";

/**
 * Reads every trail the product already keeps and presents them as one log.
 *
 * Nothing here writes. Each source is queried independently and merged, so
 * adding a trail is one method and one line — and forgetting to add one
 * loses visibility rather than losing the record itself, because the record
 * belongs to the operation that made it.
 *
 * Over-fetches each source before merging: see mergeEntries. Fetching a share
 * of the limit from each would let a busy day of payments hide every
 * amendment.
 */
@Injectable()
export class AuditService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async list(filter: AuditFilter & { limit?: number } = {}) {
    const limit = Math.min(Math.max(filter.limit ?? 200, 1), 500);
    const client = await this.tenantPrisma.getClient();

    // Each source takes the full limit, not a share of it.
    const take = limit;
    const since = filter.from ?? undefined;
    const window = since ? { gte: since } : undefined;

    const [
      bankAccess,
      amendments,
      payments,
      payrollRuns,
      announcements,
      invitations,
      reports,
    ] = await Promise.all([
      client.bankDetailAccess.findMany({ orderBy: { createdAt: "desc" }, take, where: window ? { createdAt: window } : {} }),
      client.attendanceAmendment.findMany({
        orderBy: { createdAt: "desc" },
        take,
        where: window ? { createdAt: window } : {},
        include: {
          record: {
            select: {
              studentProfile: { select: { user: { select: { firstName: true, lastName: true } } } },
            },
          },
        },
      }),
      client.feePayment.findMany({
        orderBy: { createdAt: "desc" },
        take,
        where: window ? { createdAt: window } : {},
        include: { invoice: { select: { invoiceNumber: true, currency: true } } },
      }),
      client.payrollRun.findMany({
        orderBy: { updatedAt: "desc" },
        take,
        where: { OR: [{ approvedAt: { not: null } }, { paidAt: { not: null } }] },
      }),
      client.announcement.findMany({ orderBy: { sentAt: "desc" }, take, where: window ? { sentAt: window } : {} }),
      client.guardianInvitation.findMany({
        orderBy: { createdAt: "desc" },
        take,
        where: window ? { createdAt: window } : {},
        include: { user: { select: { firstName: true, lastName: true } } },
      }),
      client.classMessageReport.findMany({ orderBy: { createdAt: "desc" }, take, where: window ? { createdAt: window } : {} }),
    ]);

    const sources: AuditEntry[][] = [
      bankAccess.map((row) => ({
        id: `bank:${row.id}`,
        at: row.createdAt,
        ...actorOf(row.actorName, row.actorUserId),
        category: "STAFF_PRIVACY" as AuditCategory,
        summary: bankAccessSummary(row.staffName),
        // The whole point of that trail: it refuses to reveal without one.
        reason: row.reason,
        source: "bank_detail_access",
      })),

      amendments.map((row) => ({
        id: `attendance:${row.id}`,
        at: row.createdAt,
        ...actorOf(row.actorName, row.actorUserId),
        category: "CHILD_RECORD" as AuditCategory,
        summary: attendanceAmendmentSummary(
          row.fromStatus,
          row.toStatus,
          row.record?.studentProfile?.user
            ? `${row.record.studentProfile.user.firstName} ${row.record.studentProfile.user.lastName}`
            : null,
        ),
        reason: row.reason,
        source: "attendance_amendments",
      })),

      payments.map((row) => ({
        id: `payment:${row.id}`,
        at: row.createdAt,
        ...actorOf(row.recordedByName, row.recordedByUserId),
        category: "MONEY" as AuditCategory,
        summary: paymentSummary(
          money(row.amountCents, row.invoice.currency),
          row.invoice.invoiceNumber,
          row.receiptNumber,
        ),
        reason: row.note,
        source: "fee_payments",
      })),

      // One run yields up to two entries: approving and paying are separate
      // acts, often by different people on different days.
      payrollRuns.flatMap((run) => {
        const entries: AuditEntry[] = [];
        if (run.approvedAt) {
          entries.push({
            id: `payroll-approved:${run.id}`,
            at: run.approvedAt,
            ...actorOf(run.approvedByName, run.approvedByUserId),
            category: "MONEY",
            summary: payrollSummary("approved", run.year, run.month),
            reason: run.notes,
            source: "payroll_runs",
          });
        }
        if (run.paidAt) {
          entries.push({
            id: `payroll-paid:${run.id}`,
            at: run.paidAt,
            ...actorOf(run.paidByName, run.paidByUserId),
            category: "MONEY",
            summary: payrollSummary("marked as paid", run.year, run.month),
            reason: null,
            source: "payroll_runs",
          });
        }
        return entries;
      }),

      announcements.map((row) => ({
        id: `announcement:${row.id}`,
        at: row.sentAt,
        ...actorOf(row.sentByName, row.sentByUserId),
        category: "COMMUNICATION" as AuditCategory,
        summary: announcementSummary(row.title, row.audience, row.reached),
        reason: null,
        source: "announcements",
      })),

      // Sending and accepting are both worth recording: one is a school
      // granting access, the other is somebody taking it up.
      invitations.flatMap((row) => {
        const person = `${row.user.firstName} ${row.user.lastName}`;
        const entries: AuditEntry[] = [
          {
            id: `invite-sent:${row.id}`,
            at: row.createdAt,
            ...actorOf(row.createdByName, row.createdByUserId),
            category: "ACCESS",
            summary: invitationSummary("sent", person),
            reason: null,
            source: "guardian_invitations",
          },
        ];
        if (row.acceptedAt) {
          entries.push({
            id: `invite-accepted:${row.id}`,
            at: row.acceptedAt,
            // The person themselves, not whoever invited them.
            actorName: person,
            actorUserId: row.userId,
            category: "ACCESS",
            summary: invitationSummary("accepted", person),
            reason: null,
            source: "guardian_invitations",
          });
        }
        if (row.revokedAt && row.revokedReason === "CANCELLED") {
          entries.push({
            id: `invite-cancelled:${row.id}`,
            at: row.revokedAt,
            ...actorOf(row.createdByName, row.createdByUserId),
            category: "ACCESS",
            summary: invitationSummary("cancelled", person),
            reason: null,
            source: "guardian_invitations",
          });
        }
        return entries;
      }),

      reports.map((row) => ({
        id: `report:${row.id}`,
        at: row.reviewedAt ?? row.createdAt,
        ...(row.reviewedAt
          ? actorOf(null, row.reviewedByUserId)
          : actorOf(row.reportedByName, row.reportedByUserId)),
        category: "MODERATION" as AuditCategory,
        summary: moderationSummary(row.reportedByName, Boolean(row.reviewedAt)),
        reason: row.outcome ?? row.reason,
        source: "class_message_reports",
      })),
    ];

    const merged = mergeEntries(sources, limit * 2).filter((entry) => matchesFilter(entry, filter));

    return {
      entries: merged.slice(0, limit).map((entry) => ({
        ...entry,
        categoryLabel: categoryLabel(entry.category),
      })),
      /** What this log can see, so a reader knows what it does NOT cover. */
      sources: [
        "bank_detail_access",
        "attendance_amendments",
        "fee_payments",
        "payroll_runs",
        "announcements",
        "guardian_invitations",
        "class_message_reports",
      ],
      truncated: merged.length > limit,
    };
  }
}
