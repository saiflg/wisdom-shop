import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { RoleName } from "ems-tenant-client";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { CurriculumSettingsService } from "@/curriculum-settings/curriculum-settings.service";
import { AiService } from "@/ai/ai.service";
import { buildTutorPrompt, type TranscriptTurn, type TutorContext } from "./tutor-prompt";
import { checkTurnAllowed, startOfDay } from "./tutor-limits";
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

    if (dto.schemeOfWorkId) {
      const scheme = await client.schemeOfWork.findFirst({ where: { id: dto.schemeOfWorkId } });
      if (!scheme) throw new NotFoundException("No scheme of work found with that id");
      if (scheme.subjectId !== dto.subjectId) {
        throw new NotFoundException("That scheme of work belongs to a different subject");
      }
    }

    const ownProfile = await client.studentProfile.findUnique({
      where: { userId: viewer.id },
      select: { id: true },
    });

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
   */
  async ask(sessionId: string, dto: AskQuestionDto, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();

    const session = await client.tutorSession.findFirst({
      where: { id: sessionId },
      include: { subject: true, schemeOfWork: true, turns: { orderBy: { sequence: "asc" } } },
    });
    if (!session) throw new NotFoundException("No lesson found with that id");
    if (session.startedByUserId !== viewer.id) {
      // 404 rather than 403: whether a given lesson exists is itself
      // information about another student.
      throw new NotFoundException("No lesson found with that id");
    }

    const turnsInSession = session.turns.filter((turn) => turn.role === "STUDENT").length;
    const turnsToday = await client.tutorTurn.count({
      where: {
        role: "STUDENT",
        createdAt: { gte: startOfDay(new Date()) },
        session: { startedByUserId: viewer.id },
      },
    });

    const decision = checkTurnAllowed({ turnsInSession, turnsToday }, session.status);
    if (!decision.allowed) throw new ForbiddenException(decision.reason);

    const settings = await this.curriculumSettings.get();
    const context: TutorContext = {
      subjectName: session.subject.name,
      gradeLevel: session.subject.gradeLevel,
      topic: session.topic,
      objectives: this.weekObjectives(session.schemeOfWork?.content, session.weekNumber),
      country: settings.country,
      curriculumStandard: settings.curriculumStandard,
    };

    const transcript: TranscriptTurn[] = session.turns.map((turn) => ({
      role: turn.role,
      content: turn.content,
    }));

    const nextSequence = session.turns.reduce((max, turn) => Math.max(max, turn.sequence), 0) + 1;

    // The question is stored before the provider is called, so a double-tapped
    // Send collides on (sessionId, sequence) and never gets billed twice. If
    // the call then fails the reservation is removed, leaving a clean
    // transcript the student can simply retry into.
    const studentTurn = await client.tutorTurn.create({
      data: { sessionId, sequence: nextSequence, role: "STUDENT", content: dto.question.trim() },
    });

    let answer: string;
    try {
      answer = await this.ai.generateText(buildTutorPrompt(context, transcript, dto.question));
    } catch (error) {
      await client.tutorTurn.delete({ where: { id: studentTurn.id } }).catch(() => undefined);
      throw error;
    }

    const tutorTurn = await client.tutorTurn.create({
      data: { sessionId, sequence: nextSequence + 1, role: "TUTOR", content: answer },
    });

    await client.tutorSession.update({ where: { id: sessionId }, data: { updatedAt: new Date() } });

    return { question: studentTurn, answer: tutorTurn };
  }

  async list(viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();

    return client.tutorSession.findMany({
      where: await this.readableWhere(viewer),
      include: {
        subject: true,
        startedByUser: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { turns: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
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
    return session;
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
