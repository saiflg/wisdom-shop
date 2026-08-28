import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import type { CreateLiveLessonDto } from "./dto/create-live-lesson.dto";
import { canJoin, forDisplay, stateOf, validateMeetingUrl, validateTimes } from "./meeting-rules";

const STAFF_ROLES = ["SCHOOL_ADMIN", "TEACHER"];

@Injectable()
export class LiveClassroomService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async schedule(dto: CreateLiveLessonDto, actor: AuthenticatedUser) {
    const linkProblem = validateMeetingUrl(dto.meetingUrl);
    if (linkProblem) throw new BadRequestException(linkProblem);

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    const timeProblem = validateTimes(startsAt, endsAt);
    if (timeProblem) throw new BadRequestException(timeProblem);

    const client = await this.tenantPrisma.getClient();
    const schoolClass = await client.class.findFirst({ where: { id: dto.classId, deletedAt: null } });
    if (!schoolClass) throw new NotFoundException("No class found with that id");

    return client.liveLesson.create({
      data: {
        classId: dto.classId,
        subjectId: dto.subjectId ?? null,
        title: dto.title.trim(),
        meetingUrl: dto.meetingUrl.trim(),
        startsAt,
        endsAt,
        createdByUserId: actor.id,
        createdByName: await this.nameOf(actor.id),
      },
    });
  }

  /**
   * Lessons for a class, in the order somebody wants them.
   *
   * The meeting link is withheld until the lesson is close enough to join.
   * A child given the link on Monday for a Friday lesson is a child who can
   * open an empty meeting room unsupervised at any point in between — and a
   * link that has been sitting in a browser history all week is a link that
   * has left the school.
   */
  async forClass(classId: string, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const now = new Date();
    const isStaff = viewer.roles.some((role) => STAFF_ROLES.includes(role));

    const lessons = await client.liveLesson.findMany({
      where: { classId },
      orderBy: { startsAt: "asc" },
      take: 100,
      include: { subject: { select: { id: true, name: true } } },
    });

    return forDisplay(lessons, now).map((lesson) => {
      const joinable = canJoin(lesson, now);
      return {
        id: lesson.id,
        title: lesson.title,
        subject: lesson.subject,
        startsAt: lesson.startsAt,
        endsAt: lesson.endsAt,
        cancelledAt: lesson.cancelledAt,
        createdByName: lesson.createdByName,
        state: stateOf(lesson, now),
        canJoin: joinable,
        // Staff always see it, because they have to check it before the
        // lesson. Everybody else gets it only when it is time.
        meetingUrl: isStaff || joinable ? lesson.meetingUrl : null,
      };
    });
  }

  /**
   * Call a lesson off.
   *
   * Cancelled, never deleted. Children may already have the time in their
   * heads, and a lesson that silently disappears is one somebody sits waiting
   * for.
   */
  async cancel(id: string, actor: AuthenticatedUser) {
    if (!actor.roles.some((role) => STAFF_ROLES.includes(role))) {
      throw new ForbiddenException("Only school staff can cancel a live lesson");
    }
    const client = await this.tenantPrisma.getClient();
    const lesson = await client.liveLesson.findUnique({ where: { id } });
    if (!lesson) throw new NotFoundException("No live lesson found with that id");
    if (lesson.cancelledAt) return { lesson, alreadyCancelled: true };

    const updated = await client.liveLesson.update({
      where: { id },
      data: { cancelledAt: new Date() },
    });
    return { lesson: updated, alreadyCancelled: false };
  }

  private async nameOf(userId: string): Promise<string> {
    const client = await this.tenantPrisma.getClient();
    const user = await client.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });
    return user ? `${user.firstName} ${user.lastName}`.trim() : "Unknown";
  }
}
