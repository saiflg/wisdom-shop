import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/auth/decorators/roles.decorator";
import { CurrentUser } from "@/auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { ExamsService } from "./exams.service";
import { ExamQuestionGeneratorService } from "./exam-question-generator.service";
import {
  AddExamQuestionsDto,
  CreateExamDto,
  CreateQuestionDto,
  GenerateQuestionsDto,
  MarkExamAnswerDto,
  SaveAnswerDto,
  UpdateExamDto,
  UpdateQuestionDto,
} from "./dto/exams.dto";
import { RequiresModule } from "@/schools/decorators/requires-module.decorator";

/**
 * Examinations and CBT.
 *
 * Two audiences, kept apart by route as well as by role: everything under
 * `/exams/questions` and `/exams/:id/attempts` is staff-only and carries the
 * answer key, while the student's own routes go through the service's
 * paper-presentation path, which strips it. No student route ever loads an
 * exam with its questions directly.
 */
@ApiTags("exams")
@ApiBearerAuth()
@RequiresModule("EXAMS")
@Controller("exams")
export class ExamsController {
  constructor(
    private readonly exams: ExamsService,
    private readonly generator: ExamQuestionGeneratorService,
  ) {}

  // ── The question bank (staff only) ─────────────────────────────────────

  @Post("questions")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({ summary: "Add a question to the bank" })
  createQuestion(@Body() dto: CreateQuestionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.exams.createQuestion(dto, user);
  }

  @Get("questions")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({ summary: "Browse the question bank" })
  listQuestions(@Query("subjectId") subjectId?: string, @Query("topic") topic?: string) {
    return this.exams.listQuestions(subjectId, topic);
  }

  @Post("questions/generate")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({
    summary: "Draft questions with AI",
    description:
      "Generated questions land in the bank for a teacher to read and edit. They are never put on a paper " +
      "automatically — a wrong answer key would mark a whole class wrong.",
  })
  generateQuestions(@Body() dto: GenerateQuestionsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.generator.generate(dto, user);
  }

  @Patch("questions/:id")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({ summary: "Edit a bank question" })
  updateQuestion(@Param("id") id: string, @Body() dto: UpdateQuestionDto) {
    return this.exams.updateQuestion(id, dto);
  }

  @Delete("questions/:id")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({
    summary: "Retire a bank question",
    description: "Papers built from it keep their own copy, so nothing a student sat is changed.",
  })
  removeQuestion(@Param("id") id: string) {
    return this.exams.removeQuestion(id);
  }

  // ── Papers ─────────────────────────────────────────────────────────────

  @Post()
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({ summary: "Create an exam" })
  create(@Body() dto: CreateExamDto, @CurrentUser() user: AuthenticatedUser) {
    return this.exams.createExam(dto, user);
  }

  @Get()
  @ApiOperation({
    summary: "List exams",
    description: "A student or guardian sees only their own classes' published papers, never a draft.",
  })
  list(@CurrentUser() user: AuthenticatedUser, @Query("classId") classId?: string) {
    return this.exams.listExams(user, classId);
  }

  @Get(":id")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({
    summary: "One exam with its questions and answer key",
    description: "Staff only. A student reaches the paper through /sit, which strips the key.",
  })
  findOne(@Param("id") id: string) {
    return this.exams.findExamForStaff(id);
  }

  @Patch(":id")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({ summary: "Edit an exam, publish it or close it" })
  update(@Param("id") id: string, @Body() dto: UpdateExamDto) {
    return this.exams.updateExam(id, dto);
  }

  @Post(":id/questions")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({
    summary: "Put bank questions on the paper",
    description: "Copied, not linked — editing the bank afterwards never changes a paper anyone has sat.",
  })
  addQuestions(@Param("id") id: string, @Body() dto: AddExamQuestionsDto) {
    return this.exams.addQuestions(id, dto);
  }

  @Delete(":id/questions/:questionId")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({ summary: "Take a question off a draft paper" })
  removeExamQuestion(@Param("id") id: string, @Param("questionId") questionId: string) {
    return this.exams.removeQuestionFromExam(id, questionId);
  }

  // ── Sitting ────────────────────────────────────────────────────────────

  @Post(":id/sit")
  @ApiOperation({
    summary: "Start or resume this student's attempt",
    description:
      "Resuming is deliberate: a laptop dying mid-exam must not cost a child their paper. The clock was " +
      "fixed when they first started and is not restarted.",
  })
  sit(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.exams.start(id, user);
  }

  @Post(":id/answers")
  @ApiOperation({
    summary: "Save one answer",
    description: "Saved as the student works, so a dropped connection costs one question, not a paper.",
  })
  saveAnswer(@Param("id") id: string, @Body() dto: SaveAnswerDto, @CurrentUser() user: AuthenticatedUser) {
    return this.exams.saveAnswer(id, dto, user);
  }

  @Post(":id/submit")
  @ApiOperation({
    summary: "Hand the paper in",
    description: "Everything a machine can mark is marked now; the rest waits for a teacher.",
  })
  submit(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.exams.submit(id, user);
  }

  @Get(":id/my-attempt")
  @ApiOperation({
    summary: "This student's own result",
    description: "Marks appear only once the teacher has released them.",
  })
  myAttempt(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.exams.myAttempt(id, user);
  }

  // ── Marking and releasing (staff only) ─────────────────────────────────

  @Post(":id/collect")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({
    summary: "Mark papers whose time ran out",
    description: "A student who closed the lid would otherwise sit unmarked forever.",
  })
  collect(@Param("id") id: string) {
    return this.exams.collectExpired(id);
  }

  @Get("attempts/:attemptId")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({ summary: "One attempt with every answer, for marking" })
  attempt(@Param("attemptId") attemptId: string) {
    return this.exams.attemptForStaff(attemptId);
  }

  @Patch("attempts/:attemptId/answers/:answerId")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({
    summary: "Award a mark by hand",
    description: "For essays and anything the machine refused to mark. The attempt is re-tallied.",
  })
  markAnswer(
    @Param("attemptId") attemptId: string,
    @Param("answerId") answerId: string,
    @Body() dto: MarkExamAnswerDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.exams.markAnswerByHand(attemptId, answerId, dto, user);
  }

  @Post(":id/release")
  @Roles("SCHOOL_ADMIN", "TEACHER")
  @ApiOperation({
    summary: "Release results to the class",
    description:
      "Attempts still waiting on a human are held back and counted, not released with a hole in them.",
  })
  release(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.exams.release(id, user);
  }
}
