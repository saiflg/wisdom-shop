import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import {
  canWithdraw,
  dayOf,
  describeDuration,
  describeRange,
  noteState,
  rangeProblem,
  reasonLabel,
  reasonProblem,
  registerHint,
} from "./absence-notes";

interface CreateNoteInput {
  studentProfileId: string;
  fromDate: string;
  toDate: string;
  reason: string;
  note?: string | null;
}

@Injectable()
export class AbsenceNotesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private isStaff(viewer: AuthenticatedUser): boolean {
    return viewer.roles.includes("SCHOOL_ADMIN") || viewer.roles.includes("TEACHER");
  }

  /**
   * The children this viewer may write a note about.
   *
   * A guardian's own; staff may write one for any child, because a parent who
   * telephones the office should not have to use the portal as well.
   */
  private async assertMayWriteFor(studentProfileId: string, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();

    const student = await client.studentProfile.findFirst({
      where: {
        id: studentProfileId,
        deletedAt: null,
        // A guardian is scoped to their own children by the query itself
        // rather than by a check afterwards, so there is no path that forgets.
        ...(this.isStaff(viewer) ? {} : { guardianLinks: { some: { guardianUserId: viewer.id } } }),
      },
      select: { id: true },
    });

    // 404 rather than 403 for a guardian: telling somebody "that child exists
    // but is not yours" confirms a child's existence to a stranger.
    if (!student) throw new NotFoundException("No student found with that id");
  }

  async create(input: CreateNoteInput, viewer: AuthenticatedUser) {
    await this.assertMayWriteFor(input.studentProfileId, viewer);

    const now = new Date();
    const fromDate = dayOf(new Date(input.fromDate));
    const toDate = dayOf(new Date(input.toDate));

    const badRange = rangeProblem({ fromDate, toDate }, now);
    if (badRange) throw new BadRequestException(badRange);

    const badReason = reasonProblem(input.reason, input.note);
    if (badReason) throw new BadRequestException(badReason);

    const client = await this.tenantPrisma.getClient();
    const author = await client.user.findUnique({
      where: { id: viewer.id },
      select: { firstName: true, lastName: true },
    });

    const created = await client.absenceNote.create({
      data: {
        studentProfileId: input.studentProfileId,
        fromDate,
        toDate,
        reason: input.reason,
        note: input.note?.trim() || null,
        createdByUserId: viewer.id,
        createdByName: author ? `${author.firstName} ${author.lastName}` : null,
      },
    });

    return this.present(created, viewer);
  }

  /**
   * Notes for one child.
   *
   * Newest first, and withdrawn ones included — a parent who took a note back
   * should be able to see that they did, rather than wonder whether it saved.
   */
  async forStudent(studentProfileId: string, viewer: AuthenticatedUser) {
    await this.assertMayWriteFor(studentProfileId, viewer);

    const client = await this.tenantPrisma.getClient();
    const notes = await client.absenceNote.findMany({
      where: { studentProfileId },
      orderBy: [{ fromDate: "desc" }, { createdAt: "desc" }],
      take: 50,
    });

    return notes.map((note) => this.present(note, viewer));
  }

  /**
   * What the office needs to see: notes nobody has dealt with yet.
   *
   * Ordered by the day they start rather than when they were written, because
   * a note about this morning matters more than one written first about next
   * month.
   */
  async pending(viewer: AuthenticatedUser) {
    if (!this.isStaff(viewer)) throw new ForbiddenException("Staff only");

    const client = await this.tenantPrisma.getClient();
    const notes = await client.absenceNote.findMany({
      where: { withdrawnAt: null, acknowledgedAt: null, studentProfile: { deletedAt: null } },
      include: { studentProfile: { select: { user: { select: { firstName: true, lastName: true } } } } },
      orderBy: { fromDate: "asc" },
      take: 100,
    });

    return notes.map((note) => ({
      ...this.present(note, viewer),
      studentName: `${note.studentProfile.user.firstName} ${note.studentProfile.user.lastName}`,
    }));
  }

  /**
   * Notes covering a given day, for the people taking that day's register.
   *
   * Returns the hint, never the free text: a teacher needs to know an absence
   * is explained and roughly why, and the sentence a parent wrote about their
   * child's stomach is not for a screen in front of a classroom.
   */
  async forRegister(studentProfileIds: string[], date: Date, viewer: AuthenticatedUser) {
    if (!this.isStaff(viewer)) throw new ForbiddenException("Staff only");
    if (studentProfileIds.length === 0) return {};

    const day = dayOf(date);
    const client = await this.tenantPrisma.getClient();

    const notes = await client.absenceNote.findMany({
      where: {
        studentProfileId: { in: studentProfileIds },
        withdrawnAt: null,
        fromDate: { lte: day },
        toDate: { gte: day },
      },
      select: { id: true, studentProfileId: true, reason: true, acknowledgedAt: true },
    });

    const byStudent: Record<string, { id: string; hint: string; acknowledged: boolean }> = {};
    for (const note of notes) {
      byStudent[note.studentProfileId] = {
        id: note.id,
        hint: registerHint(note),
        acknowledged: Boolean(note.acknowledgedAt),
      };
    }
    return byStudent;
  }

  async withdraw(id: string, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const note = await client.absenceNote.findUnique({ where: { id } });
    if (!note) throw new NotFoundException("No absence note found with that id");

    // Only the person who wrote it. Staff have acknowledge; a member of staff
    // quietly withdrawing a parent's note would erase the evidence that the
    // family told the school.
    if (note.createdByUserId !== viewer.id) {
      throw new ForbiddenException("Only the person who sent this note can take it back");
    }

    if (!canWithdraw(note)) {
      throw new BadRequestException(
        note.withdrawnAt
          ? "You have already taken this note back."
          : "The school has already seen this note. Please contact the office.",
      );
    }

    // Withdrawn, not deleted: the school may have acted on it in the hours
    // before it was taken back, and a row that vanishes cannot explain that.
    const updated = await client.absenceNote.update({
      where: { id },
      data: { withdrawnAt: new Date() },
    });

    return this.present(updated, viewer);
  }

  async acknowledge(id: string, viewer: AuthenticatedUser) {
    if (!this.isStaff(viewer)) throw new ForbiddenException("Staff only");

    const client = await this.tenantPrisma.getClient();
    const note = await client.absenceNote.findUnique({ where: { id } });
    if (!note) throw new NotFoundException("No absence note found with that id");
    if (note.withdrawnAt) throw new BadRequestException("That note was taken back by the parent");

    const staff = await client.user.findUnique({
      where: { id: viewer.id },
      select: { firstName: true, lastName: true },
    });

    // Idempotent: two people in the office opening it at once should not
    // rewrite who dealt with it.
    if (note.acknowledgedAt) return this.present(note, viewer);

    const updated = await client.absenceNote.update({
      where: { id },
      data: {
        acknowledgedAt: new Date(),
        acknowledgedByUserId: viewer.id,
        acknowledgedByName: staff ? `${staff.firstName} ${staff.lastName}` : null,
      },
    });

    return this.present(updated, viewer);
  }

  /**
   * Built by hand rather than spread.
   *
   * The free-text note is health information about a named minor, and a
   * spread is how it reaches somebody it should not the first time a field is
   * added. Staff and the author see it; nobody else ever does.
   */
  private present(
    note: {
      id: string;
      studentProfileId: string;
      fromDate: Date;
      toDate: Date;
      reason: string;
      note: string | null;
      createdByUserId: string;
      createdByName: string | null;
      withdrawnAt: Date | null;
      acknowledgedAt: Date | null;
      acknowledgedByName?: string | null;
      createdAt: Date;
    },
    viewer: AuthenticatedUser,
  ) {
    const mayReadDetail = this.isStaff(viewer) || note.createdByUserId === viewer.id;

    return {
      id: note.id,
      studentProfileId: note.studentProfileId,
      fromDate: note.fromDate,
      toDate: note.toDate,
      dates: describeRange(note),
      duration: describeDuration(note),
      reason: note.reason,
      reasonLabel: reasonLabel(note.reason),
      note: mayReadDetail ? note.note : null,
      state: noteState(note),
      canWithdraw: canWithdraw(note) && note.createdByUserId === viewer.id,
      sentByName: note.createdByName,
      acknowledgedByName: note.acknowledgedByName ?? null,
      acknowledgedAt: note.acknowledgedAt,
      createdAt: note.createdAt,
    };
  }
}
