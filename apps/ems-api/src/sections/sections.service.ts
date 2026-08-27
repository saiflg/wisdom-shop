import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { CreateSectionDto } from "./dto/create-section.dto";
import type { UpdateSectionDto } from "./dto/update-section.dto";
import type { AssignClassesDto } from "./dto/assign-classes.dto";
import { isDuplicateName } from "./duplicate-name";

@Injectable()
export class SectionsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(dto: CreateSectionDto) {
    const client = await this.tenantPrisma.getClient();

    /*
     * Position is "after everything that already exists" when it is not
     * given, so a school adding Nursery, Primary, Secondary in that order
     * gets that order without being asked to number them.
     */
    const position =
      dto.position ??
      ((await client.section.aggregate({ where: { deletedAt: null }, _max: { position: true } }))._max
        .position ?? -1) + 1;

    try {
      return await client.section.create({ data: { ...dto, position } });
    } catch (error) {
      // The unique index decides, not a read-then-write: two admins adding
      // "Primary" at the same moment both pass any prior check.
      if (isDuplicateName(error)) {
        throw new ConflictException("A section with that name already exists");
      }
      throw error;
    }
  }

  async list() {
    const client = await this.tenantPrisma.getClient();
    return client.section.findMany({
      where: { deletedAt: null },
      orderBy: [{ position: "asc" }, { name: "asc" }],
      include: {
        head: { select: { id: true, firstName: true, lastName: true } },
        // The count is what the screen is actually for: a section with no
        // classes in it is the thing an admin needs to see.
        _count: { select: { classes: true } },
      },
    });
  }

  async findOne(id: string) {
    const client = await this.tenantPrisma.getClient();
    const record = await client.section.findFirst({
      where: { id, deletedAt: null },
      include: {
        head: { select: { id: true, firstName: true, lastName: true } },
        classes: {
          where: { deletedAt: null },
          orderBy: { name: "asc" },
          select: { id: true, name: true, gradeLevel: true, academicYear: true },
        },
      },
    });
    if (!record) throw new NotFoundException("No section found with that id");
    return record;
  }

  async update(id: string, dto: UpdateSectionDto) {
    await this.findOne(id);
    const client = await this.tenantPrisma.getClient();
    try {
      return await client.section.update({ where: { id }, data: dto });
    } catch (error) {
      if (isDuplicateName(error)) {
        throw new ConflictException("A section with that name already exists");
      }
      throw error;
    }
  }

  /**
   * Set which classes belong to this section.
   *
   * Written as "these are the members now" rather than add/remove, in one
   * transaction: classes that were in the section and are not in the new list
   * are released, the listed ones are claimed. A class can only be in one
   * section, so claiming it here is also how it leaves wherever it was.
   */
  async assignClasses(id: string, dto: AssignClassesDto) {
    await this.findOne(id);
    const client = await this.tenantPrisma.getClient();

    const known = await client.class.findMany({
      where: { id: { in: dto.classIds }, deletedAt: null },
      select: { id: true },
    });
    if (known.length !== new Set(dto.classIds).size) {
      throw new NotFoundException("One or more of those classes does not exist");
    }

    await client.$transaction([
      client.class.updateMany({
        where: { sectionId: id, id: { notIn: dto.classIds } },
        data: { sectionId: null },
      }),
      client.class.updateMany({ where: { id: { in: dto.classIds } }, data: { sectionId: id } }),
    ]);

    return this.findOne(id);
  }

  /**
   * Soft-delete a section.
   *
   * Its classes are released rather than removed. A school reorganising its
   * wings must never lose a class — and with it every child enrolled in one —
   * because somebody tidied up a menu.
   */
  async remove(id: string) {
    await this.findOne(id);
    const client = await this.tenantPrisma.getClient();
    await client.$transaction([
      client.class.updateMany({ where: { sectionId: id }, data: { sectionId: null } }),
      client.section.update({ where: { id }, data: { deletedAt: new Date() } }),
    ]);
  }
}
