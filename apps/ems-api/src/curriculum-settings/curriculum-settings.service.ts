import { Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { UpdateCurriculumSettingsDto } from "./dto/update-curriculum-settings.dto";

@Injectable()
export class CurriculumSettingsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /**
   * Seeded once at provisioning time (ProvisioningService.seedSchoolAdmin) —
   * this should always find exactly one row. NotFoundException here would
   * mean a school predates that seeding and was never backfilled.
   */
  async get() {
    const client = await this.tenantPrisma.getClient();
    const record = await client.curriculumSettings.findFirst();
    if (!record) throw new NotFoundException("Curriculum settings haven't been set up for this school");
    return record;
  }

  async update(dto: UpdateCurriculumSettingsDto) {
    const existing = await this.get();
    const client = await this.tenantPrisma.getClient();
    return client.curriculumSettings.update({ where: { id: existing.id }, data: dto });
  }
}
