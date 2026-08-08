import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { RoleName, Weekday } from "ems-tenant-client";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { findClashes, validatePeriodStructure, type EntryInput } from "./timetable-rules";
import { derivePeriods, validateDayShape } from "./derive-periods";
import { findGenerationClashes, generateTimetable, type Slot } from "./generate-timetable";
import type {
  GenerateTimetableDto,
  ReplacePeriodsDto,
  TimetableSettingsDto,
  UpsertAssignmentDto,
  UpsertEntryDto,
} from "./dto/timetable.dto";

const WEEK: Weekday[] = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];

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

  // ----------------------------------------------------------------- settings

  async getSettings() {
    const client = await this.tenantPrisma.getClient();
    const settings = await client.timetableSettings.findFirst();
    // Seeded at provisioning and by migration, but a school restored from an
    // older backup should still get a usable day rather than an error.
    return settings ?? client.timetableSettings.create({ data: {} });
  }

  /**
   * Saves the shape of the school day, optionally rebuilding the periods.
   *
   * Rebuilding clears the week, because the periods the lessons were
   * scheduled against no longer exist. That is destructive enough to be
   * opt-in rather than a side effect of adjusting a start time.
   */
  async updateSettings(dto: TimetableSettingsDto) {
    const client = await this.tenantPrisma.getClient();

    const problem = validateDayShape(dto);
    if (problem) throw new BadRequestException(problem);

    const existing = await this.getSettings();
    const settings = await client.timetableSettings.update({
      where: { id: existing.id },
      data: {
        dayStartMinute: dto.dayStartMinute,
        dayEndMinute: dto.dayEndMinute,
        periodsPerDay: dto.periodsPerDay,
        breakAfterPeriod: dto.breakAfterPeriod ?? null,
        breakLengthMinutes: dto.breakLengthMinutes ?? 30,
      },
    });

    const derived = derivePeriods(dto);

    if (!dto.applyToPeriods) {
      // A preview, so a school can see what 8 periods between 08:00 and
      // 14:00 actually looks like before losing a week's work.
      return { settings, preview: derived, applied: false };
    }

    await client.$transaction(async (tx) => {
      await tx.timetableEntry.deleteMany({});
      await tx.timetablePeriod.updateMany({ where: { deletedAt: null }, data: { deletedAt: new Date() } });
      for (const period of derived.periods) {
        await tx.timetablePeriod.create({ data: period });
      }
    });

    return { settings, preview: derived, applied: true };
  }

  // -------------------------------------------------------------- assignments

  async listAssignments() {
    const client = await this.tenantPrisma.getClient();
    return client.teachingAssignment.findMany({
      include: {
        class: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true } },
        teacher: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ class: { name: "asc" } }, { subject: { name: "asc" } }],
    });
  }

  async upsertAssignment(dto: UpsertAssignmentDto) {
    const client = await this.tenantPrisma.getClient();

    const [klass, subject] = await Promise.all([
      client.class.findFirst({ where: { id: dto.classId, deletedAt: null } }),
      client.subject.findFirst({ where: { id: dto.subjectId, deletedAt: null } }),
    ]);
    if (!klass) throw new NotFoundException("No class found with that id");
    if (!subject) throw new NotFoundException("No subject found with that id");

    if (dto.teacherUserId) {
      const teacher = await client.user.findFirst({
        where: { id: dto.teacherUserId, deletedAt: null, roles: { has: "TEACHER" } },
      });
      if (!teacher) throw new NotFoundException("No teacher found with that id");
    }

    const data = {
      teacherUserId: dto.teacherUserId ?? null,
      periodsPerWeek: dto.periodsPerWeek,
    };

    return client.teachingAssignment.upsert({
      where: { classId_subjectId: { classId: dto.classId, subjectId: dto.subjectId } },
      create: { classId: dto.classId, subjectId: dto.subjectId, ...data },
      update: data,
      include: {
        class: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true } },
        teacher: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async deleteAssignment(id: string) {
    const client = await this.tenantPrisma.getClient();
    const assignment = await client.teachingAssignment.findUnique({ where: { id } });
    if (!assignment) throw new NotFoundException("No teaching assignment found with that id");
    await client.teachingAssignment.delete({ where: { id } });
    return { id, deleted: true };
  }

  // --------------------------------------------------------------- generation

  /**
   * Builds a whole week from the teaching assignments.
   *
   * Preview by default. Generating replaces every lesson in the school, so
   * committing is explicit — the same rule as spreadsheet import, and for the
   * same reason: a school that loses a hand-tuned week to a stray click has
   * no way back.
   *
   * The result is checked for clashes before it is written. The placement
   * loop should make that impossible, but a scheduler that silently
   * double-books is worse than one that refuses to save.
   */
  async generate(dto: GenerateTimetableDto) {
    const client = await this.tenantPrisma.getClient();

    const [assignments, periods] = await Promise.all([
      client.teachingAssignment.findMany({
        include: {
          class: { select: { id: true, name: true } },
          subject: { select: { id: true, name: true } },
          teacher: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      client.timetablePeriod.findMany({
        where: { deletedAt: null, isTeaching: true },
        orderBy: { startMinute: "asc" },
      }),
    ]);

    if (assignments.length === 0) {
      throw new BadRequestException(
        "Nothing to schedule yet — record which subjects each class takes, and how many periods a week",
      );
    }

    const slots: Slot[] = [];
    for (const weekday of WEEK) {
      for (const period of periods) slots.push({ weekday, periodId: period.id });
    }

    const result = generateTimetable(
      assignments.map((assignment) => ({
        id: assignment.id,
        classId: assignment.classId,
        subjectId: assignment.subjectId,
        teacherUserId: assignment.teacherUserId,
        periodsPerWeek: assignment.periodsPerWeek,
      })),
      slots,
    );

    const clashes = findGenerationClashes(result.placed);
    if (clashes.length > 0) {
      // Should be unreachable. If it ever fires, refusing to write is the
      // only safe answer.
      throw new ConflictException(`The generated week double-books someone: ${clashes[0]}`);
    }

    const named = (id: string) => assignments.find((assignment) => assignment.id === id);
    const summary = {
      placed: result.placed.length,
      unplaced: result.unplaced.map((item) => ({
        ...item,
        className: named(item.assignmentId)?.class.name ?? "",
        subjectName: named(item.assignmentId)?.subject.name ?? "",
      })),
      committed: false,
    };

    if (!dto.commit) return summary;

    await client.$transaction(async (tx) => {
      await tx.timetableEntry.deleteMany({});
      for (const lesson of result.placed) {
        await tx.timetableEntry.create({
          data: {
            classId: lesson.classId,
            subjectId: lesson.subjectId,
            teacherUserId: lesson.teacherUserId,
            weekday: lesson.weekday,
            periodId: lesson.periodId,
          },
        });
      }
    });

    return { ...summary, committed: true };
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

  /**
   * A teacher's own week — what they need to know whether they have a class.
   *
   * Staff only: this is a staffing view, not a family one. Within a school a
   * teacher may see a colleague's week, which is how cover gets arranged.
   */
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
