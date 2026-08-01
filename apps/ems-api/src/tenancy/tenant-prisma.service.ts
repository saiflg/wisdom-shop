import { Injectable, InternalServerErrorException } from "@nestjs/common";
import type { PrismaClient as TenantPrismaClient } from "ems-tenant-client";
import { getTenantContext } from "./tenant-context";
import { TenancyService } from "./tenancy.service";

/**
 * Plain singleton facade — NOT a Nest REQUEST-scoped provider (see
 * tenant-context.ts for why). Inject this once into any tenant-scoped
 * controller/service and call `await this.tenantPrisma.getClient()` to get
 * the Prisma client already pointed at the current request's school.
 */
@Injectable()
export class TenantPrismaService {
  constructor(private readonly tenancy: TenancyService) {}

  async getClient(): Promise<TenantPrismaClient> {
    const ctx = getTenantContext();
    if (!ctx) {
      // A real bug — a tenant-scoped service was reached outside a
      // tenant-authenticated request (e.g. called from a platform route,
      // or the interceptor wasn't registered) — never silently undefined.
      throw new InternalServerErrorException(
        "Tenant Prisma client requested outside a tenant-scoped request",
      );
    }
    return this.tenancy.getClientForSchool(ctx.schoolId);
  }

  get currentSchoolId(): string {
    const ctx = getTenantContext();
    if (!ctx) {
      throw new InternalServerErrorException("Tenant context requested outside a tenant-scoped request");
    }
    return ctx.schoolId;
  }

  get currentUserId(): string {
    const ctx = getTenantContext();
    if (!ctx) {
      throw new InternalServerErrorException("Tenant context requested outside a tenant-scoped request");
    }
    return ctx.userId;
  }
}
