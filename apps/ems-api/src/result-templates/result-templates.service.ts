import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { CreateResultTemplateDto } from "./dto/create-result-template.dto";
import type { UpdateResultTemplateDto } from "./dto/update-result-template.dto";
import type { ApplyResultTemplateDto } from "./dto/apply-result-template.dto";
import { planAssessments, validateTemplate } from "./plan-assessments";

@Injectable()
export class ResultTemplatesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(dto: CreateResultTemplateDto) {
    const problem = validateTemplate(dto.components);
    if (problem) throw new BadRequestException(problem);

    const client = await this.tenantPrisma.getClient();
    try {
      return await client.resultTemplate.create({
        data: {
          name: dto.name,
          description: dto.description,
          isDefault: dto.isDefault ?? false,
          components: {
            create: dto.components.map((component, index) => ({
              name: component.name.trim(),
              maxScoreHundredths: component.maxScoreHundredths,
              weightPercent: component.weightPercent,
              position: index,
            })),
          },
        },
        include: { components: { orderBy: { position: "asc" } } },
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") {
        throw new ConflictException("A result template with that name already exists");
      }
      throw error;
    }
  }

  async list() {
    const client = await this.tenantPrisma.getClient();
    return client.resultTemplate.findMany({
      where: { deletedAt: null },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      include: { components: { orderBy: { position: "asc" } } },
    });
  }

  async findOne(id: string) {
    const client = await this.tenantPrisma.getClient();
    const record = await client.resultTemplate.findFirst({
      where: { id, deletedAt: null },
      include: { components: { orderBy: { position: "asc" } } },
    });
    if (!record) throw new NotFoundException("No result template found with that id");
    return record;
  }

  /**
   * Update a template, replacing its components when new ones are given.
   *
   * Replaced wholesale rather than patched row by row: the weights have to
   * sum to 100 across the whole set, so there is no such thing as a valid
   * change to one component on its own.
   */
  async update(id: string, dto: UpdateResultTemplateDto) {
    await this.findOne(id);
    const client = await this.tenantPrisma.getClient();

    if (dto.components) {
      const problem = validateTemplate(dto.components);
      if (problem) throw new BadRequestException(problem);
    }

    try {
      return await client.resultTemplate.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description,
          isDefault: dto.isDefault,
          ...(dto.components
            ? {
                components: {
                  deleteMany: {},
                  create: dto.components.map((component, index) => ({
                    name: component.name.trim(),
                    maxScoreHundredths: component.maxScoreHundredths,
                    weightPercent: component.weightPercent,
                    position: index,
                  })),
                },
              }
            : {}),
        },
        include: { components: { orderBy: { position: "asc" } } },
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") {
        throw new ConflictException("A result template with that name already exists");
      }
      throw error;
    }
  }

  /**
   * Write this template's shape as real assessments for a class and term.
   *
   * Idempotent by way of the unique index on assessments
   * (subject, class, year, term, name): applying twice creates nothing the
   * second time. That matters because an admin who is unsure whether the
   * first click worked will click again, and the alternative — a read of
   * what exists followed by a write — races with a colleague doing the same
   * thing in the next room.
   *
   * The counts come back so the screen can say "40 created, 8 already there"
   * instead of a silent success that leaves somebody wondering.
   */
  async apply(id: string, dto: ApplyResultTemplateDto) {
    const template = await this.findOne(id);
    const client = await this.tenantPrisma.getClient();

    const schoolClass = await client.class.findFirst({ where: { id: dto.classId, deletedAt: null } });
    if (!schoolClass) throw new NotFoundException("No class found with that id");

    const subjects = await client.subject.findMany({
      where: { id: { in: dto.subjectIds }, deletedAt: null },
      select: { id: true },
    });
    if (subjects.length !== new Set(dto.subjectIds).size) {
      throw new NotFoundException("One or more of those subjects does not exist");
    }

    const planned = planAssessments({
      components: template.components,
      subjectIds: dto.subjectIds,
      classId: dto.classId,
      academicYear: dto.academicYear,
      term: dto.term,
    });

    const { count } = await client.assessment.createMany({ data: planned, skipDuplicates: true });

    return {
      planned: planned.length,
      created: count,
      // Not "failed": an assessment that is already there is the desired
      // state, and a second click reporting eight failures would read as
      // something having gone wrong when nothing did.
      alreadyPresent: planned.length - count,
    };
  }

  /**
   * Soft-delete a template.
   *
   * Assessments it has already created are untouched. They stopped being the
   * template's business the moment they were written — a class part-way
   * through a term must not lose the shape it is being marked against
   * because somebody tidied the template list.
   */
  async remove(id: string) {
    await this.findOne(id);
    const client = await this.tenantPrisma.getClient();
    await client.resultTemplate.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
