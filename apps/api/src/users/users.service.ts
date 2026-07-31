import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, RoleName } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../common/audit/audit-log.service";
import { canManageRole, wouldSelfLockOut } from "./role-policy";

const USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  emailVerifiedAt: true,
  twoFactorEnabled: true,
  createdAt: true,
  deletedAt: true,
  roles: { select: { role: { select: { name: true } } } },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async list(query: { page?: number; limit?: number; search?: string; role?: RoleName }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: "insensitive" as const } },
              { firstName: { contains: query.search, mode: "insensitive" as const } },
              { lastName: { contains: query.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
      ...(query.role ? { roles: { some: { role: { name: query.role } } } } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: USER_SELECT,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: data.map((u) => ({ ...u, roles: u.roles.map((r) => r.role.name) })),
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async findById(id: string) {
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null }, select: USER_SELECT });
    if (!user) throw new NotFoundException("User not found");
    return { ...user, roles: user.roles.map((r) => r.role.name) };
  }

  private async rolesOf(userId: string): Promise<RoleName[]> {
    const rows = await this.prisma.userRole.findMany({
      where: { userId },
      select: { role: { select: { name: true } } },
    });
    return rows.map((r) => r.role.name);
  }

  async grantRole(actorUserId: string, actorRoles: RoleName[], targetUserId: string, role: RoleName) {
    const decision = canManageRole(actorRoles, role);
    if (!decision.allowed) throw new ForbiddenException(decision.reason);

    const target = await this.prisma.user.findFirst({
      where: { id: targetUserId, deletedAt: null },
      select: { id: true },
    });
    if (!target) throw new NotFoundException("User not found");

    const existing = await this.rolesOf(targetUserId);
    if (existing.includes(role)) {
      throw new ConflictException(`User already has the ${role} role`);
    }

    const roleRecord = await this.prisma.role.upsert({
      where: { name: role },
      update: {},
      create: { name: role },
    });
    await this.prisma.userRole.create({ data: { userId: targetUserId, roleId: roleRecord.id } });

    await this.auditLog.record({
      userId: actorUserId,
      action: "user.role_granted",
      entity: "User",
      entityId: targetUserId,
      metadata: { role },
    });

    return this.findById(targetUserId);
  }

  async revokeRole(actorUserId: string, actorRoles: RoleName[], targetUserId: string, role: RoleName) {
    const decision = canManageRole(actorRoles, role);
    if (!decision.allowed) throw new ForbiddenException(decision.reason);

    const target = await this.prisma.user.findFirst({
      where: { id: targetUserId, deletedAt: null },
      select: { id: true },
    });
    if (!target) throw new NotFoundException("User not found");

    const existing = await this.rolesOf(targetUserId);
    if (!existing.includes(role)) {
      throw new ConflictException(`User does not have the ${role} role`);
    }

    if (wouldSelfLockOut(actorUserId, targetUserId, role, existing)) {
      throw new ConflictException(
        "You cannot remove your own last administrative role — ask another super admin to do it",
      );
    }

    const roleRecord = await this.prisma.role.findUnique({ where: { name: role } });
    if (roleRecord) {
      await this.prisma.userRole.deleteMany({ where: { userId: targetUserId, roleId: roleRecord.id } });
    }

    await this.auditLog.record({
      userId: actorUserId,
      action: "user.role_revoked",
      entity: "User",
      entityId: targetUserId,
      metadata: { role },
    });

    return this.findById(targetUserId);
  }
}
