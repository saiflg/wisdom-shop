import { Injectable } from "@nestjs/common";
import { ControlPrismaService } from "@/control-db/control-prisma.service";
import { ProvisioningService } from "@/provisioning/provisioning.service";
import type { CreateSchoolDto } from "./dto/create-school.dto";

@Injectable()
export class SchoolsService {
  constructor(
    private readonly controlPrisma: ControlPrismaService,
    private readonly provisioning: ProvisioningService,
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
      include: { provisioningAttempts: { orderBy: { createdAt: "desc" } } },
    });
  }
}
