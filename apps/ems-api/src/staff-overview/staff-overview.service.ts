import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { balanceOf } from "@/staff/leave";
import { attendanceRate, summariseStaffAttendance } from "@/staff-attendance/staff-attendance-rules";
import { noteObligations, staffFlags, teachingLoad } from "./staff-overview-rules";

@Injectable()
export class StaffOverviewService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /**
   * Where one member of staff stands.
   *
   * Anybody may read their own; only an administrator may read somebody
   * else's. That is stricter than the student equivalent on purpose — one
   * teacher's attendance and leave are not another teacher's business, and
   * this page is close enough to an employment record to be treated as one.
   */
  async forStaff(userId: string, viewer: AuthenticatedUser) {
    if (userId !== viewer.id && !viewer.roles.includes("SCHOOL_ADMIN")) {
      throw new ForbiddenException("Only an administrator can read somebody else's staff dashboard");
    }

    const client = await this.tenantPrisma.getClient();

    const user = await client.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        staffProfile: {
          select: { jobTitle: true, section: true, leaveEntitlementDays: true, startDate: true },
        },
      },
    });
    if (!user) throw new NotFoundException("No member of staff found with that id");

    const [days, leaves, assignments, timetable, notes] = await Promise.all([
      client.staffAttendanceDay.findMany({
        where: { userId },
        select: { status: true, minutesLate: true },
      }),
      client.leaveRequest.findMany({
        where: { userId },
        select: { fromDate: true, toDate: true, type: true, status: true },
      }),
      client.teachingAssignment.findMany({
        where: { teacherUserId: userId },
        select: { classId: true, subjectId: true },
      }),
      client.timetableEntry.findMany({
        where: { teacherUserId: userId },
        select: { period: { select: { startMinute: true, endMinute: true } } },
      }),
      client.lessonNote.groupBy({
        by: ["status"],
        where: { authorUserId: userId, deletedAt: null },
        _count: { _all: true },
      }),
    ]);

    const attendanceSummary = summariseStaffAttendance(days);
    const rate = attendanceRate(attendanceSummary);

    // The leave rules already know that a zero entitlement means "not
    // tracked" rather than "none", and say so in their own words. Reusing
    // them keeps this page and the leave screen from disagreeing.
    const leave = balanceOf({
      entitlementDays: user.staffProfile?.leaveEntitlementDays ?? 0,
      approved: leaves.filter((row) => row.status === "APPROVED"),
      pending: leaves.filter((row) => row.status === "REQUESTED"),
    });

    const noteCounts = { draft: 0, submitted: 0, returned: 0, approved: 0 };
    for (const row of notes) {
      const key = row.status.toLowerCase() as keyof typeof noteCounts;
      if (key in noteCounts) noteCounts[key] = row._count._all;
    }

    const load = teachingLoad(
      assignments,
      timetable.map((entry) => entry.period),
    );

    return {
      staff: {
        id: user.id,
        name: `${user.firstName} ${user.lastName}`,
        jobTitle: user.staffProfile?.jobTitle ?? null,
        section: user.staffProfile?.section ?? null,
        startDate: user.staffProfile?.startDate ?? null,
      },
      attendance: {
        ...attendanceSummary,
        // Null when nobody was expected in — a period spent entirely on
        // approved leave has no attendance rate.
        rate,
      },
      leave,
      load,
      notes: { ...noteCounts, ...noteObligations(noteCounts) },
      flags: staffFlags({
        attendanceRate: rate,
        notes: noteCounts,
        leaveUntracked: leave.untracked,
        remainingLeaveDays: leave.remainingDays,
      }),
    };
  }
}
