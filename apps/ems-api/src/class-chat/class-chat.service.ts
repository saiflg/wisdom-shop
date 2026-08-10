import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import {
  BURST_WINDOW_MS,
  SUPERVISION_NOTICE,
  canDelete,
  canLock,
  canPost,
  canReadConversation,
  checkMessage,
  explainProblem,
  isStaff,
  toMessageView,
  type ChatViewer,
} from "./class-chat-rules";
import type { LockConversationDto, PostMessageDto, ReportMessageDto } from "./dto/class-chat.dto";

const PAGE_SIZE = 50;

@Injectable()
export class ClassChatService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /**
   * Everyone in a class, and who is responsible for it.
   *
   * Serves the class page as well as the chat, because they answer the same
   * question from different angles: who is in this room.
   */
  async members(classId: string, user: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const viewer = await this.viewerFor(classId, user);

    // Same rule as the conversation: a student may see who is in their own
    // class and no other. A class list is not a school directory.
    if (!canReadConversation(viewer)) {
      throw new ForbiddenException("You are not in this class");
    }

    const [klass, enrollments, teaching, leaders] = await Promise.all([
      client.class.findFirst({
        where: { id: classId, deletedAt: null },
        include: {
          homeroomTeacher: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
      client.enrollment.findMany({
        where: { classId, status: "ACTIVE" },
        include: {
          studentProfile: {
            include: { user: { select: { id: true, firstName: true, lastName: true } } },
          },
        },
      }),
      client.teachingAssignment.findMany({
        where: { classId, teacherUserId: { not: null } },
        include: {
          subject: { select: { id: true, name: true } },
          teacher: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      client.staffProfile.findMany({
        where: { leadership: { not: null } },
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
      }),
    ]);

    if (!klass) throw new NotFoundException("No class found with that id");

    return {
      class: { id: klass.id, name: klass.name, gradeLevel: klass.gradeLevel, academicYear: klass.academicYear },
      classTeacher: klass.homeroomTeacher
        ? {
            id: klass.homeroomTeacher.id,
            name: `${klass.homeroomTeacher.firstName} ${klass.homeroomTeacher.lastName}`,
          }
        : null,
      subjectTeachers: teaching
        .filter((assignment) => assignment.teacher)
        .map((assignment) => ({
          id: assignment.teacher!.id,
          name: `${assignment.teacher!.firstName} ${assignment.teacher!.lastName}`,
          subject: assignment.subject.name,
        })),
      leadership: leaders.map((profile) => ({
        id: profile.user.id,
        name: `${profile.user.firstName} ${profile.user.lastName}`,
        role: profile.leadership,
        jobTitle: profile.jobTitle,
      })),
      students: enrollments
        .map((enrollment) => ({
          id: enrollment.studentProfile.user.id,
          studentProfileId: enrollment.studentProfile.id,
          name: `${enrollment.studentProfile.user.firstName} ${enrollment.studentProfile.user.lastName}`,
          // Deliberately no email, date of birth or guardian here. A class
          // list tells thirty children who their classmates are; it is not a
          // contact list for them.
          studentCode: isStaff(viewer) ? enrollment.studentProfile.studentCode : null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      you: { canPost: canPost(viewer, { lockedAt: null }), isStaff: isStaff(viewer) },
    };
  }

  async conversation(classId: string, user: AuthenticatedUser, before?: string) {
    const client = await this.tenantPrisma.getClient();
    const viewer = await this.viewerFor(classId, user);
    if (!canReadConversation(viewer)) throw new ForbiddenException("You are not in this class");

    const conversation = await this.ensureConversation(classId);

    const messages = await client.classMessage.findMany({
      where: {
        conversationId: conversation.id,
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
    });

    return {
      conversationId: conversation.id,
      locked: conversation.lockedAt !== null,
      lockedReason: conversation.lockedReason,
      // Sent to everyone, including staff: a teacher should see what their
      // students are being told about who is reading.
      notice: SUPERVISION_NOTICE,
      canPost: canPost(viewer, conversation),
      canModerate: isStaff(viewer),
      messages: messages.reverse().map((message) => toMessageView(message, viewer)),
      hasMore: messages.length === PAGE_SIZE,
    };
  }

  async post(classId: string, dto: PostMessageDto, user: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const viewer = await this.viewerFor(classId, user);
    const conversation = await this.ensureConversation(classId);

    if (!canPost(viewer, conversation)) {
      throw new ForbiddenException(
        conversation.lockedAt ? "A teacher has paused this chat" : "You cannot post in this class",
      );
    }

    const now = new Date();
    const since = new Date(now.getTime() - BURST_WINDOW_MS);
    const [last, recentCount] = await Promise.all([
      client.classMessage.findFirst({
        where: { conversationId: conversation.id, authorUserId: user.id },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      client.classMessage.count({
        where: { conversationId: conversation.id, authorUserId: user.id, createdAt: { gte: since } },
      }),
    ]);

    const problem = checkMessage({
      body: dto.body,
      lastPostedAt: last?.createdAt ?? null,
      recentCount,
      now,
    });
    if (problem) throw new BadRequestException(explainProblem(problem));

    const author = await client.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { firstName: true, lastName: true, roles: true },
    });

    const message = await client.classMessage.create({
      data: {
        conversationId: conversation.id,
        authorUserId: user.id,
        authorName: `${author.firstName} ${author.lastName}`,
        authorRole: author.roles.includes("TEACHER") || author.roles.includes("SCHOOL_ADMIN") ? "STAFF" : "STUDENT",
        body: dto.body.trim(),
      },
    });

    return toMessageView(message, viewer);
  }

  /**
   * Removes a message without destroying it.
   *
   * Soft delete throughout: the row stays, the text stays, and staff can
   * still read it. A student taking back something unkind should be able to,
   * and the teacher dealing with the fallout still needs to know what was
   * said.
   */
  async remove(messageId: string, user: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const message = await client.classMessage.findUnique({
      where: { id: messageId },
      include: { conversation: { select: { classId: true } } },
    });
    if (!message) throw new NotFoundException("No message found with that id");

    const viewer = await this.viewerFor(message.conversation.classId, user);
    if (!canReadConversation(viewer)) throw new ForbiddenException("You are not in this class");
    if (!canDelete(viewer, message)) throw new ForbiddenException("You can only remove your own messages");
    if (message.deletedAt) return toMessageView(message, viewer);

    const updated = await client.classMessage.update({
      where: { id: messageId },
      data: {
        deletedAt: new Date(),
        deletedByUserId: user.id,
        deletedReason: isStaff(viewer) ? "Removed by staff" : "Removed by the author",
      },
    });
    return toMessageView(updated, viewer);
  }

  /**
   * A student saying "this one is not ok".
   *
   * Reporting never deletes. If it did, any group of children could silence
   * anyone by agreeing to report them — and the teacher would find an empty
   * conversation with no idea what happened.
   */
  async report(messageId: string, dto: ReportMessageDto, user: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const message = await client.classMessage.findUnique({
      where: { id: messageId },
      include: { conversation: { select: { classId: true } } },
    });
    if (!message) throw new NotFoundException("No message found with that id");

    const viewer = await this.viewerFor(message.conversation.classId, user);
    if (!canReadConversation(viewer)) throw new ForbiddenException("You are not in this class");

    const reporter = await client.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { firstName: true, lastName: true },
    });

    await client.classMessageReport.upsert({
      where: { messageId_reportedByUserId: { messageId, reportedByUserId: user.id } },
      create: {
        messageId,
        reportedByUserId: user.id,
        reportedByName: `${reporter.firstName} ${reporter.lastName}`,
        reason: dto.reason.trim(),
      },
      // A second report from the same person replaces the first rather than
      // failing: they may simply have more to say.
      update: { reason: dto.reason.trim() },
    });

    return { reported: true, message: "Thank you. A teacher will look at this." };
  }

  /** Everything a teacher needs to look at, newest first. */
  async reports(user: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    if (!isStaff({ roles: user.roles })) throw new ForbiddenException("Staff only");

    const reports = await client.classMessageReport.findMany({
      orderBy: [{ reviewedAt: "asc" }, { createdAt: "desc" }],
      take: 200,
      include: {
        message: {
          include: { conversation: { include: { class: { select: { id: true, name: true } } } } },
        },
      },
    });

    return reports.map((report) => ({
      id: report.id,
      reason: report.reason,
      reportedByName: report.reportedByName,
      createdAt: report.createdAt,
      reviewedAt: report.reviewedAt,
      outcome: report.outcome,
      class: report.message.conversation.class,
      message: {
        id: report.message.id,
        authorName: report.message.authorName,
        // Staff view: the text is shown whether or not it was removed. That
        // is the point of the queue.
        body: report.message.body,
        deleted: report.message.deletedAt !== null,
        createdAt: report.message.createdAt,
      },
    }));
  }

  async lock(classId: string, dto: LockConversationDto, user: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const viewer = await this.viewerFor(classId, user);
    if (!canLock(viewer)) throw new ForbiddenException("Only this class's teachers can pause the chat");

    const conversation = await this.ensureConversation(classId);
    const updated = await client.classConversation.update({
      where: { id: conversation.id },
      data: dto.locked
        ? { lockedAt: new Date(), lockedById: user.id, lockedReason: dto.reason ?? null }
        : { lockedAt: null, lockedById: null, lockedReason: null },
    });

    return { locked: updated.lockedAt !== null, lockedReason: updated.lockedReason };
  }

  /**
   * Works out where this person stands in relation to one class.
   *
   * Every route starts here, so "am I in this room" is answered the same way
   * everywhere rather than being re-derived per endpoint.
   */
  private async viewerFor(classId: string, user: AuthenticatedUser): Promise<ChatViewer> {
    const client = await this.tenantPrisma.getClient();

    const [enrollment, homeroom, assignment] = await Promise.all([
      client.enrollment.findFirst({
        where: { classId, status: "ACTIVE", studentProfile: { userId: user.id } },
        select: { id: true },
      }),
      client.class.findFirst({ where: { id: classId, homeroomTeacherId: user.id }, select: { id: true } }),
      client.teachingAssignment.findFirst({ where: { classId, teacherUserId: user.id }, select: { id: true } }),
    ]);

    return {
      userId: user.id,
      roles: user.roles,
      enrolled: enrollment !== null,
      teachesClass: homeroom !== null || assignment !== null,
    };
  }

  /** Created on first use rather than at class creation — most classes never chat. */
  private async ensureConversation(classId: string) {
    const client = await this.tenantPrisma.getClient();
    const klass = await client.class.findFirst({ where: { id: classId, deletedAt: null }, select: { id: true } });
    if (!klass) throw new NotFoundException("No class found with that id");

    return client.classConversation.upsert({
      where: { classId },
      create: { classId },
      update: {},
    });
  }
}
