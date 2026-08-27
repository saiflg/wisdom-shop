import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import type { CreateLessonNoteDto } from "./dto/create-lesson-note.dto";
import type { UpdateLessonNoteDto } from "./dto/update-lesson-note.dto";
import type { TransitionLessonNoteDto } from "./dto/transition-lesson-note.dto";
import { availableTransitions, checkTransition, type LessonNoteStatus } from "./note-workflow";

const STAFF_ROLES = ["SCHOOL_ADMIN", "TEACHER"];

@Injectable()
export class LessonNotesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(dto: CreateLessonNoteDto, actor: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();

    try {
      return await client.lessonNote.create({
        data: {
          subjectId: dto.subjectId,
          classId: dto.classId,
          academicYear: dto.academicYear,
          term: dto.term,
          weekNumber: dto.weekNumber,
          title: dto.title.trim(),
          body: dto.body,
          authorUserId: actor.id,
          authorName: await this.nameOf(actor.id),
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") {
        throw new ConflictException("There is already a note for that subject, class and week");
      }
      if ((error as { code?: string }).code === "P2003") {
        throw new NotFoundException("That class or subject does not exist");
      }
      throw error;
    }
  }

  /**
   * Notes for a class, narrowed by who is asking.
   *
   * A child sees approved notes only. Everything else — a note half written,
   * or one a head teacher sent back because it was wrong — is invisible to
   * them, because it is not what they should be revising from.
   */
  async list(
    viewer: AuthenticatedUser,
    filter: { classId?: string; subjectId?: string; status?: LessonNoteStatus },
  ) {
    const client = await this.tenantPrisma.getClient();
    const isStaff = viewer.roles.some((role) => STAFF_ROLES.includes(role));

    return client.lessonNote.findMany({
      where: {
        deletedAt: null,
        ...(filter.classId ? { classId: filter.classId } : {}),
        ...(filter.subjectId ? { subjectId: filter.subjectId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
        // Not a filter a caller can widen: applied after theirs.
        ...(isStaff ? {} : { status: "APPROVED" as const }),
      },
      orderBy: [{ weekNumber: "asc" }, { title: "asc" }],
      include: {
        subject: { select: { id: true, name: true } },
        class: { select: { id: true, name: true } },
      },
    });
  }

  async findOne(id: string, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const note = await client.lessonNote.findFirst({
      where: { id, deletedAt: null },
      include: {
        subject: { select: { id: true, name: true } },
        class: { select: { id: true, name: true } },
      },
    });
    if (!note) throw new NotFoundException("No lesson note found with that id");

    const isStaff = viewer.roles.some((role) => STAFF_ROLES.includes(role));
    // 404 rather than 403: an unapproved note is not something a child should
    // learn the existence of, let alone that it was sent back.
    if (!isStaff && note.status !== "APPROVED") {
      throw new NotFoundException("No lesson note found with that id");
    }

    return {
      ...note,
      availableTransitions: isStaff
        ? availableTransitions(note.status, {
            isAdmin: viewer.roles.includes("SCHOOL_ADMIN"),
            isAuthor: note.authorUserId === viewer.id,
          })
        : [],
    };
  }

  /**
   * Edit the note itself.
   *
   * Only while it is a draft or has been returned. Editing the body of a note
   * that has already been approved would make the approval meaningless — the
   * head teacher signed off something else.
   */
  async update(id: string, dto: UpdateLessonNoteDto, actor: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const note = await client.lessonNote.findFirst({ where: { id, deletedAt: null } });
    if (!note) throw new NotFoundException("No lesson note found with that id");

    const isAuthor = note.authorUserId === actor.id;
    if (!isAuthor && !actor.roles.includes("SCHOOL_ADMIN")) {
      throw new ForbiddenException("Only the teacher who wrote it can edit this note");
    }
    if (note.status !== "DRAFT" && note.status !== "RETURNED") {
      throw new BadRequestException(
        "This note has been sent for vetting. It has to be returned before it can be edited.",
      );
    }

    return client.lessonNote.update({
      where: { id },
      data: { title: dto.title?.trim(), body: dto.body },
    });
  }

  /**
   * Move a note through the workflow.
   *
   * The decision is `checkTransition`, a pure function, not a role decorator.
   * A head teacher who also teaches is the ordinary case in a small school,
   * and `@Roles("SCHOOL_ADMIN")` on an approve route would wave exactly that
   * person through their own note.
   */
  async transition(id: string, dto: TransitionLessonNoteDto, actor: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const note = await client.lessonNote.findFirst({ where: { id, deletedAt: null } });
    if (!note) throw new NotFoundException("No lesson note found with that id");

    const problem = checkTransition(note.status, dto.to, {
      isAdmin: actor.roles.includes("SCHOOL_ADMIN"),
      isAuthor: note.authorUserId === actor.id,
    });
    if (problem) throw new ForbiddenException(problem);

    if (dto.to === "RETURNED" && !dto.comment?.trim()) {
      // Returning a note without saying why leaves a teacher to guess, and
      // guessing is how the same note comes back unchanged.
      throw new BadRequestException("Say what needs changing when you send a note back");
    }

    const reviewerName = await this.nameOf(actor.id);

    return client.lessonNote.update({
      where: { id },
      data: {
        status: dto.to,
        submittedAt: dto.to === "SUBMITTED" ? new Date() : undefined,
        ...(dto.to === "APPROVED" || dto.to === "RETURNED"
          ? {
              reviewedAt: new Date(),
              reviewedByUserId: actor.id,
              reviewedByName: reviewerName,
              // Kept on approval too, so a note approved on the second
              // attempt still shows what was asked for the first time.
              reviewComment: dto.comment?.trim() ?? note.reviewComment,
            }
          : {}),
      },
    });
  }

  async remove(id: string, actor: AuthenticatedUser) {
    if (!actor.roles.includes("SCHOOL_ADMIN")) {
      throw new ForbiddenException("Only an administrator can withdraw a lesson note");
    }
    const client = await this.tenantPrisma.getClient();
    const note = await client.lessonNote.findFirst({ where: { id, deletedAt: null } });
    if (!note) throw new NotFoundException("No lesson note found with that id");

    await client.lessonNote.update({ where: { id }, data: { deletedAt: new Date() } });
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
