import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
// Reused rather than redefined: a second way of deciding "is this message
// acceptable" is a second way of getting it wrong, and the limits that suit a
// class chat suit this too.
import { BURST_WINDOW_MS, checkMessage, explainProblem } from "@/class-chat/class-chat-rules";
import {
  canDeleteMessage,
  canPostToThread,
  canReadThread,
  inboxRank,
  sideFor,
  toThreadMessageView,
  type ThreadViewer,
} from "./parent-message-rules";
import type { PostParentMessageDto } from "./dto/parent-messages.dto";

@Injectable()
export class ParentMessagesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /**
   * Every thread this person should see, most in need of attention first.
   *
   * For a family, their own children. For staff, the whole school — because
   * whoever is on duty answers, not whoever was addressed.
   */
  async threads(user: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const viewer = await this.viewerFor(user);

    const threads = await client.parentThread.findMany({
      where: viewer.isSchoolStaff ? {} : { studentProfileId: { in: viewer.guardianOf } },
      include: {
        studentProfile: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true } },
            enrollments: { where: { status: "ACTIVE" }, include: { class: { select: { name: true } } }, take: 1 },
          },
        },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    return threads
      .map((thread) => ({
        studentProfileId: thread.studentProfileId,
        studentUserId: thread.studentProfile.user.id,
        studentName: `${thread.studentProfile.user.firstName} ${thread.studentProfile.user.lastName}`,
        className: thread.studentProfile.enrollments[0]?.class.name ?? null,
        lastMessageAt: thread.lastMessageAt,
        lastSide: thread.lastSide,
        // True when the family spoke last: the school owes a reply.
        awaitingSchool: thread.lastSide === "FAMILY",
        preview: thread.messages[0]?.deletedAt
          ? "Message withdrawn"
          : (thread.messages[0]?.body.slice(0, 120) ?? null),
      }))
      .sort(
        (a, b) =>
          inboxRank({ lastSide: a.lastSide, lastAt: a.lastMessageAt }) -
          inboxRank({ lastSide: b.lastSide, lastAt: b.lastMessageAt }),
      );
  }

  /** One thread, oldest message last. Created on first read so a parent can always start one. */
  async thread(studentProfileId: string, user: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const viewer = await this.viewerFor(user);

    // 404 rather than 403 for a child who is not theirs: a guardian probing
    // ids must not learn which students exist.
    if (!canReadThread(viewer, studentProfileId)) {
      throw new NotFoundException("No conversation found for that student");
    }

    const student = await client.studentProfile.findFirst({
      where: { id: studentProfileId, deletedAt: null },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    if (!student) throw new NotFoundException("No conversation found for that student");

    const thread = await this.ensureThread(studentProfileId);
    const messages = await client.parentMessage.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: "asc" },
      take: 200,
    });

    return {
      studentProfileId,
      studentName: `${student.user.firstName} ${student.user.lastName}`,
      canPost: canPostToThread(viewer, studentProfileId),
      youAre: sideFor(viewer),
      messages: messages.map((message) => toThreadMessageView(message, viewer)),
    };
  }

  async post(studentProfileId: string, dto: PostParentMessageDto, user: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const viewer = await this.viewerFor(user);
    if (!canPostToThread(viewer, studentProfileId)) {
      throw new NotFoundException("No conversation found for that student");
    }

    const thread = await this.ensureThread(studentProfileId);
    const now = new Date();
    const since = new Date(now.getTime() - BURST_WINDOW_MS);

    const [last, recentCount] = await Promise.all([
      client.parentMessage.findFirst({
        where: { threadId: thread.id, authorUserId: user.id },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      client.parentMessage.count({
        where: { threadId: thread.id, authorUserId: user.id, createdAt: { gte: since } },
      }),
    ]);

    const problem = checkMessage({ body: dto.body, lastPostedAt: last?.createdAt ?? null, recentCount, now });
    if (problem) throw new BadRequestException(explainProblem(problem));

    const author = await client.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { firstName: true, lastName: true },
    });
    const side = sideFor(viewer);

    const [message] = await client.$transaction([
      client.parentMessage.create({
        data: {
          threadId: thread.id,
          authorUserId: user.id,
          authorName: `${author.firstName} ${author.lastName}`,
          side,
          body: dto.body.trim(),
        },
      }),
      client.parentThread.update({
        where: { id: thread.id },
        data: { lastMessageAt: now, lastSide: side },
      }),
    ]);

    return toThreadMessageView(message, viewer);
  }

  /**
   * Withdraws a message.
   *
   * Soft, like everything else here, but with one difference from the class
   * chat: nobody gets to read the original back. That is two adults talking,
   * and a parent who withdraws a sentence written in anger should not find it
   * quoted at them later.
   */
  async withdraw(messageId: string, user: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const message = await client.parentMessage.findUnique({
      where: { id: messageId },
      include: { thread: { select: { studentProfileId: true } } },
    });
    if (!message) throw new NotFoundException("No message found with that id");

    const viewer = await this.viewerFor(user);
    if (!canReadThread(viewer, message.thread.studentProfileId)) {
      throw new NotFoundException("No message found with that id");
    }
    if (!canDeleteMessage(viewer, message)) {
      throw new ForbiddenException("You can only withdraw your own messages");
    }
    if (message.deletedAt) return toThreadMessageView(message, viewer);

    const updated = await client.parentMessage.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), deletedByUserId: user.id },
    });
    return toThreadMessageView(updated, viewer);
  }

  private async viewerFor(user: AuthenticatedUser): Promise<ThreadViewer> {
    const client = await this.tenantPrisma.getClient();
    const isSchoolStaff = user.roles.includes("SCHOOL_ADMIN") || user.roles.includes("TEACHER");

    const links = isSchoolStaff
      ? []
      : await client.guardianLink.findMany({
          where: { guardianUserId: user.id },
          select: { studentProfileId: true },
        });

    return {
      userId: user.id,
      roles: user.roles,
      guardianOf: links.map((link) => link.studentProfileId),
      isSchoolStaff,
    };
  }

  /** Created on first use: most families never message, and an empty thread per child is noise. */
  private async ensureThread(studentProfileId: string) {
    const client = await this.tenantPrisma.getClient();
    return client.parentThread.upsert({
      where: { studentProfileId },
      create: { studentProfileId },
      update: {},
    });
  }
}
