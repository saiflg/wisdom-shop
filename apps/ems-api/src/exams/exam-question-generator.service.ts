import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "ems-tenant-client";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { CurriculumSettingsService } from "@/curriculum-settings/curriculum-settings.service";
import { AiService } from "@/ai/ai.service";
import { canGenerateWithAi } from "@/schemes-of-work/can-generate-with-ai";
import { buildQuestionPrompt, normaliseGenerated, QUESTION_RESPONSE_SCHEMA } from "./question-prompt";
import type { GenerateQuestionsDto } from "./dto/exams.dto";

const MAX_QUESTIONS = 20;

/**
 * Drafts question-bank items with the school's configured AI provider.
 *
 * Separate from ExamsService on purpose: sitting and marking a paper must
 * not depend on an AI provider being configured, and a school that never
 * turns AI on still gets the whole examination module.
 */
@Injectable()
export class ExamQuestionGeneratorService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly curriculumSettings: CurriculumSettingsService,
    private readonly ai: AiService,
  ) {}

  async generate(dto: GenerateQuestionsDto, viewer: AuthenticatedUser) {
    const settings = await this.curriculumSettings.get();
    if (!canGenerateWithAi(settings.mode)) {
      throw new ForbiddenException("AI generation isn't enabled for this school's curriculum mode");
    }

    const client = await this.tenantPrisma.getClient();
    const subject = await client.subject.findFirst({ where: { id: dto.subjectId, deletedAt: null } });
    if (!subject) throw new NotFoundException("No subject found with that id");

    const count = Math.min(dto.count ?? 5, MAX_QUESTIONS);
    const prompt = buildQuestionPrompt(subject, dto.topic.trim(), settings, count, dto.gradeLevel);
    const raw = await this.ai.generateJson<unknown>(prompt, QUESTION_RESPONSE_SCHEMA);

    const { questions, rejected } = normaliseGenerated(raw);

    const created = [];
    for (const question of questions) {
      created.push(
        await client.questionBankItem.create({
          data: {
            subjectId: subject.id,
            gradeLevel: dto.gradeLevel?.trim() || subject.gradeLevel,
            topic: dto.topic.trim(),
            type: question.type,
            prompt: question.prompt,
            options: question.options as unknown as Prisma.InputJsonValue,
            answer: question.answer as unknown as Prisma.InputJsonValue,
            marksHundredths: question.marksHundredths,
            // Marked as generated so the bank screen can show a teacher
            // which questions still need reading before they go on a paper.
            source: "AI_GENERATED",
            createdById: viewer.id,
          },
          include: { subject: true },
        }),
      );
    }

    // `rejected` is returned rather than logged: a teacher who asked for
    // five questions and got three deserves to know which fell over and why.
    return { created, rejected, requested: count };
  }
}
