import { Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { CreateClassDto } from "./dto/create-class.dto";
import type { UpdateClassDto } from "./dto/update-class.dto";

@Injectable()
export class ClassesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(dto: CreateClassDto) {
    const client = await this.tenantPrisma.getClient();
    return client.class.create({ data: dto });
  }

  async list() {
    const client = await this.tenantPrisma.getClient();
    return client.class.findMany({
      where: { deletedAt: null },
      include: { homeroomTeacher: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: [{ academicYear: "desc" }, { name: "asc" }],
    });
  }

  /**
   * The classes this person is actually in — enrolled in, or teaching.
   *
   * Distinct from `list()`, which is every class in the school. A student
   * opening an AI lesson needs to know which conversation is theirs, and
   * "pick from all forty classes" is not an answer. Returns an empty list for
   * an administrator, who belongs to none of them.
   */
  async mine(userId: string) {
    const client = await this.tenantPrisma.getClient();
    return client.class.findMany({
      where: {
        deletedAt: null,
        OR: [
          { homeroomTeacherId: userId },
          { teachingAssignments: { some: { teacherUserId: userId } } },
          { enrollments: { some: { status: "ACTIVE", studentProfile: { userId } } } },
        ],
      },
      select: { id: true, name: true, gradeLevel: true, academicYear: true },
      orderBy: [{ academicYear: "desc" }, { name: "asc" }],
    });
  }

  async findOne(id: string) {
    const client = await this.tenantPrisma.getClient();
    const record = await client.class.findFirst({
      where: { id, deletedAt: null },
      include: {
        homeroomTeacher: { select: { id: true, firstName: true, lastName: true } },
        enrollments: {
          where: { status: "ACTIVE" },
          include: { studentProfile: { include: { user: { select: { id: true, firstName: true, lastName: true } } } } },
        },
      },
    });
    if (!record) throw new NotFoundException("No class found with that id");
    return record;
  }

  async update(id: string, dto: UpdateClassDto) {
    await this.findOne(id);
    const client = await this.tenantPrisma.getClient();
    return client.class.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    const client = await this.tenantPrisma.getClient();
    await client.class.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
