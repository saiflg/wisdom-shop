import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { RoleName } from "ems-tenant-client";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { findClashes, validatePeriodStructure, type EntryInput } from "./timetable-rules";
import type { ReplacePeriodsDto, UpsertEntryDto } from "./dto/timetable.dto";

const STAFF_ROLES: RoleName[] = ["SCHOOL_ADMIN", "TEACHER"];
const UNIQUE_VIOLATION = "P2002";

function isStaff(viewer: AuthenticatedUser): boolean {
  return viewer.roles.some((role) => STAFF_ROLES.includes(role));
}

@Injectable()
export class TimetableService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  // ------------------------------------------------------------------ periods

  async listPeriods() {
    const client = await this.tenantPrisma.getClient();
    return client.timetablePeriod.findMany({
      where: { deletedAt: null },
      orderBy: { startMinute: "asc" },
    });
  }

  /**
   * Replaces the school's period structure in one call.
   *
   * Whole-day rather than per-period because the rule being enforced — no two
   * periods overlap — is a property of the set, not of any one row. Editing
   * them one at a time would mean either rejecting a legitimate intermediate
   * state or letting the day be briefly incoherent.
   *
   * Periods supplied with an id are kept, so the lessons already scheduled
   * against them survive; only genuinely removed periods take their lessons
   * with them.
   */
  async replacePeriods(dto: ReplacePeriodsDto) {
    const client = await this.tenantPrisma.getClient();

    const problem = validatePeriodStructure(dto.periods);
    if (problem) throw new BadRequestException(problem);

    const keptIds = dto.periods.map((period) => period.id).filter((id): id is string => Boolean(id));

    return client.$transaction(async (tx) => {
      const existing = await tx.timetablePeriod.findMany({ where: { deletedAt: null }, select: { id: true } });
      const unknown = keptIds.filter((id) => !existing.some((period) => period.id === id));
      if (unknown.length > 0) throw new NotFoundException("One of those periods no longer exists");

      // Soft-delete rather than hard: a removed period's lessons cascade, and
      // a school that removes a period by accident should be able to see what
      // it had.
      await tx.timetablePeriod.updateMany({
        where: { id: { notIn: keptIds }, deletedAt: null },
        data: { deletedAt: new Date() },
      });

      for (const period of dto.periods) {
        const data = {
          label: period.label.trim(),
          startMinute: period.startMinute,
          endMinute: period.endMinute,
          isTeaching: period.isTeaching ?? true,
        };
        if (period.id) {
          await tx.timetablePeriod.update({ where: { id: period.id }, data });
        } else {
          await tx.timetablePeriod.create({ data });
        }
      }

      return tx.timetablePeriod.findMany({ where: { deletedAt: null }, orderBy: { startMinute: "asc" } });
    });
  }

  // ------------------------------------------------------------------ lessons

  /**
   * Places or moves a lesson, refusing anything that would double-book.
   *
   * Clashes are checked here so the scheduler gets a sentence naming what is
   * in the way, and enforced again by the unique indexes, which is what holds
   * when two people save at the same moment. The P2002 catch below is that
   * race arriving — rare, but the only outcome that must never be a
   * double-booking.
   */
  async upsertEntry(dto: UpsertEntryDto, entryId?: string) {
    const client = await this.tenantPrisma.getClient();

    const [klass, subject, period] = await Promise.all([
      client.class.findFirst({ where: { id: dto.classId, deletedAt: null } }),
      client.subject.findFirst({ where: { id: dto.subjectId, deletedAt: null } }),
      client.timetablePeriod.findFirst({ where: { id: dto.periodId, deletedAt: null } }),
    ]);
    if (!klass) throw new NotFoundException("No class found with that id");
    if (!subject) throw new NotFoundException("No subject found with that id");
    if (!period) throw new NotFoundException("No period found with that id");

    if (!period.isTeaching) {
      throw new BadRequestException(`"${period.label}" is not a teaching period, so no lesson can go in it`);
    }

    if (dto.teacherUserId) {
      const teacher = await client.user.findFirst({
        where: { id: dto.teacherUserId, deletedAt: null, roles: { has: "TEACHER" } },
      });
      if (!teacher) throw new NotFoundException("No teacher found with that id");
    }

    const existing = await client.timetableEntry.findMany({
      where: { weekday: dto.weekday, periodId: dto.periodId },
      include: {
        subject: { select: { name: true } },
        class: { select: { name: true } },
      },
    });

    const proposed: EntryInput = {
      id: entryId,
      classId: dto.classId,
      teacherUserId: dto.teacherUserId ?? null,
      weekday: dto.weekday,
      periodId: dto.periodId,
    };

    const clashes = findClashes(
      proposed,
      existing.map((entry) => ({
        id: entry.id,
        classId: entry.classId,
        teacherUserId: entry.teacherUserId,
        weekday: entry.weekday,
        periodId: entry.periodId,
      })),
      (candidate) => {
        const match = existing.find((entry) => entry.id === candidate.id);
        return match ? `${match.subject.name} with ${match.class.name}` : "another lesson";
      },
    );

    if (clashes.length > 0) {
      throw new ConflictException(clashes.map((clash) => clash.message).join(". "));
    }

    const data = {
      classId: dto.classId,
      subjectId: dto.subjectId,
      teacherUserId: dto.teacherUserId ?? null,
      weekday: dto.weekday,
      periodId: dto.periodId,
      room: dto.room,
    };

    try {
      const entry = entryId
        ? await client.timetableEntry.update({ where: { id: entryId }, data })
        : await client.timetableEntry.create({ data });

      return client.timetableEntry.findUnique({
        where: { id: entry.id },
        include: {
          subject: { select: { id: true, name: true } },
          class: { select: { id: true, name: true } },
          period: true,
          teacher: { select: { id: true, firstName: true, lastName: true } },
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
        // Two schedulers saved into the same slot at once. The database is
        // the arbiter, not the check above.
        throw new ConflictException("Someone else just scheduled something in that slot");
      }
      throw error;
    }
  }

  async deleteEntry(id: string) {
    const client = await this.tenantPrisma.getClient();
    const entry = await client.timetableEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException("No lesson found with that id");
    await client.timetableEntry.delete({ where: { id } });
    return { id, deleted: true };
  }

  // -------------------------------------------------------------------- views

  async classTimetable(classId: string, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();

    if (!isStaff(viewer)) {
      // A family sees the timetable of a class their child is actually in,
      // and nothing else. 404 rather than 403 — "that class exists but isn't
      // yours" is itself a disclosure.
      const visible = await this.visibleClassIds(viewer);
      if (!visible.has(classId)) throw new NotFoundException("No timetable found for that class");
    }

    return client.timetableEntry.findMany({
      where: { classId },
      include: {
        subject: { select: { id: true, name: true } },
        period: true,
        teacher: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ weekday: "asc" }, { period: { startMinute: "asc" } }],
    });
  }

  /** A teacher's own week. Staff only — this is a staffing view, not a family one. */
  async teacherTimetable(teacherUserId: string, viewer: AuthenticatedUser) {
    if (!isStaff(viewer)) throw new NotFoundException("No timetable found for that teacher");
    const client = await this.tenantPrisma.getClient();
    return client.timetableEntry.findMany({
      where: { teacherUserId },
      include: {
        subject: { select: { id: true, name: true } },
        class: { select: { id: true, name: true } },
        period: true,
      },
      orderBy: [{ weekday: "asc" }, { period: { startMinute: "asc" } }],
    });
  }

  private async visibleClassIds(viewer: AuthenticatedUser): Promise<Set<string>> {
    const client = await this.tenantPrisma.getClient();

    const studentProfileIds = viewer.roles.includes("GUARDIAN")
      ? (
          await client.guardianLink.findMany({
            where: { guardianUserId: viewer.id },
            select: { studentProfileId: true },
          })
        ).map((link) => link.studentProfileId)
      : await client.studentProfile
          .findUnique({ where: { userId: viewer.id }, select: { id: true } })
          .then((profile) => (profile ? [profile.id] : []));

    if (studentProfileIds.length === 0) return new Set();

    const enrollments = await client.enrollment.findMany({
      where: { studentProfileId: { in: studentProfileIds }, status: "ACTIVE" },
      select: { classId: true },
    });
    return new Set(enrollments.map((enrollment) => enrollment.classId));
  }
}
