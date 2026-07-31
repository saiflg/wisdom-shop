import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, RoleName } from "@prisma/client";
import * as argon2 from "argon2";
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

  /**
   * Creates a user on an admin's behalf — for staff who will never go through
   * public registration, and for support creating an account on request.
   *
   * The role is put through the *same* `canManageRole` policy as granting a
   * role to an existing user. Without that, creation would be a trivial
   * bypass: an ADMIN who cannot promote anyone to SUPER_ADMIN could simply
   * create one instead.
   */
  async createUser(
    actorUserId: string,
    actorRoles: RoleName[],
    input: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      roles?: RoleName[];
      markEmailVerified?: boolean;
    },
  ) {
    const email = input.email.toLowerCase().trim();
    const requestedRoles = input.roles ?? [];

    for (const role of requestedRoles) {
      // canManageRole always returns a decision object, so the check is on
      // `.allowed` — testing the object itself is always true and would
      // refuse every role, including the ones that are permitted.
      const decision = canManageRole(actorRoles, role);
      if (!decision.allowed) throw new ForbiddenException(decision.reason);
    }

    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) throw new ConflictException("An account with that email already exists");

    const passwordHash = await argon2.hash(input.password);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          // An admin creating the account has already established who this
          // person is, so requiring them to click a verification link adds
          // nothing. Left to the caller rather than assumed either way.
          emailVerifiedAt: input.markEmailVerified ? new Date() : null,
        },
        select: USER_SELECT,
      });

      // CUSTOMER is everyone's baseline, exactly as in public registration.
      const roleNames: RoleName[] = ["CUSTOMER", ...requestedRoles.filter((r) => r !== "CUSTOMER")];
      for (const name of roleNames) {
        const role = await tx.role.upsert({ where: { name }, update: {}, create: { name } });
        await tx.userRole.create({ data: { userId: created.id, roleId: role.id } });
      }

      return created;
    });

    await this.auditLog.record({
      userId: actorUserId,
      action: "user.created_by_admin",
      entity: "User",
      entityId: user.id,
      metadata: { email, roles: requestedRoles },
    });

    return this.findById(user.id);
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
