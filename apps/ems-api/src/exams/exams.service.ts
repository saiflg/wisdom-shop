import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma, QuestionType, RoleName } from "ems-tenant-client";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import {
  markAnswer,
  paperTotalHundredths,
  scaleToAssessment,
  tallyAttempt,
  type MarkableQuestion,
} from "./marking";
import { canStart, deadlineFor, isExpired, remainingSeconds } from "./exam-window";
import { toStudentPaper, type StoredExamQuestion } from "./student-paper";
import type {
  AddExamQuestionsDto,
  CreateExamDto,
  CreateQuestionDto,
  MarkExamAnswerDto,
  SaveAnswerDto,
  UpdateExamDto,
  UpdateQuestionDto,
} from "./dto/exams.dto";

const STAFF_ROLES: RoleName[] = ["SCHOOL_ADMIN", "TEACHER"];

function isStaff(viewer: AuthenticatedUser): boolean {
  return viewer.roles.some((role) => STAFF_ROLES.includes(role));
}

/** Answer keys are stored as JSON; this is the only place that reads them back. */
function answerKeyOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

@Injectable()
export class ExamsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  // ── The question bank ──────────────────────────────────────────────────

  async createQuestion(dto: CreateQuestionDto, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();

    const subject = await client.subject.findFirst({ where: { id: dto.subjectId, deletedAt: null } });
    if (!subject) throw new NotFoundException("No subject found with that id");

    this.assertAnswerable(dto.type, dto.options ?? [], dto.answer ?? []);

    return client.questionBankItem.create({
      data: {
        subjectId: dto.subjectId,
        gradeLevel: dto.gradeLevel?.trim() || null,
        topic: dto.topic?.trim() || null,
        type: dto.type,
        prompt: dto.prompt.trim(),
        options: (dto.options ?? []) as unknown as Prisma.InputJsonValue,
        answer: (dto.answer ?? []) as unknown as Prisma.InputJsonValue,
        marksHundredths: dto.marksHundredths ?? 100,
        source: "MANUAL",
        createdById: viewer.id,
      },
      include: { subject: true },
    });
  }

  async listQuestions(subjectId?: string, topic?: string) {
    const client = await this.tenantPrisma.getClient();
    return client.questionBankItem.findMany({
      where: {
        deletedAt: null,
        ...(subjectId ? { subjectId } : {}),
        ...(topic ? { topic: { contains: topic, mode: "insensitive" } } : {}),
      },
      include: { subject: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async updateQuestion(id: string, dto: UpdateQuestionDto) {
    const client = await this.tenantPrisma.getClient();
    const existing = await client.questionBankItem.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException("No question found with that id");

    const options = dto.options ?? (existing.options as unknown as { key: string; text: string }[]);
    const answer = dto.answer ?? answerKeyOf(existing.answer);
    this.assertAnswerable(existing.type, options ?? [], answer);

    return client.questionBankItem.update({
      where: { id },
      data: {
        ...(dto.topic === undefined ? {} : { topic: dto.topic.trim() || null }),
        ...(dto.prompt === undefined ? {} : { prompt: dto.prompt.trim() }),
        ...(dto.options === undefined ? {} : { options: dto.options as unknown as Prisma.InputJsonValue }),
        ...(dto.answer === undefined ? {} : { answer: dto.answer as unknown as Prisma.InputJsonValue }),
        ...(dto.marksHundredths === undefined ? {} : { marksHundredths: dto.marksHundredths }),
      },
      include: { subject: true },
    });
  }

  /**
   * Soft delete only.
   *
   * Papers built from this question keep their own snapshot, so removing it
   * from the bank cannot change a paper anyone has sat — but a hard delete
   * would still cut the trail back to where the question came from.
   */
  async removeQuestion(id: string) {
    const client = await this.tenantPrisma.getClient();
    const existing = await client.questionBankItem.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException("No question found with that id");

    await client.questionBankItem.update({ where: { id }, data: { deletedAt: new Date() } });
    return { deleted: true };
  }

  /**
   * A question a machine could never mark is a question nobody should be able
   * to save silently.
   *
   * Caught here rather than at marking time because the failure at marking
   * time is invisible: it becomes a paper full of answers waiting on a
   * teacher who was never told.
   */
  private assertAnswerable(
    type: QuestionType,
    options: { key: string; text: string }[],
    answer: string[],
  ): void {
    if (type === "ESSAY") return;

    if (type === "SHORT_ANSWER") {
      if (answer.length === 0) {
        throw new BadRequestException(
          "A short-answer question needs at least one accepted answer, or it cannot be marked automatically",
        );
      }
      return;
    }

    if (options.length < 2) {
      throw new BadRequestException("A choice question needs at least two options");
    }

    const keys = new Set(options.map((option) => option.key.trim().toUpperCase()));
    if (keys.size !== options.length) {
      throw new BadRequestException("Two options share the same key");
    }
    if (answer.length === 0) {
      throw new BadRequestException("Choose which option or options are correct");
    }

    const unknown = answer.filter((key) => !keys.has(key.trim().toUpperCase()));
    if (unknown.length > 0) {
      throw new BadRequestException(`The correct answer refers to an option that is not there: ${unknown.join(", ")}`);
    }
    if ((type === "SINGLE_CHOICE" || type === "TRUE_FALSE") && answer.length > 1) {
      throw new BadRequestException("A single-answer question can only have one correct option");
    }
  }

  // ── Building a paper ───────────────────────────────────────────────────

  async createExam(dto: CreateExamDto, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();

    const klass = await client.class.findFirst({ where: { id: dto.classId, deletedAt: null } });
    if (!klass) throw new NotFoundException("No class found with that id");

    const subject = await client.subject.findFirst({ where: { id: dto.subjectId, deletedAt: null } });
    if (!subject) throw new NotFoundException("No subject found with that id");

    if (dto.assessmentId) await this.assertAssessmentMatches(dto.assessmentId, dto.classId, dto.subjectId);

    const opensAt = dto.opensAt ? new Date(dto.opensAt) : null;
    const closesAt = dto.closesAt ? new Date(dto.closesAt) : null;
    if (opensAt && closesAt && closesAt.getTime() <= opensAt.getTime()) {
      throw new BadRequestException("The exam would close before it opened");
    }

    return client.exam.create({
      data: {
        classId: dto.classId,
        subjectId: dto.subjectId,
        title: dto.title.trim(),
        instructions: dto.instructions?.trim() || null,
        academicYear: dto.academicYear.trim(),
        term: dto.term.trim(),
        durationMinutes: dto.durationMinutes,
        opensAt,
        closesAt,
        shuffleQuestions: dto.shuffleQuestions ?? true,
        assessmentId: dto.assessmentId ?? null,
        createdById: viewer.id,
      },
      include: { class: true, subject: true },
    });
  }

  async updateExam(id: string, dto: UpdateExamDto) {
    const client = await this.tenantPrisma.getClient();
    const exam = await client.exam.findFirst({ where: { id, deletedAt: null } });
    if (!exam) throw new NotFoundException("No exam found with that id");

    if (dto.assessmentId) await this.assertAssessmentMatches(dto.assessmentId, exam.classId, exam.subjectId);

    if (dto.status === "PUBLISHED" && exam.status === "DRAFT") {
      const questions = await client.examQuestion.count({ where: { examId: id } });
      // Publishing an empty paper would let a class sit nothing and score
      // zero out of zero, which then flows into a report card.
      if (questions === 0) throw new BadRequestException("Add at least one question before publishing");
    }

    return client.exam.update({
      where: { id },
      data: {
        ...(dto.title === undefined ? {} : { title: dto.title.trim() }),
        ...(dto.instructions === undefined ? {} : { instructions: dto.instructions.trim() || null }),
        ...(dto.durationMinutes === undefined ? {} : { durationMinutes: dto.durationMinutes }),
        ...(dto.opensAt === undefined ? {} : { opensAt: dto.opensAt ? new Date(dto.opensAt) : null }),
        ...(dto.closesAt === undefined ? {} : { closesAt: dto.closesAt ? new Date(dto.closesAt) : null }),
        ...(dto.shuffleQuestions === undefined ? {} : { shuffleQuestions: dto.shuffleQuestions }),
        ...(dto.status === undefined ? {} : { status: dto.status }),
        ...(dto.assessmentId === undefined ? {} : { assessmentId: dto.assessmentId || null }),
      },
      include: { class: true, subject: true },
    });
  }

  /**
   * Copies bank questions onto the paper.
   *
   * The copy is the point: a teacher correcting a typo in the bank next term
   * must not change the questions a student already answered, or the marks
   * they were given for them. Same rule as a published TermResult.
   */
  async addQuestions(examId: string, dto: AddExamQuestionsDto) {
    const client = await this.tenantPrisma.getClient();

    const exam = await client.exam.findFirst({ where: { id: examId, deletedAt: null } });
    if (!exam) throw new NotFoundException("No exam found with that id");
    // Changing the paper under a student who is part-way through it would
    // renumber their answers and lose work.
    if (exam.status !== "DRAFT") {
      throw new BadRequestException("Questions can only be added while the exam is still a draft");
    }

    const items = await client.questionBankItem.findMany({
      where: { id: { in: dto.questionIds }, deletedAt: null },
    });
    const missing = dto.questionIds.filter((id) => !items.some((item) => item.id === id));
    if (missing.length > 0) {
      throw new NotFoundException(`No question found with id: ${missing.join(", ")}`);
    }

    const highest = await client.examQuestion.aggregate({
      where: { examId },
      _max: { orderIndex: true },
    });
    let next = (highest._max.orderIndex ?? -1) + 1;

    // Ordered by the caller's list, not the database's, so a teacher who
    // arranged the paper in a particular order gets that order.
    for (const id of dto.questionIds) {
      const item = items.find((candidate) => candidate.id === id);
      if (!item) continue;
      await client.examQuestion.create({
        data: {
          examId,
          orderIndex: next,
          sourceItemId: item.id,
          type: item.type,
          prompt: item.prompt,
          options: item.options as Prisma.InputJsonValue,
          answer: item.answer as Prisma.InputJsonValue,
          marksHundredths: item.marksHundredths,
        },
      });
      next += 1;
    }

    return this.findExamForStaff(examId);
  }

  async removeQuestionFromExam(examId: string, examQuestionId: string) {
    const client = await this.tenantPrisma.getClient();

    const exam = await client.exam.findFirst({ where: { id: examId, deletedAt: null } });
    if (!exam) throw new NotFoundException("No exam found with that id");
    if (exam.status !== "DRAFT") {
      throw new BadRequestException("Questions can only be removed while the exam is still a draft");
    }

    const question = await client.examQuestion.findFirst({ where: { id: examQuestionId, examId } });
    if (!question) throw new NotFoundException("No question found on that exam");

    await client.examQuestion.delete({ where: { id: examQuestionId } });
    return this.findExamForStaff(examId);
  }

  private async assertAssessmentMatches(assessmentId: string, classId: string, subjectId: string) {
    const client = await this.tenantPrisma.getClient();
    const assessment = await client.assessment.findFirst({ where: { id: assessmentId, deletedAt: null } });
    if (!assessment) throw new NotFoundException("No assessment found with that id");
    // Otherwise the mark lands in a gradebook nobody was looking at.
    if (assessment.classId !== classId || assessment.subjectId !== subjectId) {
      throw new BadRequestException(
        "That assessment belongs to a different class or subject, so a mark could not count towards it",
      );
    }
  }

  // ── Reading ────────────────────────────────────────────────────────────

  async listExams(viewer: AuthenticatedUser, classId?: string) {
    const client = await this.tenantPrisma.getClient();
    const staff = isStaff(viewer);

    if (staff) {
      return client.exam.findMany({
        where: { deletedAt: null, ...(classId ? { classId } : {}) },
        include: { class: true, subject: true, _count: { select: { questions: true, attempts: true } } },
        orderBy: { createdAt: "desc" },
      });
    }

    const visibleClasses = await this.visibleClassIds(viewer);
    const profileIds = await this.visibleStudentProfileIds(viewer);

    const exams = await client.exam.findMany({
      where: {
        deletedAt: null,
        classId: { in: visibleClasses },
        // Never a draft: an unfinished paper shown to a class generates
        // thirty questions, the same reasoning as homework.
        status: { in: ["PUBLISHED", "CLOSED"] },
        ...(classId ? { classId } : {}),
      },
      include: { class: true, subject: true },
      orderBy: { createdAt: "desc" },
    });

    const attempts = await client.examAttempt.findMany({
      where: { examId: { in: exams.map((exam) => exam.id) }, studentProfileId: { in: [...profileIds] } },
    });

    return exams.map((exam) => ({
      ...exam,
      attempt: this.presentAttemptForStudent(
        attempts.find((attempt) => attempt.examId === exam.id) ?? null,
      ),
    }));
  }

  /** The paper with its answer key — staff only, and never reached by a student route. */
  async findExamForStaff(id: string) {
    const client = await this.tenantPrisma.getClient();
    const exam = await client.exam.findFirst({
      where: { id, deletedAt: null },
      include: {
        class: true,
        subject: true,
        assessment: true,
        questions: { orderBy: { orderIndex: "asc" } },
      },
    });
    if (!exam) throw new NotFoundException("No exam found with that id");

    const attempts = await client.examAttempt.findMany({
      where: { examId: id },
      include: { studentProfile: { include: { user: true } } },
      orderBy: { startedAt: "asc" },
    });

    const expected = await client.enrollment.count({ where: { classId: exam.classId, status: "ACTIVE" } });

    return {
      ...exam,
      totalMarksHundredths: paperTotalHundredths(exam.questions),
      attempts,
      progress: {
        expected,
        started: attempts.length,
        submitted: attempts.filter((attempt) => attempt.status !== "IN_PROGRESS").length,
        needingReview: attempts.filter((attempt) => attempt.needsReview).length,
        released: attempts.filter((attempt) => attempt.status === "RELEASED").length,
      },
    };
  }

  // ── Sitting a paper ────────────────────────────────────────────────────

  /**
   * Starts an attempt, or resumes the one already open.
   *
   * Resuming rather than refusing matters: a laptop that dies mid-exam must
   * not cost a child their paper. The clock is unaffected — it was fixed at
   * the first start and stored.
   */
  async start(examId: string, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const profile = await this.ownStudentProfile(viewer);

    const exam = await client.exam.findFirst({ where: { id: examId, deletedAt: null } });
    if (!exam) throw new NotFoundException("No exam found with that id");

    const enrolled = await client.enrollment.findFirst({
      where: { classId: exam.classId, studentProfileId: profile.id, status: "ACTIVE" },
    });
    // 404, not 403: which papers exist for other classes is not their business.
    if (!enrolled || exam.status === "DRAFT") throw new NotFoundException("No exam found with that id");

    const existing = await client.examAttempt.findUnique({
      where: { examId_studentProfileId: { examId, studentProfileId: profile.id } },
    });

    if (existing) {
      if (existing.status !== "IN_PROGRESS") {
        throw new ForbiddenException("You have already sat this exam");
      }
      return this.paperFor(exam, existing);
    }

    const now = new Date();
    const decision = canStart(exam, false, now);
    if (!decision.allowed) throw new ForbiddenException(decision.reason);

    const attempt = await client.examAttempt.create({
      data: {
        examId,
        studentProfileId: profile.id,
        startedAt: now,
        // Fixed here and stored, so editing the duration later cannot
        // shorten a clock already running.
        expiresAt: deadlineFor(exam, now),
        shuffleSeed: Math.floor(Math.random() * 2_147_483_647),
      },
    });

    return this.paperFor(exam, attempt);
  }

  /**
   * Saves one answer as the student works.
   *
   * Answers are saved individually rather than all at submit, so a dropped
   * connection costs one question rather than a whole paper.
   */
  async saveAnswer(examId: string, dto: SaveAnswerDto, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const { attempt } = await this.ownAttempt(examId, viewer);

    if (attempt.status !== "IN_PROGRESS") {
      throw new ForbiddenException("You have already submitted this exam");
    }
    if (isExpired(attempt.expiresAt, new Date())) {
      throw new ForbiddenException("Your time for this exam is up");
    }

    const question = await client.examQuestion.findFirst({
      where: { id: dto.examQuestionId, examId },
    });
    if (!question) throw new NotFoundException("No question found on that exam");

    const response = dto.response as unknown as Prisma.InputJsonValue;
    await client.examAnswer.upsert({
      where: {
        attemptId_examQuestionId: { attemptId: attempt.id, examQuestionId: question.id },
      },
      create: { attemptId: attempt.id, examQuestionId: question.id, response },
      update: { response },
    });

    return { saved: true, remainingSeconds: remainingSeconds(attempt.expiresAt, new Date()) };
  }

  /**
   * Hands the paper in and marks everything a machine can mark.
   *
   * A submission after the deadline is accepted rather than refused — the
   * work is already saved, and throwing it away would punish a child for a
   * slow browser. It is recorded as auto-submitted so the fact is not lost.
   */
  async submit(examId: string, viewer: AuthenticatedUser) {
    const { attempt, exam } = await this.ownAttempt(examId, viewer);

    if (attempt.status !== "IN_PROGRESS") {
      throw new ForbiddenException("You have already submitted this exam");
    }

    const marked = await this.markAttempt(attempt.id, isExpired(attempt.expiresAt, new Date()));
    return this.presentAttemptForStudent(marked, exam.status);
  }

  /** Auto-marks every answer on an attempt and moves it to SUBMITTED. */
  private async markAttempt(attemptId: string, autoSubmitted: boolean) {
    const client = await this.tenantPrisma.getClient();

    const attempt = await client.examAttempt.findUniqueOrThrow({
      where: { id: attemptId },
      include: { exam: { include: { questions: true } }, answers: true },
    });

    for (const question of attempt.exam.questions) {
      const answer = attempt.answers.find((candidate) => candidate.examQuestionId === question.id);
      const markable: MarkableQuestion = {
        type: question.type,
        answer: answerKeyOf(question.answer),
        marksHundredths: question.marksHundredths,
      };
      const result = markAnswer(markable, answer ? answerKeyOf(answer.response) : []);

      // An unanswered question still gets a row, so the teacher's review
      // screen shows every question rather than only the attempted ones.
      await client.examAnswer.upsert({
        where: { attemptId_examQuestionId: { attemptId, examQuestionId: question.id } },
        create: {
          attemptId,
          examQuestionId: question.id,
          response: [] as unknown as Prisma.InputJsonValue,
          awardedHundredths: result.awardedHundredths,
          autoMarked: result.autoMarked,
          needsReview: result.needsReview,
        },
        update: {
          awardedHundredths: result.awardedHundredths,
          autoMarked: result.autoMarked,
          needsReview: result.needsReview,
        },
      });
    }

    const answers = await client.examAnswer.findMany({ where: { attemptId } });
    const tally = tallyAttempt(answers);

    return client.examAttempt.update({
      where: { id: attemptId },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
        autoSubmitted,
        autoScoreHundredths: tally.autoScoreHundredths,
        manualScoreHundredths: tally.manualScoreHundredths,
        totalScoreHundredths: tally.totalScoreHundredths,
        needsReview: tally.needsReview,
      },
    });
  }

  /**
   * A paper whose time ran out while nobody was looking.
   *
   * Called when staff open the results screen. A student who closed the lid
   * and never came back would otherwise sit at IN_PROGRESS forever, and
   * their saved answers would never be marked.
   */
  async collectExpired(examId: string) {
    const client = await this.tenantPrisma.getClient();
    const now = new Date();

    const stale = await client.examAttempt.findMany({
      where: { examId, status: "IN_PROGRESS", expiresAt: { lt: now } },
      select: { id: true },
    });

    for (const attempt of stale) await this.markAttempt(attempt.id, true);
    return { collected: stale.length };
  }

  // ── Reviewing and releasing ────────────────────────────────────────────

  /** One attempt, with the answer key, for a teacher marking it. */
  async attemptForStaff(attemptId: string) {
    const client = await this.tenantPrisma.getClient();
    const attempt = await client.examAttempt.findFirst({
      where: { id: attemptId },
      include: {
        exam: { include: { questions: { orderBy: { orderIndex: "asc" } }, class: true, subject: true } },
        studentProfile: { include: { user: true } },
        answers: true,
      },
    });
    if (!attempt) throw new NotFoundException("No attempt found with that id");

    return {
      ...attempt,
      totalMarksHundredths: paperTotalHundredths(attempt.exam.questions),
    };
  }

  /** A teacher awards a mark on one answer, then the attempt is re-tallied. */
  async markAnswerByHand(attemptId: string, answerId: string, dto: MarkExamAnswerDto, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();

    const answer = await client.examAnswer.findFirst({
      where: { id: answerId, attemptId },
      include: { examQuestion: true },
    });
    if (!answer) throw new NotFoundException("No answer found with that id");

    if (dto.awardedHundredths > answer.examQuestion.marksHundredths) {
      throw new BadRequestException(
        `That is more than the question is worth (${answer.examQuestion.marksHundredths / 100})`,
      );
    }

    await client.examAnswer.update({
      where: { id: answerId },
      data: {
        awardedHundredths: dto.awardedHundredths,
        feedback: dto.feedback?.trim() || null,
        autoMarked: false,
        needsReview: false,
      },
    });

    const answers = await client.examAnswer.findMany({ where: { attemptId } });
    const tally = tallyAttempt(answers);

    const actor = await client.user.findUnique({
      where: { id: viewer.id },
      select: { firstName: true, lastName: true },
    });

    return client.examAttempt.update({
      where: { id: attemptId },
      data: {
        autoScoreHundredths: tally.autoScoreHundredths,
        manualScoreHundredths: tally.manualScoreHundredths,
        totalScoreHundredths: tally.totalScoreHundredths,
        needsReview: tally.needsReview,
        status: tally.needsReview ? "SUBMITTED" : "MARKED",
        markedAt: new Date(),
        markedByUserId: viewer.id,
        markedByName: actor ? `${actor.firstName} ${actor.lastName}` : viewer.id,
      },
    });
  }

  /**
   * Releases every finished attempt on a paper to its students.
   *
   * Attempts still waiting on a human are skipped and counted rather than
   * released with a hole in them — releasing a paper where the essay scored
   * nothing because nobody read it is the exact failure this phase's marking
   * rules exist to prevent.
   */
  async release(examId: string, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();

    const exam = await client.exam.findFirst({ where: { id: examId, deletedAt: null } });
    if (!exam) throw new NotFoundException("No exam found with that id");

    await this.collectExpired(examId);

    const attempts = await client.examAttempt.findMany({
      where: { examId, status: { in: ["SUBMITTED", "MARKED"] } },
    });

    const ready = attempts.filter((attempt) => !attempt.needsReview);
    const held = attempts.length - ready.length;

    const actor = await client.user.findUnique({
      where: { id: viewer.id },
      select: { firstName: true, lastName: true },
    });

    for (const attempt of ready) {
      await client.examAttempt.update({
        where: { id: attempt.id },
        data: {
          status: "RELEASED",
          releasedAt: new Date(),
          markedAt: attempt.markedAt ?? new Date(),
          markedByName: attempt.markedByName ?? (actor ? `${actor.firstName} ${actor.lastName}` : viewer.id),
        },
      });
      await this.writeThroughToGradebook(attempt.id);
    }

    return { released: ready.length, heldForReview: held };
  }

  /**
   * Copies a released exam mark into the linked assessment.
   *
   * Scaled, not copied — 30/40 on the paper is 15/20 in a gradebook out of
   * 20. Same rule as homework's write-through, and the same reason: so an
   * exam reaches the report card without being re-typed.
   */
  private async writeThroughToGradebook(attemptId: string) {
    const client = await this.tenantPrisma.getClient();

    const attempt = await client.examAttempt.findFirst({
      where: { id: attemptId },
      include: { exam: { include: { questions: true } } },
    });
    if (!attempt?.exam.assessmentId || attempt.totalScoreHundredths === null) return;

    const assessment = await client.assessment.findFirst({
      where: { id: attempt.exam.assessmentId, deletedAt: null },
    });
    if (!assessment) return;

    const scaled = scaleToAssessment(
      attempt.totalScoreHundredths,
      paperTotalHundredths(attempt.exam.questions),
      assessment.maxScoreHundredths,
    );

    await client.mark.upsert({
      where: {
        assessmentId_studentProfileId: {
          assessmentId: assessment.id,
          studentProfileId: attempt.studentProfileId,
        },
      },
      create: {
        assessmentId: assessment.id,
        studentProfileId: attempt.studentProfileId,
        scoreHundredths: scaled,
        status: "RECORDED",
      },
      update: { scoreHundredths: scaled, status: "RECORDED" },
    });
  }

  // ── What a student may see ─────────────────────────────────────────────

  /**
   * A student's own result.
   *
   * Before release this is the fact that they sat it and nothing else. After
   * release it is their marks per question — but still never the answer key
   * of questions they got wrong, since papers get re-sat and a school may
   * reuse them.
   */
  async myAttempt(examId: string, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const { attempt, exam } = await this.ownAttempt(examId, viewer);

    const questions = await client.examQuestion.findMany({
      where: { examId },
      orderBy: { orderIndex: "asc" },
    });
    const answers = await client.examAnswer.findMany({ where: { attemptId: attempt.id } });

    const base = this.presentAttemptForStudent(attempt, exam.status);
    if (attempt.status !== "RELEASED") return { ...base, questions: [], answers: [] };

    return {
      ...base,
      totalMarksHundredths: paperTotalHundredths(questions),
      questions: toStudentPaper(questions as StoredExamQuestion[], {
        shuffle: false,
        seed: attempt.shuffleSeed,
      }),
      answers: answers.map((answer) => ({
        examQuestionId: answer.examQuestionId,
        response: answer.response,
        awardedHundredths: answer.awardedHundredths,
        autoMarked: answer.autoMarked,
        feedback: answer.feedback,
      })),
    };
  }

  /** The paper as this student sees it, plus their saved answers so far. */
  private async paperFor(
    exam: { id: string; title: string; instructions: string | null; shuffleQuestions: boolean },
    attempt: { id: string; expiresAt: Date; shuffleSeed: number; status: string },
  ) {
    const client = await this.tenantPrisma.getClient();

    const questions = await client.examQuestion.findMany({ where: { examId: exam.id } });
    const answers = await client.examAnswer.findMany({
      where: { attemptId: attempt.id },
      select: { examQuestionId: true, response: true },
    });

    return {
      attemptId: attempt.id,
      examId: exam.id,
      title: exam.title,
      instructions: exam.instructions,
      expiresAt: attempt.expiresAt,
      remainingSeconds: remainingSeconds(attempt.expiresAt, new Date()),
      totalMarksHundredths: paperTotalHundredths(questions),
      questions: toStudentPaper(questions as StoredExamQuestion[], {
        shuffle: exam.shuffleQuestions,
        seed: attempt.shuffleSeed,
      }),
      answers,
    };
  }

  /**
   * An attempt as its own student may see it.
   *
   * The score is **removed, not nulled**, until release — a null score
   * against a SUBMITTED attempt still tells a student the paper has been
   * marked, which is the thing being withheld. Same rule as homework.
   */
  private presentAttemptForStudent(
    attempt: Record<string, unknown> | null,
    examStatus?: string,
  ): Record<string, unknown> | null {
    if (!attempt) return null;
    void examStatus;

    if (attempt.status === "RELEASED") return attempt;

    const {
      autoScoreHundredths,
      manualScoreHundredths,
      totalScoreHundredths,
      needsReview,
      markedAt,
      markedByName,
      markedByUserId,
      ...rest
    } = attempt;
    void autoScoreHundredths;
    void manualScoreHundredths;
    void totalScoreHundredths;
    void needsReview;
    void markedAt;
    void markedByName;
    void markedByUserId;
    return rest;
  }

  // ── Scoping ────────────────────────────────────────────────────────────

  private async ownStudentProfile(viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const profile = await client.studentProfile.findUnique({
      where: { userId: viewer.id },
      select: { id: true },
    });
    // A guardian cannot sit a paper for their child, and staff have no
    // attempt of their own to look at.
    if (!profile) throw new ForbiddenException("Only a student can sit an exam");
    return profile;
  }

  private async ownAttempt(examId: string, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const profile = await this.ownStudentProfile(viewer);

    const exam = await client.exam.findFirst({ where: { id: examId, deletedAt: null } });
    if (!exam) throw new NotFoundException("No exam found with that id");

    // Looked up by (exam, own profile), never by an id from the request, so
    // there is no attempt id a student could substitute for someone else's.
    const attempt = await client.examAttempt.findUnique({
      where: { examId_studentProfileId: { examId, studentProfileId: profile.id } },
    });
    if (!attempt) throw new NotFoundException("You have not started this exam");

    return { attempt, exam };
  }

  private async visibleClassIds(viewer: AuthenticatedUser): Promise<string[]> {
    const client = await this.tenantPrisma.getClient();
    const profileIds = await this.visibleStudentProfileIds(viewer);
    if (profileIds.size === 0) return [];

    const enrollments = await client.enrollment.findMany({
      where: { studentProfileId: { in: [...profileIds] }, status: "ACTIVE" },
      select: { classId: true },
    });
    return [...new Set(enrollments.map((enrollment) => enrollment.classId))];
  }

  private async visibleStudentProfileIds(viewer: AuthenticatedUser): Promise<Set<string>> {
    const client = await this.tenantPrisma.getClient();

    if (viewer.roles.includes("GUARDIAN")) {
      const links = await client.guardianLink.findMany({
        where: { guardianUserId: viewer.id },
        select: { studentProfileId: true },
      });
      return new Set(links.map((link) => link.studentProfileId));
    }

    const own = await client.studentProfile.findUnique({
      where: { userId: viewer.id },
      select: { id: true },
    });
    return new Set(own ? [own.id] : []);
  }
}
