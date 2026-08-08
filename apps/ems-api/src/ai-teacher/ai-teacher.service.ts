import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { RoleName, TutorTurnRole } from "ems-tenant-client";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { CurriculumSettingsService } from "@/curriculum-settings/curriculum-settings.service";
import { AccessibilityService } from "@/accessibility/accessibility.service";
import { AiService } from "@/ai/ai.service";
import {
  buildCoursePrompt,
  buildLessonPrompt,
  buildTutorPrompt,
  type TranscriptTurn,
  type TutorContext,
} from "./tutor-prompt";
import { checkTurnAllowed, startOfDay } from "./tutor-limits";
import {
  COURSE_RESPONSE_SCHEMA,
  courseFromSchemeWeeks,
  isComplete,
  lessonAt,
  MAX_LESSONS,
  MIN_LESSONS,
  parseCourse,
  percentComplete,
  type Course,
} from "./course";
import { splitReplyAndDiagram } from "./sanitize-svg";
import { matchResources } from "./match-resources";
import type { StartSessionDto } from "./dto/start-session.dto";
import type { AskQuestionDto } from "./dto/ask-question.dto";

const STAFF_ROLES: RoleName[] = ["SCHOOL_ADMIN", "TEACHER"];

function isStaff(viewer: AuthenticatedUser): boolean {
  return viewer.roles.some((role) => STAFF_ROLES.includes(role));
}

interface SchemeWeek {
  weekNumber: number;
  topic?: string;
  objectives?: string[];
}

@Injectable()
export class AiTeacherService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly curriculumSettings: CurriculumSettingsService,
    private readonly accessibility: AccessibilityService,
    private readonly ai: AiService,
  ) {}

  async start(dto: StartSessionDto, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();

    // A guardian is not the learner. Letting a parent hold the session would
    // put their words in a child's transcript under the child's name.
    if (viewer.roles.includes("GUARDIAN") && !isStaff(viewer)) {
      throw new ForbiddenException("Only a student can start a lesson. Guardians can read their child's lessons.");
    }

    const subject = await client.subject.findFirst({ where: { id: dto.subjectId, deletedAt: null } });
    if (!subject) throw new NotFoundException("No subject found with that id");

    let scheme = null;
    if (dto.schemeOfWorkId) {
      scheme = await client.schemeOfWork.findFirst({ where: { id: dto.schemeOfWorkId } });
      if (!scheme) throw new NotFoundException("No scheme of work found with that id");
      if (scheme.subjectId !== dto.subjectId) {
        throw new NotFoundException("That scheme of work belongs to a different subject");
      }
    }

    const mode = dto.mode ?? "ASK";
    const ownProfile = await client.studentProfile.findUnique({
      where: { userId: viewer.id },
      select: { id: true },
    });

    // Planning the course is the one provider call a class makes before any
    // teaching happens, so it is subject to the same daily ceiling.
    let outline: Course | null = null;
    if (mode === "AUTO") {
      await this.assertWithinDailyLimit(viewer.id);
      outline = await this.planCourse(subject, scheme?.content, dto);
    }

    return client.tutorSession.create({
      data: {
        // Null for a staff member trying the tutor out; authorisation always
        // goes through startedByUserId, which is never null.
        studentProfileId: ownProfile?.id ?? null,
        startedByUserId: viewer.id,
        subjectId: dto.subjectId,
        schemeOfWorkId: dto.schemeOfWorkId ?? null,
        weekNumber: dto.weekNumber ?? null,
        topic: dto.topic.trim(),
        mode,
        outline: outline as unknown as object,
      },
      include: { subject: true, turns: { orderBy: { sequence: "asc" } } },
    });
  }

  /**
   * Asks one question and stores both halves of the exchange.
   *
   * Only the person whose session it is may speak in it — not a teacher, not
   * an admin. The transcript is what a school or a parent reads to know what
   * the AI said to a child, and it is only worth reading if nobody else can
   * write into it.
   *
   * In an automatic class this answers without advancing: interrupting to ask
   * something must not cost the student a lesson.
   */
  async ask(sessionId: string, dto: AskQuestionDto, viewer: AuthenticatedUser) {
    const session = await this.ownSession(sessionId, viewer);
    await this.assertMaySpend(session, viewer.id);

    const context = await this.contextFor(session);
    const transcript = this.transcriptOf(session.turns);
    const prompt = buildTutorPrompt(context, transcript, dto.question);

    const { question, answer } = await this.exchange(session, {
      studentContent: dto.question.trim(),
      prompt,
      // Null: a question is not part of the course, which is what stops it
      // being mistaken for a taught lesson when the transcript is read back.
      lessonIndex: null,
    });

    return { question, answer, position: session.position };
  }

  /**
   * Teaches the next lesson of an automatic class.
   *
   * `position` moves only after the lesson is stored. A request that dies
   * mid-flight therefore re-teaches a lesson rather than skipping one — the
   * same choice as reserving a turn before calling the provider, and for the
   * same reason: repeating is recoverable, losing is not.
   */
  async continueClass(sessionId: string, viewer: AuthenticatedUser) {
    const session = await this.ownSession(sessionId, viewer);
    if (session.mode !== "AUTO") {
      throw new BadRequestException("This lesson is question-and-answer. Ask a question instead.");
    }

    const course = parseCourse(session.outline);
    if (isComplete(course, session.position)) {
      return { finished: true, position: session.position, percent: 100, turn: null };
    }

    const lesson = lessonAt(course, session.position);
    if (!lesson || !course) throw new BadRequestException("This class has no lessons left to teach.");

    await this.assertMaySpend(session, viewer.id);

    const context = await this.contextFor(session);
    const prompt = buildLessonPrompt(
      context,
      lesson,
      { index: session.position, total: course.lessons.length },
      this.transcriptOf(session.turns),
    );

    const { answer } = await this.exchange(session, {
      studentContent: null,
      prompt,
      lessonIndex: session.position,
    });

    const client = await this.tenantPrisma.getClient();
    const position = session.position + 1;
    await client.tutorSession.update({
      where: { id: sessionId },
      // Resuming a paused class is implicit in continuing it; making the
      // student press two buttons to carry on would be pointless ceremony.
      data: { position, status: "ACTIVE" },
    });

    return {
      finished: isComplete(course, position),
      position,
      percent: percentComplete(course, position),
      turn: answer,
      lesson,
    };
  }

  /** Puts a class down without ending it. `position` is what it comes back to. */
  async pause(sessionId: string, viewer: AuthenticatedUser) {
    const session = await this.ownSession(sessionId, viewer);
    if (session.status === "ENDED") return session;

    const client = await this.tenantPrisma.getClient();
    return client.tutorSession.update({ where: { id: sessionId }, data: { status: "PAUSED" } });
  }

  async resume(sessionId: string, viewer: AuthenticatedUser) {
    const session = await this.ownSession(sessionId, viewer);
    if (session.status === "ENDED") {
      throw new BadRequestException("This class has ended. Start a new one to keep learning.");
    }

    const client = await this.tenantPrisma.getClient();
    return client.tutorSession.update({ where: { id: sessionId }, data: { status: "ACTIVE" } });
  }

  async list(viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();

    const sessions = await client.tutorSession.findMany({
      where: await this.readableWhere(viewer),
      include: {
        subject: true,
        startedByUser: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { turns: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    return sessions.map((session) => ({
      ...session,
      percent: percentComplete(parseCourse(session.outline), session.position),
    }));
  }

  async findOne(id: string, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();

    const session = await client.tutorSession.findFirst({
      where: { id, ...(await this.readableWhere(viewer)) },
      include: {
        subject: true,
        startedByUser: { select: { id: true, firstName: true, lastName: true } },
        turns: { orderBy: { sequence: "asc" } },
      },
    });
    if (!session) throw new NotFoundException("No lesson found with that id");

    const course = parseCourse(session.outline);
    const upcoming = lessonAt(course, session.position);

    // Demonstrations for the lesson about to be taught, offered rather than
    // forced: the student chooses whether to watch before carrying on.
    //
    // A student who needs captions is shown only captioned ones. Offering a
    // video they cannot follow is worse than offering nothing: it presents a
    // choice that is not actually theirs to make.
    const needs = await this.accessibility.needsFor(session.startedByUserId);
    const resources = upcoming
      ? matchResources(
          await client.lessonResource.findMany({
            where: {
              subjectId: session.subjectId,
              deletedAt: null,
              ...(needs?.requireCaptions ? { hasCaptions: true } : {}),
            },
            orderBy: { createdAt: "asc" },
          }),
          upcoming.title,
        )
      : [];

    return {
      ...session,
      course,
      currentLesson: upcoming,
      percent: percentComplete(course, session.position),
      finished: isComplete(course, session.position),
      resources,
    };
  }

  async end(id: string, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();

    const session = await client.tutorSession.findFirst({ where: { id, ...(await this.readableWhere(viewer)) } });
    if (!session) throw new NotFoundException("No lesson found with that id");

    // A teacher may close a lesson they can see; a guardian may not, because
    // reading is not the same as intervening.
    if (session.startedByUserId !== viewer.id && !isStaff(viewer)) {
      throw new ForbiddenException("Only the student or a member of staff can end a lesson");
    }
    if (session.status === "ENDED") return session;

    return client.tutorSession.update({
      where: { id },
      data: { status: "ENDED", endedAt: new Date() },
    });
  }

  private async planCourse(
    subject: { name: string; gradeLevel: string | null },
    schemeContent: unknown,
    dto: StartSessionDto,
  ): Promise<Course> {
    // When the class is anchored to a scheme of work the school has already
    // decided what is taught and in what order. Generating a parallel
    // syllabus would quietly teach something else.
    const fromScheme = courseFromSchemeWeeks((schemeContent as { weeks?: SchemeWeek[] })?.weeks);
    if (fromScheme) return fromScheme;

    const settings = await this.curriculumSettings.get();
    const prompt = buildCoursePrompt(
      {
        subjectName: subject.name,
        gradeLevel: subject.gradeLevel,
        topic: dto.topic,
        country: settings.country,
        curriculumStandard: settings.curriculumStandard,
      },
      { min: MIN_LESSONS, max: MAX_LESSONS },
    );

    const course = parseCourse(await this.ai.generateJson(prompt, COURSE_RESPONSE_SCHEMA));
    if (!course) {
      // Better to refuse than to open a class whose first "continue" has
      // nothing to teach.
      throw new BadRequestException("Couldn't plan a course for that topic. Try describing it differently.");
    }
    return course;
  }

  /**
   * Writes the student's turn, calls the provider, writes the reply.
   *
   * The student's turn is stored first so a double-tapped Send collides on
   * `(sessionId, sequence)` instead of buying a second answer; if the call
   * then fails, the reservation is removed so the transcript never shows a
   * question the tutor appears to have ignored.
   */
  private async exchange(
    session: { id: string; turns: Array<{ sequence: number }> },
    input: { studentContent: string | null; prompt: string; lessonIndex: number | null },
  ) {
    const client = await this.tenantPrisma.getClient();
    const nextSequence = session.turns.reduce((max, turn) => Math.max(max, turn.sequence), 0) + 1;

    const question =
      input.studentContent === null
        ? null
        : await client.tutorTurn.create({
            data: {
              sessionId: session.id,
              sequence: nextSequence,
              role: "STUDENT" as TutorTurnRole,
              content: input.studentContent,
              lessonIndex: input.lessonIndex,
            },
          });

    let reply: string;
    try {
      reply = await this.ai.generateText(input.prompt);
    } catch (error) {
      if (question) await client.tutorTurn.delete({ where: { id: question.id } }).catch(() => undefined);
      throw error;
    }

    // The diagram is model-written markup bound for a child's browser, so it
    // is sanitised before it is stored, not on the way out. Anything that
    // fails is dropped and the lesson text kept.
    const { text, diagram, diagramAlt } = splitReplyAndDiagram(reply);

    const answer = await client.tutorTurn.create({
      data: {
        sessionId: session.id,
        sequence: question ? nextSequence + 1 : nextSequence,
        role: "TUTOR" as TutorTurnRole,
        content: text || reply.trim(),
        diagram,
        diagramAlt,
        lessonIndex: input.lessonIndex,
      },
    });

    await client.tutorSession.update({ where: { id: session.id }, data: { updatedAt: new Date() } });
    return { question, answer };
  }

  private async contextFor(session: {
    startedByUserId: string;
    subject: { name: string; gradeLevel: string | null };
    topic: string;
    weekNumber: number | null;
    schemeOfWork: { content: unknown } | null;
  }): Promise<TutorContext> {
    const settings = await this.curriculumSettings.get();
    // Only the accommodation travels — `needsFor` never selects the note
    // saying why it is needed. See accessibility-prompt.ts.
    const accessibility = await this.accessibility.needsFor(session.startedByUserId);

    return {
      subjectName: session.subject.name,
      gradeLevel: session.subject.gradeLevel,
      topic: session.topic,
      objectives: this.weekObjectives(session.schemeOfWork?.content, session.weekNumber),
      country: settings.country,
      curriculumStandard: settings.curriculumStandard,
      accessibility,
    };
  }

  private transcriptOf(turns: Array<{ role: TutorTurnRole; content: string }>): TranscriptTurn[] {
    return turns.map((turn) => ({ role: turn.role, content: turn.content }));
  }

  /** Loads a session the viewer is allowed to speak in, which is only their own. */
  private async ownSession(sessionId: string, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();

    const session = await client.tutorSession.findFirst({
      where: { id: sessionId },
      include: { subject: true, schemeOfWork: true, turns: { orderBy: { sequence: "asc" } } },
    });
    // 404 rather than 403 in both cases: whether a given lesson exists is
    // itself information about another student.
    if (!session || session.startedByUserId !== viewer.id) {
      throw new NotFoundException("No lesson found with that id");
    }
    return session;
  }

  private async assertMaySpend(
    session: { status: "ACTIVE" | "PAUSED" | "ENDED"; turns: Array<{ role: TutorTurnRole }> },
    userId: string,
  ) {
    const client = await this.tenantPrisma.getClient();

    // Tutor turns, not student ones: an automatic class advances without a
    // question being typed and costs exactly the same.
    const turnsInSession = session.turns.filter((turn) => turn.role === "TUTOR").length;
    const turnsToday = await client.tutorTurn.count({
      where: {
        role: "TUTOR",
        createdAt: { gte: startOfDay(new Date()) },
        session: { startedByUserId: userId },
      },
    });

    const decision = checkTurnAllowed({ turnsInSession, turnsToday }, session.status);
    if (!decision.allowed) throw new ForbiddenException(decision.reason);
  }

  /** The daily ceiling alone, for spending that happens before a session exists. */
  private async assertWithinDailyLimit(userId: string) {
    const client = await this.tenantPrisma.getClient();
    const turnsToday = await client.tutorTurn.count({
      where: {
        role: "TUTOR",
        createdAt: { gte: startOfDay(new Date()) },
        session: { startedByUserId: userId },
      },
    });

    const decision = checkTurnAllowed({ turnsInSession: 0, turnsToday }, "ACTIVE");
    if (!decision.allowed) throw new ForbiddenException(decision.reason);
  }

  /**
   * Which sessions this viewer may read.
   *
   * Staff see the school's lessons, which is the point of keeping transcripts.
   * A guardian sees the lessons of the children linked to them. Everyone else
   * sees only their own.
   */
  private async readableWhere(viewer: AuthenticatedUser) {
    if (isStaff(viewer)) return {};

    const client = await this.tenantPrisma.getClient();

    if (viewer.roles.includes("GUARDIAN")) {
      const links = await client.guardianLink.findMany({
        where: { guardianUserId: viewer.id },
        select: { studentProfileId: true },
      });
      const ids = links.map((link) => link.studentProfileId);
      // An empty `in` matches nothing, which is the correct answer for a
      // guardian with no linked children — not "everything".
      return { studentProfileId: { in: ids } };
    }

    return { startedByUserId: viewer.id };
  }

  private weekObjectives(content: unknown, weekNumber: number | null): string[] | undefined {
    if (!content || weekNumber === null) return undefined;

    const weeks = (content as { weeks?: SchemeWeek[] }).weeks;
    if (!Array.isArray(weeks)) return undefined;

    const week = weeks.find((candidate) => candidate.weekNumber === weekNumber);
    return week?.objectives?.filter((objective) => typeof objective === "string");
  }
}
