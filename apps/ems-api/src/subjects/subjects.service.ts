import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { CreateSubjectDto } from "./dto/create-subject.dto";
import type { UpdateSubjectDto } from "./dto/update-subject.dto";

@Injectable()
export class SubjectsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(dto: CreateSubjectDto) {
    const client = await this.tenantPrisma.getClient();
    const existing = await client.subject.findFirst({
      where: { name: dto.name, gradeLevel: dto.gradeLevel ?? null, deletedAt: null },
    });
    if (existing) throw new ConflictException("A subject with that name and grade level already exists");
    return client.subject.create({ data: dto });
  }

  async list() {
    const client = await this.tenantPrisma.getClient();
    return client.subject.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } });
  }

  async findOne(id: string) {
    const client = await this.tenantPrisma.getClient();
    const record = await client.subject.findFirst({ where: { id, deletedAt: null } });
    if (!record) throw new NotFoundException("No subject found with that id");
    return record;
  }

  async update(id: string, dto: UpdateSubjectDto) {
    await this.findOne(id);
    const client = await this.tenantPrisma.getClient();
    return client.subject.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    const client = await this.tenantPrisma.getClient();
    await client.subject.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
