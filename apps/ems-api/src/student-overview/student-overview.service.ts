import { Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { summariseBehaviour } from "@/behaviour/behaviour-summary";
import { isOverdue } from "@/library/library-rules";
import { buildOverview } from "./student-overview-rules";

const STAFF_ROLES = ["SCHOOL_ADMIN", "TEACHER"];

@Injectable()
export class StudentOverviewService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /**
   * Everything about one child, in one view.
   *
   * Read directly rather than through each feature's service, which is a
   * departure from how PdfService does it — and the reason is worth stating.
   * Those services scope row by row because they answer questions about many
   * children at once. This answers a question about exactly one, so the
   * permission is decided once, at the top, and everything below it is
   * already inside that decision. Going through seven services would mean
   * seven repetitions of the same check on the same child.
   *
   * Every figure that could be absent is left absent. A child with no
   * registers has no attendance rate, and inventing one — either way — puts a
   * number into a parents' evening that no fact supports.
   */
  async forStudent(studentProfileId: string, viewer: AuthenticatedUser) {
    await this.assertMayView(studentProfileId, viewer);
    const client = await this.tenantPrisma.getClient();
    const today = new Date();

    const student = await client.studentProfile.findFirst({
      where: { id: studentProfileId },
      select: {
        id: true,
        studentCode: true,
        user: { select: { firstName: true, lastName: true } },
        enrollments: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { class: { select: { id: true, name: true, academicYear: true } } },
        },
      },
    });
    if (!student) throw new NotFoundException("No student found with that id");

    const [attendance, invoices, behaviourRecords, loans, wallet, ride, bed] = await Promise.all([
      client.attendanceRecord.groupBy({
        by: ["status"],
        where: { studentProfileId },
        _count: { _all: true },
      }),
      client.feeInvoice.findMany({
        where: { studentProfileId },
        select: { totalCents: true, paidCents: true },
      }),
      client.behaviourRecord.findMany({
        where: { studentProfileId, deletedAt: null },
        select: { kind: true, points: true, category: true, occurredAt: true },
      }),
      client.libraryLoan.findMany({
        where: { studentProfileId, returnedOn: null },
        select: { dueOn: true, returnedOn: true, book: { select: { title: true } } },
      }),
      client.studentWallet.findUnique({ where: { studentProfileId } }),
      client.transportAssignment.findFirst({
        where: { studentProfileId, route: { deletedAt: null } },
        select: {
          direction: true,
          route: { select: { name: true } },
          stop: { select: { name: true, pickupMinute: true } },
        },
      }),
      client.hostelAllocation.findFirst({
        where: { studentProfileId, releasedOn: null },
        select: { room: { select: { name: true, block: { select: { name: true } } } } },
      }),
    ]);

    const counts = { present: 0, absent: 0, late: 0, excused: 0 };
    for (const row of attendance) {
      const key = row.status.toLowerCase() as keyof typeof counts;
      if (key in counts) counts[key] = row._count._all;
    }

    const behaviour = summariseBehaviour(behaviourRecords);

    const overview = buildOverview({
      attendance: counts,
      invoicedCents: invoices.reduce((sum, invoice) => sum + invoice.totalCents, 0),
      paidCents: invoices.reduce((sum, invoice) => sum + invoice.paidCents, 0),
      invoiceCount: invoices.length,
      behaviour: {
        merits: behaviour.merits,
        concerns: behaviour.concerns,
        netPoints: behaviour.netPoints,
        records: behaviourRecords.length,
      },
      libraryOut: loans.length,
      libraryOverdue: loans.filter((loan) => isOverdue(loan, today)).length,
      walletCents: wallet?.balanceCents ?? null,
      hasWallet: Boolean(wallet),
    });

    return {
      student: {
        id: student.id,
        name: `${student.user.firstName} ${student.user.lastName}`,
        studentCode: student.studentCode,
        class: student.enrollments[0]?.class ?? null,
      },
      ...overview,
      // The detail behind the headline figures, so somebody can act on a flag
      // without hunting through five other screens for the thing it refers to.
      loans: loans.map((loan) => ({
        title: loan.book.title,
        dueOn: loan.dueOn,
        overdue: isOverdue(loan, today),
      })),
      transport: ride
        ? {
            route: ride.route.name,
            direction: ride.direction,
            stop: ride.stop?.name ?? null,
            pickupMinute: ride.stop?.pickupMinute ?? null,
          }
        : null,
      hostel: bed ? { block: bed.room.block.name, room: bed.room.name } : null,
    };
  }

  /** Staff see any child; a family sees their own and gets a 404 otherwise. */
  private async assertMayView(studentProfileId: string, viewer: AuthenticatedUser) {
    if (viewer.roles.some((role) => STAFF_ROLES.includes(role))) return;

    const client = await this.tenantPrisma.getClient();

    if (viewer.roles.includes("GUARDIAN")) {
      const link = await client.guardianLink.findFirst({
        where: { guardianUserId: viewer.id, studentProfileId },
      });
      if (link) return;
    }

    const own = await client.studentProfile.findUnique({
      where: { userId: viewer.id },
      select: { id: true },
    });
    if (own?.id === studentProfileId) return;

    throw new NotFoundException("No student found with that id");
  }
}
