import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { dayOf } from "@/staff/leave";
import type { MarkStaffAttendanceDto } from "./dto/mark-staff-attendance.dto";
import {
  attendanceRate,
  isOnApprovedLeave,
  resolveStatus,
  summariseStaffAttendance,
  validateMark,
} from "./staff-attendance-rules";

@Injectable()
export class StaffAttendanceService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /**
   * Mark one person for one day.
   *
   * Two things happen before anything is written. The mark is checked for
   * internal sense — minutes only on a late mark — and then it is reconciled
   * against leave the school has already approved, because an absence
   * recorded against approved leave is the error nobody catches until
   * payroll.
   *
   * Upserted on (user, date): marking twice is a correction, not a second
   * day. A register run twice must not double anybody, and the unique index
   * is what guarantees that rather than a check on the way in.
   */
  async mark(dto: MarkStaffAttendanceDto, actor: AuthenticatedUser) {
    const problem = validateMark(dto.status, dto.minutesLate);
    if (problem) throw new BadRequestException(problem);

    const client = await this.tenantPrisma.getClient();
    const date = dayOf(new Date(dto.date));

    const staff = await client.user.findUnique({ where: { id: dto.userId }, select: { id: true } });
    if (!staff) throw new NotFoundException("No member of staff found with that id");

    const leaves = await client.leaveRequest.findMany({
      where: { userId: dto.userId, status: "APPROVED" },
      select: { fromDate: true, toDate: true, type: true, status: true },
    });

    const resolved = resolveStatus(dto.status, isOnApprovedLeave(leaves, date));

    // A status the rules changed carries no minutes: ON_LEAVE with a
    // lateness on it would fail the database check, and rightly.
    const minutesLate = resolved.status === "LATE" ? (dto.minutesLate ?? null) : null;

    const record = await client.staffAttendanceDay.upsert({
      where: { userId_date: { userId: dto.userId, date } },
      create: {
        userId: dto.userId,
        date,
        status: resolved.status,
        minutesLate,
        note: dto.note ?? null,
        recordedByUserId: actor.id,
        recordedByName: await this.nameOf(actor.id),
      },
      update: {
        status: resolved.status,
        minutesLate,
        note: dto.note ?? null,
        recordedByUserId: actor.id,
        recordedByName: await this.nameOf(actor.id),
      },
    });

    // Returned rather than swallowed: whoever pressed Absent should be told
    // it was recorded as leave, and why.
    return { record, adjusted: resolved.note };
  }

  /** Everyone's marks for one day, for running down a list in the morning. */
  async forDay(date: Date) {
    const client = await this.tenantPrisma.getClient();
    return client.staffAttendanceDay.findMany({
      where: { date: dayOf(date) },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { user: { lastName: "asc" } },
    });
  }

  /**
   * One person over a period, with what it adds up to.
   *
   * A member of staff may read their own. Everything else is administrators:
   * one teacher's attendance record is not another teacher's business.
   */
  async forStaff(userId: string, from: Date, to: Date, viewer: AuthenticatedUser) {
    if (userId !== viewer.id && !viewer.roles.includes("SCHOOL_ADMIN")) {
      throw new ForbiddenException("Only an administrator can read somebody else's attendance");
    }

    const client = await this.tenantPrisma.getClient();
    const days = await client.staffAttendanceDay.findMany({
      where: { userId, date: { gte: dayOf(from), lte: dayOf(to) } },
      orderBy: { date: "desc" },
    });

    const summary = summariseStaffAttendance(days);
    return { days, summary, rate: attendanceRate(summary) };
  }

  private async nameOf(userId: string): Promise<string> {
    const client = await this.tenantPrisma.getClient();
    const user = await client.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });
    return user ? `${user.firstName} ${user.lastName}`.trim() : "Unknown";
  }
}
