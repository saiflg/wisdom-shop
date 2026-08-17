import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import {
  balanceOf,
  canCancel,
  decisionProblem,
  describeLeave,
  leaveLabel,
  requestProblem,
  workingDays,
  type LeaveLike,
} from "./leave";

interface RequestLeaveInput {
  /** Omitted means the viewer is asking for themselves, which is the usual case. */
  userId?: string;
  type: string;
  fromDate: string;
  toDate: string;
  reason?: string;
}

@Injectable()
export class LeaveService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private isAdmin(viewer: AuthenticatedUser): boolean {
    return viewer.roles.includes("SCHOOL_ADMIN");
  }

  private async nameOf(userId: string): Promise<string | null> {
    const client = await this.tenantPrisma.getClient();
    const user = await client.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });
    return user ? `${user.firstName} ${user.lastName}` : null;
  }

  /**
   * Ask for time off.
   *
   * An administrator may raise one on somebody's behalf — a member of staff
   * telephoning in sick should not have to log in to be recorded — but the
   * request still belongs to that person, and it is still not theirs to
   * approve.
   */
  async request(input: RequestLeaveInput, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();

    const userId = input.userId ?? viewer.id;
    if (userId !== viewer.id && !this.isAdmin(viewer)) {
      throw new ForbiddenException("Only an administrator can record leave for somebody else");
    }

    const staff = await client.user.findFirst({
      where: { id: userId, deletedAt: null, roles: { hasSome: ["TEACHER", "SCHOOL_ADMIN"] } },
      select: { id: true },
    });
    if (!staff) throw new NotFoundException("No member of staff found with that id");

    const existing = await client.leaveRequest.findMany({
      where: { userId },
      select: { fromDate: true, toDate: true, type: true, status: true },
    });

    const problem = requestProblem({
      fromDate: new Date(input.fromDate),
      toDate: new Date(input.toDate),
      type: input.type,
      reason: input.reason,
      now: new Date(),
      existing: existing as LeaveLike[],
    });
    if (problem) throw new BadRequestException(problem);

    const created = await client.leaveRequest.create({
      data: {
        userId,
        type: input.type,
        fromDate: new Date(input.fromDate),
        toDate: new Date(input.toDate),
        reason: input.reason?.trim() || null,
        requestedByName: await this.nameOf(userId),
      },
    });

    return this.present(created);
  }

  /**
   * Approve or decline.
   *
   * The rule the whole module exists for lives in decisionProblem: nobody
   * decides their own request, however senior they are.
   */
  async decide(id: string, approve: boolean, note: string | undefined, viewer: AuthenticatedUser) {
    if (!this.isAdmin(viewer)) throw new ForbiddenException("Only an administrator can decide leave");

    const client = await this.tenantPrisma.getClient();
    const request = await client.leaveRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException("No leave request found with that id");

    const problem = decisionProblem({
      status: request.status,
      requestedByUserId: request.userId,
      deciderUserId: viewer.id,
    });
    if (problem) throw new BadRequestException(problem);

    const updated = await client.leaveRequest.update({
      where: { id },
      data: {
        status: approve ? "APPROVED" : "DECLINED",
        decidedAt: new Date(),
        decidedByUserId: viewer.id,
        decidedByName: await this.nameOf(viewer.id),
        decisionNote: note?.trim() || null,
      },
    });

    return this.present(updated);
  }

  /** Take back your own request, before it starts. */
  async cancel(id: string, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const request = await client.leaveRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException("No leave request found with that id");

    if (!canCancel({ ...request, requestedByUserId: request.userId }, viewer.id, new Date())) {
      throw new BadRequestException(
        request.userId !== viewer.id
          ? "Only the person who asked for this leave can take it back."
          : "Leave can only be taken back before it starts. Speak to the office.",
      );
    }

    const updated = await client.leaveRequest.update({ where: { id }, data: { status: "CANCELLED" } });
    return this.present(updated);
  }

  /**
   * One person's leave and what is left of their allowance.
   *
   * A member of staff sees their own; an administrator sees anybody's. There
   * is no middle case: a teacher has no business in a colleague's sick leave.
   */
  async forStaff(userId: string, viewer: AuthenticatedUser) {
    if (userId !== viewer.id && !this.isAdmin(viewer)) {
      throw new ForbiddenException("You can only see your own leave");
    }

    const client = await this.tenantPrisma.getClient();
    const [rows, profile] = await Promise.all([
      client.leaveRequest.findMany({ where: { userId }, orderBy: { fromDate: "desc" } }),
      client.staffProfile.findFirst({ where: { userId }, select: { leaveEntitlementDays: true } }),
    ]);

    const balance = balanceOf({
      entitlementDays: profile?.leaveEntitlementDays ?? 0,
      approved: rows.filter((row) => row.status === "APPROVED"),
      pending: rows.filter((row) => row.status === "REQUESTED"),
    });

    return {
      userId,
      balance,
      requests: rows.map((row) => this.present(row, viewer)),
    };
  }

  /**
   * Everything awaiting a decision, and who is away soon.
   *
   * The two questions an office actually has, on one screen: what needs me,
   * and who will not be here.
   */
  async overview(viewer: AuthenticatedUser) {
    if (!this.isAdmin(viewer)) throw new ForbiddenException("Only an administrator can see the school's leave");

    const client = await this.tenantPrisma.getClient();
    const today = new Date();

    const [pending, upcoming] = await Promise.all([
      client.leaveRequest.findMany({
        where: { status: "REQUESTED" },
        orderBy: { fromDate: "asc" },
        include: { user: { select: { firstName: true, lastName: true } } },
      }),
      client.leaveRequest.findMany({
        where: { status: "APPROVED", toDate: { gte: today } },
        orderBy: { fromDate: "asc" },
        take: 50,
        include: { user: { select: { firstName: true, lastName: true } } },
      }),
    ]);

    const withName = (row: (typeof pending)[number]) => ({
      ...this.present(row, viewer),
      staffName: `${row.user.firstName} ${row.user.lastName}`,
    });

    return {
      pending: pending.map(withName),
      upcoming: upcoming.map(withName),
      /** So the office can see the cost of what it is being asked to approve. */
      pendingDays: pending.reduce((sum, row) => sum + workingDays(row.fromDate, row.toDate), 0),
    };
  }

  /** Set somebody's annual allowance. Zero means "not tracked". */
  async setEntitlement(userId: string, days: number, viewer: AuthenticatedUser) {
    if (!this.isAdmin(viewer)) throw new ForbiddenException("Only an administrator can set an allowance");
    if (!Number.isInteger(days) || days < 0) {
      throw new BadRequestException("An allowance must be a whole number of days, or zero for untracked.");
    }

    const client = await this.tenantPrisma.getClient();
    const profile = await client.staffProfile.findFirst({ where: { userId }, select: { id: true } });
    if (!profile) throw new NotFoundException("That person has no employment record to hold an allowance");

    await client.staffProfile.update({ where: { id: profile.id }, data: { leaveEntitlementDays: days } });
    return this.forStaff(userId, viewer);
  }

  private present(
    row: {
      id: string;
      userId: string;
      type: string;
      fromDate: Date;
      toDate: Date;
      reason: string | null;
      status: string;
      decidedAt: Date | null;
      decidedByName: string | null;
      decisionNote: string | null;
      requestedByName: string | null;
      createdAt: Date;
    },
    viewer?: AuthenticatedUser,
  ) {
    return {
      id: row.id,
      userId: row.userId,
      type: row.type,
      typeLabel: leaveLabel(row.type),
      fromDate: row.fromDate,
      toDate: row.toDate,
      dates: describeLeave(row.fromDate, row.toDate),
      workingDays: workingDays(row.fromDate, row.toDate),
      reason: row.reason,
      status: row.status,
      decidedAt: row.decidedAt,
      decidedByName: row.decidedByName,
      decisionNote: row.decisionNote,
      requestedByName: row.requestedByName,
      canCancel: viewer
        ? canCancel({ ...row, requestedByUserId: row.userId }, viewer.id, new Date())
        : false,
      createdAt: row.createdAt,
    };
  }
}
