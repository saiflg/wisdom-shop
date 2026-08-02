import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { RoleName } from "ems-tenant-client";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { CurriculumSettingsService } from "@/curriculum-settings/curriculum-settings.service";
import { GeminiService } from "@/ai/gemini.service";
import { canGenerateWithAi } from "@/schemes-of-work/can-generate-with-ai";
import type { SourceWeek } from "@/lesson-plans/lesson-plan-prompt";
import { buildQuizPrompt, QUIZ_RESPONSE_SCHEMA } from "./quiz-prompt";
import { stripAnswers } from "./strip-answers";
import type { CreateQuizDto } from "./dto/create-quiz.dto";
import type { GenerateQuizDto } from "./dto/generate-quiz.dto";
import type { UpdateQuizDto } from "./dto/update-quiz.dto";
import type { QuizContentDto } from "./dto/quiz-content.dto";

const STAFF_ROLES: RoleName[] = ["SCHOOL_ADMIN", "TEACHER"];

function isStaff(viewer: AuthenticatedUser): boolean {
  return viewer.roles.some((role) => STAFF_ROLES.includes(role));
}

@Injectable()
export class QuizzesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly curriculumSettings: CurriculumSettingsService,
    private readonly gemini: GeminiService,
  ) {}

  async create(dto: CreateQuizDto, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    await this.findSourceWeek(dto.schemeOfWorkId, dto.weekNumber);

    return client.quiz.create({
      data: {
        schemeOfWorkId: dto.schemeOfWorkId,
        weekNumber: dto.weekNumber,
        title: dto.title,
        status: "DRAFT",
        source: "MANUAL",
        content: dto.content as unknown as object,
        createdById: viewer.id,
      },
    });
  }

  async generate(dto: GenerateQuizDto, viewer: AuthenticatedUser) {
    const settings = await this.curriculumSettings.get();
    if (!canGenerateWithAi(settings.mode)) {
      throw new ForbiddenException("AI generation isn't enabled for this school's curriculum mode");
    }

    const { scheme, week } = await this.findSourceWeek(dto.schemeOfWorkId, dto.weekNumber);
    const prompt = buildQuizPrompt(scheme.subject, week, settings, dto.questionCount);
    const content = await this.gemini.generateJson<QuizContentDto>(prompt, QUIZ_RESPONSE_SCHEMA);

    const client = await this.tenantPrisma.getClient();
    return client.quiz.create({
      data: {
        schemeOfWorkId: dto.schemeOfWorkId,
        weekNumber: dto.weekNumber,
        title: dto.title,
        status: "DRAFT",
        source: "AI_GENERATED",
        content: content as unknown as object,
        generatedAt: new Date(),
        createdById: viewer.id,
      },
    });
  }

  /**
   * Staff get the quiz as stored, answers included. Everyone else gets only
   * PUBLISHED quizzes, with the answer key stripped — see strip-answers.ts.
   */
  async list(viewer: AuthenticatedUser, schemeOfWorkId?: string) {
    const client = await this.tenantPrisma.getClient();
    const staff = isStaff(viewer);

    const quizzes = await client.quiz.findMany({
      where: { schemeOfWorkId, ...(staff ? {} : { status: "PUBLISHED" as const }) },
      include: { schemeOfWork: { include: { subject: true } } },
      orderBy: [{ schemeOfWorkId: "asc" }, { weekNumber: "asc" }, { createdAt: "asc" }],
    });

    if (staff) return quizzes;
    return quizzes.map((quiz) => ({ ...quiz, content: stripAnswers(quiz.content) }));
  }

  async findOne(id: string, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const record = await client.quiz.findFirst({
      where: { id },
      include: { schemeOfWork: { include: { subject: true } } },
    });
    if (!record) throw new NotFoundException("No quiz found with that id");

    if (isStaff(viewer)) return record;

    if (record.status !== "PUBLISHED") {
      // 404, not 403 — same reasoning as schemes-of-work.service.ts.
      throw new NotFoundException("No quiz found with that id");
    }
    return { ...record, content: stripAnswers(record.content) };
  }

  async update(id: string, dto: UpdateQuizDto) {
    const client = await this.tenantPrisma.getClient();
    const existing = await client.quiz.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException("No quiz found with that id");

    return client.quiz.update({
      where: { id },
      data: {
        title: dto.title,
        ...(dto.content ? { content: dto.content as unknown as object } : {}),
      },
    });
  }

  async publish(id: string) {
    const client = await this.tenantPrisma.getClient();
    const existing = await client.quiz.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException("No quiz found with that id");
    return client.quiz.update({ where: { id }, data: { status: "PUBLISHED" } });
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
}
