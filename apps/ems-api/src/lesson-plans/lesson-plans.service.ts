import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { RoleName } from "ems-tenant-client";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { CurriculumSettingsService } from "@/curriculum-settings/curriculum-settings.service";
import { AiService } from "@/ai/ai.service";
import { canGenerateWithAi } from "@/schemes-of-work/can-generate-with-ai";
import { buildLessonPlanPrompt, LESSON_PLAN_RESPONSE_SCHEMA, type SourceWeek } from "./lesson-plan-prompt";
import type { CreateLessonPlanDto } from "./dto/create-lesson-plan.dto";
import type { GenerateLessonPlanDto } from "./dto/generate-lesson-plan.dto";
import type { UpdateLessonPlanDto } from "./dto/update-lesson-plan.dto";
import type { LessonPlanContentDto } from "./dto/lesson-plan-content.dto";

const STAFF_ROLES: RoleName[] = ["SCHOOL_ADMIN", "TEACHER"];

@Injectable()
export class LessonPlansService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly curriculumSettings: CurriculumSettingsService,
    private readonly ai: AiService,
  ) {}

  async create(dto: CreateLessonPlanDto, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    await this.findSourceWeek(dto.schemeOfWorkId, dto.weekNumber);
    await this.assertNoExistingPlan(dto.schemeOfWorkId, dto.weekNumber);

    return client.lessonPlan.create({
      data: {
        schemeOfWorkId: dto.schemeOfWorkId,
        weekNumber: dto.weekNumber,
        status: "DRAFT",
        source: "MANUAL",
        content: dto.content as unknown as object,
        createdById: viewer.id,
      },
    });
  }

  async generate(dto: GenerateLessonPlanDto, viewer: AuthenticatedUser) {
    const settings = await this.curriculumSettings.get();
    if (!canGenerateWithAi(settings.mode)) {
      throw new ForbiddenException("AI generation isn't enabled for this school's curriculum mode");
    }

    const { scheme, week } = await this.findSourceWeek(dto.schemeOfWorkId, dto.weekNumber);
    await this.assertNoExistingPlan(dto.schemeOfWorkId, dto.weekNumber);

    const prompt = buildLessonPlanPrompt(scheme.subject, week, settings);
    const content = await this.ai.generateJson<LessonPlanContentDto>(prompt, LESSON_PLAN_RESPONSE_SCHEMA);

    const client = await this.tenantPrisma.getClient();
    return client.lessonPlan.create({
      data: {
        schemeOfWorkId: dto.schemeOfWorkId,
        weekNumber: dto.weekNumber,
        status: "DRAFT",
        source: "AI_GENERATED",
        content: content as unknown as object,
        generatedAt: new Date(),
        createdById: viewer.id,
      },
    });
  }

  async list(viewer: AuthenticatedUser, schemeOfWorkId?: string) {
    const client = await this.tenantPrisma.getClient();
    const isStaff = viewer.roles.some((role) => STAFF_ROLES.includes(role));
    return client.lessonPlan.findMany({
      where: { schemeOfWorkId, ...(isStaff ? {} : { status: "PUBLISHED" as const }) },
      include: { schemeOfWork: { include: { subject: true } } },
      // Group by scheme first so the unfiltered list doesn't interleave
      // every scheme's week 1, then week 2, and so on.
      orderBy: [{ schemeOfWorkId: "asc" }, { weekNumber: "asc" }],
    });
  }

  async findOne(id: string, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const record = await client.lessonPlan.findFirst({
      where: { id },
      include: { schemeOfWork: { include: { subject: true } } },
    });
    if (!record) throw new NotFoundException("No lesson plan found with that id");

    const isStaff = viewer.roles.some((role) => STAFF_ROLES.includes(role));
    if (!isStaff && record.status !== "PUBLISHED") {
      // 404, not 403 — same reasoning as schemes-of-work.service.ts.
      throw new NotFoundException("No lesson plan found with that id");
    }
    return record;
  }

  async update(id: string, dto: UpdateLessonPlanDto) {
    const client = await this.tenantPrisma.getClient();
    const existing = await client.lessonPlan.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException("No lesson plan found with that id");
    return client.lessonPlan.update({ where: { id }, data: { content: dto.content as unknown as object } });
  }

  async publish(id: string) {
    const client = await this.tenantPrisma.getClient();
    const existing = await client.lessonPlan.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException("No lesson plan found with that id");
    return client.lessonPlan.update({ where: { id }, data: { status: "PUBLISHED" } });
  }

  private async findSourceWeek(schemeOfWorkId: string, weekNumber: number) {
    const client = await this.tenantPrisma.getClient();
    const scheme = await client.schemeOfWork.findFirst({
      where: { id: schemeOfWorkId },
      include: { subject: true },
    });
    if (!scheme) throw new NotFoundException("No scheme of work found with that id");

    const weeks = (scheme.content as unknown as { weeks: SourceWeek[] }).weeks;
    const week = weeks.find((w) => w.weekNumber === weekNumber);
    if (!week) throw new NotFoundException(`That scheme of work has no week ${weekNumber}`);

    return { scheme, week };
  }

  private async assertNoExistingPlan(schemeOfWorkId: string, weekNumber: number): Promise<void> {
    const client = await this.tenantPrisma.getClient();
    const existing = await client.lessonPlan.findFirst({ where: { schemeOfWorkId, weekNumber } });
    if (existing) {
      throw new ConflictException("A lesson plan already exists for that week of this scheme of work");
    }
  }
}

