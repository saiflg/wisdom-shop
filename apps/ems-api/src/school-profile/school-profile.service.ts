import { BadRequestException, Injectable } from "@nestjs/common";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import { TenancyService } from "@/tenancy/tenancy.service";
import { getTenantContext } from "@/tenancy/tenant-context";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { schoolNameFor } from "@/messaging/school-name";
import type { UpdateSchoolProfileDto } from "./dto/update-school-profile.dto";
import { documentHeaderLines, validateEstablishedYear } from "./profile-format";

@Injectable()
export class SchoolProfileService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tenancy: TenancyService,
  ) {}

  /**
   * The profile, or null when a school has never filled one in.
   *
   * Null rather than a row of empty strings, so the screen can tell "not set
   * up yet" from "set up and deliberately blank" and say so.
   */
  async get() {
    const client = await this.tenantPrisma.getClient();
    const row = await client.schoolProfile.findFirst();
    return row ?? null;
  }

  async update(dto: UpdateSchoolProfileDto, actor: AuthenticatedUser) {
    if (dto.establishedYear !== undefined && dto.establishedYear !== null) {
      const problem = validateEstablishedYear(dto.establishedYear, new Date().getFullYear());
      if (problem) throw new BadRequestException(problem);
    }

    const client = await this.tenantPrisma.getClient();
    const existing = await client.schoolProfile.findFirst({ select: { id: true } });
    const data = { ...dto, updatedByUserId: actor.id };

    if (existing) {
      return client.schoolProfile.update({ where: { id: existing.id }, data });
    }
    return client.schoolProfile.create({ data });
  }

  /**
   * What heads a printed document: the school's name, then whatever of its
   * particulars it has actually filled in.
   *
   * The name comes from `schoolNameFor`, the same function that decides how a
   * receipt is signed. Until now the PDF path used the tenant slug directly,
   * so every report card and transcript this school issued was headed
   * "demo-academy" — the internal identifier, printed on a document a parent
   * keeps. Two places deciding what a school is called is exactly how they
   * came to disagree, so there is now one.
   */
  async documentHeader(): Promise<string[]> {
    const client = await this.tenantPrisma.getClient();
    const context = getTenantContext();

    // The registered name lives in the control database, not in the tenant
    // one and not in the request context — the same three sources messaging
    // uses to sign a receipt, resolved the same way.
    const [branding, school, profile] = await Promise.all([
      client.brandingSettings.findFirst({ select: { displayName: true } }),
      this.tenancy.resolveSchoolById(this.tenantPrisma.currentSchoolId),
      client.schoolProfile.findFirst(),
    ]);

    const name = schoolNameFor({
      displayName: branding?.displayName,
      registeredName: school?.name,
      slug: context?.schoolSlug ?? null,
    });

    return documentHeaderLines(name, profile);
  }
}
