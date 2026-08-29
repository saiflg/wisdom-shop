import { Injectable, NotFoundException } from "@nestjs/common";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { canSeeClassRoster } from "./class-visibility";
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

  /**
   * One class, with its roster only for viewers entitled to it.
   *
   * The class itself — name, year, homeroom teacher — is the school
   * describing its own shape, so it is returned to anyone signed in; a
   * timetable screen needs to name the class. The list of children in it is a
   * different thing, and is withheld rather than 404ing the whole class.
   *
   * `enrollments` is omitted entirely for viewers who may not see it, never
   * returned as an empty array: an empty roster is a claim that the class has
   * no pupils, which is false.
   */
  async findOne(id: string, viewer?: AuthenticatedUser) {
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

    // No viewer means an internal caller that has already decided (update and
    // remove use this only to check the class exists).
    if (!viewer) return record;

    const classIds = await this.classIdsFor(viewer);
    if (canSeeClassRoster({ roles: viewer.roles, classIds }, id)) return record;

    const { enrollments, ...withoutRoster } = record;
    return { ...withoutRoster, studentCount: enrollments.length };
  }

  /** The classes this viewer is enrolled in or teaches. */
  private async classIdsFor(viewer: AuthenticatedUser): Promise<string[]> {
    const client = await this.tenantPrisma.getClient();
    const [enrolled, taught] = await Promise.all([
      client.enrollment.findMany({
        where: { status: "ACTIVE", studentProfile: { userId: viewer.id } },
        select: { classId: true },
      }),
      client.teachingAssignment.findMany({
        where: { teacherUserId: viewer.id },
        select: { classId: true },
      }),
    ]);
    return [...enrolled.map((e) => e.classId), ...taught.map((t) => t.classId)];
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
