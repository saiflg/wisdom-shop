import { ConflictException, Injectable } from "@nestjs/common";
import type { SchoolStatus } from "ems-control-client";
import { ControlPrismaService } from "@/control-db/control-prisma.service";
import { ProvisioningService } from "@/provisioning/provisioning.service";
import { TenancyService } from "@/tenancy/tenancy.service";
import type { AuthenticatedPlatformUser } from "@/platform-auth/interfaces/platform-jwt-payload.interface";
import { explainRefusal } from "./school-lifecycle";
import type { CreateSchoolDto } from "./dto/create-school.dto";

@Injectable()
export class SchoolsService {
  constructor(
    private readonly controlPrisma: ControlPrismaService,
    private readonly provisioning: ProvisioningService,
    private readonly tenancy: TenancyService,
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

  list() {
    return this.controlPrisma.school.findMany({ orderBy: { createdAt: "desc" } });
  }

  findOne(id: string) {
    return this.controlPrisma.school.findUniqueOrThrow({
      where: { id },
      include: {
        provisioningAttempts: { orderBy: { createdAt: "desc" } },
        lifecycleEvents: { orderBy: { createdAt: "desc" } },
      },
    });
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
