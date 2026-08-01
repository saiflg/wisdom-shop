import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { CreateEnrollmentDto } from "./dto/create-enrollment.dto";
import type { UpdateEnrollmentDto } from "./dto/update-enrollment.dto";

@Injectable()
export class EnrollmentsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(dto: CreateEnrollmentDto) {
    const client = await this.tenantPrisma.getClient();

    const [student, klass] = await Promise.all([
      client.studentProfile.findFirst({ where: { id: dto.studentProfileId, deletedAt: null } }),
      client.class.findFirst({ where: { id: dto.classId, deletedAt: null } }),
    ]);
    if (!student) throw new NotFoundException("No student found with that id");
    if (!klass) throw new NotFoundException("No class found with that id");

    // No @@unique on (studentProfileId, classId) in the schema — a student
    // can withdraw and re-enrol — so "no second ACTIVE row" is enforced
    // here rather than by the database.
    const existingActive = await client.enrollment.findFirst({
      where: { studentProfileId: dto.studentProfileId, classId: dto.classId, status: "ACTIVE" },
    });
    if (existingActive) {
      throw new ConflictException("This student is already actively enrolled in this class");
    }

    return client.enrollment.create({
      data: { studentProfileId: dto.studentProfileId, classId: dto.classId },
    });
  }

  async update(id: string, dto: UpdateEnrollmentDto) {
    const client = await this.tenantPrisma.getClient();
    const existing = await client.enrollment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("No enrollment found with that id");

    const endDate = dto.status === "ACTIVE" ? null : new Date();
    return client.enrollment.update({ where: { id }, data: { status: dto.status, endDate } });
  }
}
