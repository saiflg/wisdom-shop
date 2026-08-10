import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { Prisma, type SchoolStatus } from "ems-control-client";
import { ControlPrismaService } from "@/control-db/control-prisma.service";
import { ProvisioningService } from "@/provisioning/provisioning.service";
import { TenancyService } from "@/tenancy/tenancy.service";
import type { AuthenticatedPlatformUser } from "@/platform-auth/interfaces/platform-jwt-payload.interface";
import { explainRefusal } from "./school-lifecycle";
import { SchoolModulesService } from "./school-modules.service";
import {
  CORE_MODULES,
  isModuleKey,
  moduleLabel,
  parseModuleOverrides,
  resolveModules,
} from "./school-modules";
import type { CreateSchoolDto } from "./dto/create-school.dto";
import type { SetSchoolModulesDto, UpdateSchoolDto } from "./dto/update-school.dto";

const UNIQUE_VIOLATION = "P2002";

@Injectable()
export class SchoolsService {
  constructor(
    private readonly controlPrisma: ControlPrismaService,
    private readonly provisioning: ProvisioningService,
    private readonly tenancy: TenancyService,
    private readonly schoolModules: SchoolModulesService,
  ) {}

  async create(dto: CreateSchoolDto) {
    const school = await this.provisioning.provisionSchool({
      name: dto.name,
      slug: dto.slug,
      adminEmail: dto.adminEmail,
      adminPassword: dto.adminPassword,
      adminFirstName: dto.adminFirstName,
      adminLastName: dto.adminLastName,
    });
    return { school: { id: school.id, name: school.name, slug: school.slug, status: school.status } };
  }

  async retryProvisioning(schoolId: string, dto: CreateSchoolDto) {
    const school = await this.provisioning.retryProvisioning(schoolId, {
      name: dto.name,
      slug: dto.slug,
      adminEmail: dto.adminEmail,
      adminPassword: dto.adminPassword,
      adminFirstName: dto.adminFirstName,
      adminLastName: dto.adminLastName,
    });
    return { school: { id: school.id, name: school.name, slug: school.slug, status: school.status } };
  }

  async list() {
    const schools = await this.controlPrisma.school.findMany({
      orderBy: { createdAt: "desc" },
      include: { subscription: { select: { plan: { select: { modules: true } } } } },
    });

    return schools.map((school) => ({
      ...school,
      modules: resolveModules({
        planModules: school.subscription?.plan.modules ?? null,
        overrides: school.moduleOverrides,
      }),
    }));
  }

  async findOne(id: string) {
    const school = await this.controlPrisma.school.findUniqueOrThrow({
      where: { id },
      include: {
        provisioningAttempts: { orderBy: { createdAt: "desc" } },
        lifecycleEvents: { orderBy: { createdAt: "desc" } },
        moduleChanges: { orderBy: { createdAt: "desc" }, take: 50 },
        subscription: { select: { plan: { select: { code: true, name: true, modules: true } } } },
      },
    });

    return {
      ...school,
      // What the plan grants, kept separate from what this school actually
      // has: an operator looking at a toggle needs to know whether it is on
      // because of the plan or because somebody made an exception.
      planModules: (school.subscription?.plan.modules ?? []).filter(isModuleKey),
      overrides: parseModuleOverrides(school.moduleOverrides),
      modules: resolveModules({
        planModules: school.subscription?.plan.modules ?? null,
        overrides: school.moduleOverrides,
      }),
    };
  }

  /**
   * Edits the school's own details.
   *
   * An empty `customDomain` clears it, which is distinct from omitting the
   * field. Without that there would be no way to take a domain back off a
   * school that stopped using it, and the unique constraint would then block
   * anyone else from ever claiming it.
   */
  async update(schoolId: string, dto: UpdateSchoolDto) {
    await this.controlPrisma.school.findUniqueOrThrow({ where: { id: schoolId } });

    const customDomain =
      dto.customDomain === undefined ? undefined : dto.customDomain.trim().toLowerCase() || null;

    try {
      const updated = await this.controlPrisma.school.update({
        where: { id: schoolId },
        data: {
          ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
          ...(customDomain === undefined ? {} : { customDomain }),
        },
      });
      // A renamed school shows the old name on its own login page until the
      // cache expires, and a changed custom domain resolves to nothing (or,
      // worse, to the previous school) for the same minute.
      this.tenancy.invalidateSchool(schoolId);
      return updated;
    } catch (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
        throw new ConflictException("Another school already uses that domain");
      }
      throw error;
    }
  }

  /**
   * Switches modules on or off for one school.
   *
   * Stores only the *differences* from the plan. Writing the full resolved
   * set would freeze this school's entitlements at today's plan: upgrading
   * the plan later would then change nothing, because every module would
   * already have an explicit override recorded against it.
   */
  async setModules(schoolId: string, dto: SetSchoolModulesDto, actor: AuthenticatedPlatformUser) {
    const school = await this.controlPrisma.school.findUniqueOrThrow({
      where: { id: schoolId },
      include: { subscription: { select: { plan: { select: { modules: true } } } } },
    });
    const actorUser = await this.controlPrisma.platformUser.findUniqueOrThrow({ where: { id: actor.id } });

    const planModules = school.subscription?.plan.modules ?? null;
    const before = resolveModules({ planModules, overrides: school.moduleOverrides });
    const overrides = parseModuleOverrides(school.moduleOverrides);

    for (const toggle of dto.modules) {
      // A core module cannot be turned off, so recording an override saying
      // otherwise would be a lie in the audit log about something that never
      // took effect.
      if (CORE_MODULES.includes(toggle.module) && !toggle.enabled) {
        throw new BadRequestException(`${moduleLabel(toggle.module)} cannot be switched off`);
      }

      const grantedByPlan = resolveModules({ planModules }).includes(toggle.module);
      if (grantedByPlan === toggle.enabled) delete overrides[toggle.module];
      else overrides[toggle.module] = toggle.enabled;
    }

    const after = resolveModules({ planModules, overrides });
    const changed = [...new Set([...before, ...after])].filter(
      (key) => before.includes(key) !== after.includes(key),
    );

    await this.controlPrisma.$transaction([
      this.controlPrisma.school.update({
        where: { id: schoolId },
        data: {
          moduleOverrides: Object.keys(overrides).length > 0 ? overrides : Prisma.DbNull,
        },
      }),
      ...changed.map((module) =>
        this.controlPrisma.schoolModuleChange.create({
          data: {
            schoolId,
            module,
            enabled: after.includes(module),
            reason: dto.reason,
            actorPlatformUserId: actorUser.id,
            actorEmail: actorUser.email,
          },
        }),
      ),
    ]);

    // Otherwise a module switched off keeps answering for up to a minute,
    // which during a demo is exactly the minute somebody is watching.
    this.schoolModules.invalidate(schoolId);
    this.tenancy.invalidateSchool(schoolId);

    return this.findOne(schoolId);
  }

  suspend(schoolId: string, reason: string, actor: AuthenticatedPlatformUser) {
    return this.transition(schoolId, "SUSPENDED", reason, actor);
  }

  reactivate(schoolId: string, reason: string, actor: AuthenticatedPlatformUser) {
    return this.transition(schoolId, "ACTIVE", reason, actor);
  }

  /**
   * Status change plus its audit record, written together so a school can
   * never end up suspended with no record of who did it or why.
   */
  private async transition(
    schoolId: string,
    toStatus: SchoolStatus,
    reason: string,
    actor: AuthenticatedPlatformUser,
  ) {
    const school = await this.controlPrisma.school.findUniqueOrThrow({ where: { id: schoolId } });

    const refusal = explainRefusal(school.status, toStatus);
    if (refusal) throw new ConflictException(refusal);

    const actorUser = await this.controlPrisma.platformUser.findUniqueOrThrow({ where: { id: actor.id } });

    const [updated] = await this.controlPrisma.$transaction([
      this.controlPrisma.school.update({ where: { id: schoolId }, data: { status: toStatus } }),
      this.controlPrisma.schoolLifecycleEvent.create({
        data: {
          schoolId,
          fromStatus: school.status,
          toStatus,
          reason,
          actorPlatformUserId: actorUser.id,
          actorEmail: actorUser.email,
        },
      }),
    ]);

    // Without this the change is invisible for up to SCHOOL_CACHE_TTL_MS —
    // a suspended school would keep serving requests for another minute.
    // Note this only clears *this* process's cache; other API instances
    // still catch up via the TTL rather than instantly. Making suspension
    // immediate fleet-wide needs a shared invalidation channel, which is a
    // deliberate non-goal while this runs single-node.
    this.tenancy.invalidateSchool(schoolId);

    return updated;
  }
}
