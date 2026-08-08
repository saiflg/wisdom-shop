import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { RoleName } from "ems-tenant-client";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { CurriculumSettingsService } from "@/curriculum-settings/curriculum-settings.service";
import { AiService } from "@/ai/ai.service";
import { canGenerateWithAi } from "./can-generate-with-ai";
import { buildSchemeOfWorkPrompt, SCHEME_OF_WORK_RESPONSE_SCHEMA } from "./scheme-of-work-prompt";
import type { CreateSchemeOfWorkDto } from "./dto/create-scheme-of-work.dto";
import type { GenerateSchemeOfWorkDto } from "./dto/generate-scheme-of-work.dto";
import type { UpdateSchemeOfWorkDto } from "./dto/update-scheme-of-work.dto";
import type { SchemeOfWorkContentDto } from "./dto/scheme-of-work-content.dto";

const STAFF_ROLES: RoleName[] = ["SCHOOL_ADMIN", "TEACHER"];

@Injectable()
export class SchemesOfWorkService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly curriculumSettings: CurriculumSettingsService,
    private readonly ai: AiService,
  ) {}

  async create(dto: CreateSchemeOfWorkDto, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    await this.assertSubjectExists(dto.subjectId);
    await this.assertNoExistingScheme(dto.subjectId, dto.academicYear, dto.term);

    return client.schemeOfWork.create({
      data: {
        subjectId: dto.subjectId,
        academicYear: dto.academicYear,
        term: dto.term,
        status: "DRAFT",
        source: "MANUAL",
        content: dto.content as unknown as object,
        createdById: viewer.id,
      },
    });
  }

  async generate(dto: GenerateSchemeOfWorkDto, viewer: AuthenticatedUser) {
    const settings = await this.curriculumSettings.get();
    if (!canGenerateWithAi(settings.mode)) {
      throw new ForbiddenException("AI generation isn't enabled for this school's curriculum mode");
    }

    const client = await this.tenantPrisma.getClient();
    const subject = await client.subject.findFirst({ where: { id: dto.subjectId, deletedAt: null } });
    if (!subject) throw new NotFoundException("No subject found with that id");
    await this.assertNoExistingScheme(dto.subjectId, dto.academicYear, dto.term);

    const prompt = buildSchemeOfWorkPrompt(subject, dto, settings);
    const content = await this.ai.generateJson<SchemeOfWorkContentDto>(prompt, SCHEME_OF_WORK_RESPONSE_SCHEMA);

    return client.schemeOfWork.create({
      data: {
        subjectId: dto.subjectId,
        academicYear: dto.academicYear,
        term: dto.term,
        status: "DRAFT",
        source: "AI_GENERATED",
        content: content as unknown as object,
        generatedAt: new Date(),
        createdById: viewer.id,
      },
    });
  }

  async list(viewer: AuthenticatedUser, subjectId?: string) {
    const client = await this.tenantPrisma.getClient();
    const isStaff = viewer.roles.some((role) => STAFF_ROLES.includes(role));
    return client.schemeOfWork.findMany({
      where: { subjectId, ...(isStaff ? {} : { status: "PUBLISHED" as const }) },
      include: { subject: true },
      orderBy: [{ academicYear: "desc" }, { term: "asc" }],
    });
  }

  async findOne(id: string, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const record = await client.schemeOfWork.findFirst({ where: { id }, include: { subject: true } });
    if (!record) throw new NotFoundException("No scheme of work found with that id");

    const isStaff = viewer.roles.some((role) => STAFF_ROLES.includes(role));
    if (!isStaff && record.status !== "PUBLISHED") {
      // 404, not 403 â€” a student/guardian must not learn an unpublished
      // scheme exists at all, same reasoning as students.service.ts.
      throw new NotFoundException("No scheme of work found with that id");
    }
    return record;
  }

  async update(id: string, dto: UpdateSchemeOfWorkDto) {
    const client = await this.tenantPrisma.getClient();
    const existing = await client.schemeOfWork.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException("No scheme of work found with that id");
    return client.schemeOfWork.update({ where: { id }, data: { content: dto.content as unknown as object } });
  }

  async publish(id: string) {
    const client = await this.tenantPrisma.getClient();
    const existing = await client.schemeOfWork.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException("No scheme of work found with that id");
    return client.schemeOfWork.update({ where: { id }, data: { status: "PUBLISHED" } });
  }

  private async assertSubjectExists(subjectId: string): Promise<void> {
    const client = await this.tenantPrisma.getClient();
    const subject = await client.subject.findFirst({ where: { id: subjectId, deletedAt: null } });
    if (!subject) throw new NotFoundException("No subject found with that id");
  }

  private async assertNoExistingScheme(subjectId: string, academicYear: string, term: string): Promise<void> {
    const client = await this.tenantPrisma.getClient();
    const existing = await client.schemeOfWork.findFirst({ where: { subjectId, academicYear, term } });
    if (existing) {
      throw new ConflictException("A scheme of work already exists for that subject, year, and term");
    }
  }
}

