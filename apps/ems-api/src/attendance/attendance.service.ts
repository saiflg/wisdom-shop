import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { AttendanceStatus, RoleName } from "ems-tenant-client";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import { MessagingService } from "@/messaging/messaging.service";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { summariseAttendance } from "./attendance-summary";
import type { AmendAttendanceDto, TakeRegisterDto } from "./dto/attendance.dto";

const STAFF_ROLES: RoleName[] = ["SCHOOL_ADMIN", "TEACHER"];

function isStaff(viewer: AuthenticatedUser): boolean {
  return viewer.roles.some((role) => STAFF_ROLES.includes(role));
}

/**
 * Normalises a date to UTC midnight so "the register for 3 August" is one
 * register regardless of what time of day it was taken or what timezone
 * the caller is in. Without this the unique constraint on
 * (classId, date, session) would let the same day be marked twice.
 */
function toDateOnly(iso: string): Date {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) throw new BadRequestException("That date could not be understood");
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

const REGISTER_INCLUDE = {
  class: { select: { id: true, name: true, academicYear: true } },
  takenBy: { select: { id: true, firstName: true, lastName: true } },
  records: {
    include: {
      studentProfile: {
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
      },
      amendments: { orderBy: { createdAt: "desc" as const } },
    },
  },
};

@Injectable()
export class AttendanceService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly messaging: MessagingService,
  ) {}

  /**
   * Takes (or re-takes) a register. Marking is idempotent per student via
   * an upsert, so a teacher who submits twice corrects rather than
   * duplicates — but any change to an *existing* mark goes through
   * `amend`, which demands a reason. Bulk-taking never silently rewrites
   * history: it only fills in marks that aren't there yet.
   */
  async takeRegister(dto: TakeRegisterDto, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const date = toDateOnly(dto.date);

    const klass = await client.class.findFirst({ where: { id: dto.classId, deletedAt: null } });
    if (!klass) throw new NotFoundException("No class found with that id");

    // Only students actually enrolled in this class may be marked in it.
    const enrolled = await client.enrollment.findMany({
      where: { classId: dto.classId, status: "ACTIVE" },
      select: { studentProfileId: true },
    });
    const enrolledIds = new Set(enrolled.map((e) => e.studentProfileId));

    const strangers = dto.marks.filter((mark) => !enrolledIds.has(mark.studentProfileId));
    if (strangers.length > 0) {
      throw new BadRequestException(
        `${strangers.length} student(s) are not actively enrolled in this class and cannot be marked`,
      );
    }

    const register = await client.attendanceRegister.upsert({
      where: { classId_date_session: { classId: dto.classId, date, session: dto.session ?? "" } },
      create: { classId: dto.classId, date, session: dto.session ?? "", takenById: viewer.id },
      update: {},
    });

    for (const mark of dto.marks) {
      const existing = await client.attendanceRecord.findUnique({
        where: { registerId_studentProfileId: { registerId: register.id, studentProfileId: mark.studentProfileId } },
      });
      // Existing marks are left alone — changing one is an amendment and
      // must carry a reason, which this endpoint does not collect.
      if (existing) continue;

      await client.attendanceRecord.create({
        data: {
          registerId: register.id,
          studentProfileId: mark.studentProfileId,
          status: mark.status,
          note: mark.note,
        },
      });

      // Tell the family, once. The dedupe key is the student and the date,
      // so re-saving the register — which teachers do all morning as
      // latecomers arrive — cannot send a second "your child is absent".
      if (mark.status === "ABSENT") {
        await this.messaging.notify({
          event: "ATTENDANCE_ABSENT",
          studentProfileId: mark.studentProfileId,
          dedupeParts: [mark.studentProfileId, dto.date, dto.session ?? ""],
          context: { className: klass.name, date: dto.date },
        });
      }
    }

    return this.getRegister(register.id, viewer);
  }

  async getRegister(id: string, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const register = await client.attendanceRegister.findFirst({ where: { id }, include: REGISTER_INCLUDE });
    if (!register) throw new NotFoundException("No register found with that id");

    if (isStaff(viewer)) return register;

    // A guardian or student may only see their own rows in the register,
    // never the rest of the class.
    const visible = await this.visibleStudentProfileIds(viewer);
    return { ...register, records: register.records.filter((r) => visible.has(r.studentProfileId)) };
  }

  async listForClass(classId: string, viewer: AuthenticatedUser) {
    if (!isStaff(viewer)) {
      throw new NotFoundException("No registers found for that class");
    }
    const client = await this.tenantPrisma.getClient();
    return client.attendanceRegister.findMany({
      where: { classId },
      include: REGISTER_INCLUDE,
      orderBy: [{ date: "desc" }, { session: "asc" }],
    });
  }

  /**
   * A student's own attendance history and summary.
   *
   * The load-bearing check: a guardian asking about a student they aren't
   * linked to gets a 404, not a 403 — telling them "that student exists
   * but isn't yours" would itself leak. Same reasoning as
   * students.service.ts.
   */
  async forStudent(studentProfileId: string, viewer: AuthenticatedUser) {
    if (!isStaff(viewer)) {
      const visible = await this.visibleStudentProfileIds(viewer);
      if (!visible.has(studentProfileId)) throw new NotFoundException("No attendance found for that student");
    }

    const client = await this.tenantPrisma.getClient();
    const records = await client.attendanceRecord.findMany({
      where: { studentProfileId },
      include: {
        register: { include: { class: { select: { id: true, name: true } } } },
        amendments: { orderBy: { createdAt: "desc" } },
      },
      orderBy: { register: { date: "desc" } },
    });

    return { records, summary: summariseAttendance(records.map((r) => r.status)) };
  }

  /**
   * Changes an existing mark, recording who changed it and why. Staff
   * only — and the amendment row is written in the same transaction as the
   * change, so a corrected mark can never exist without its explanation.
   */
  async amend(recordId: string, dto: AmendAttendanceDto, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();

    const record = await client.attendanceRecord.findFirst({ where: { id: recordId } });
    if (!record) throw new NotFoundException("No attendance record found with that id");

    if (record.status === dto.status && dto.note === undefined) {
      throw new ConflictException(`That mark is already ${record.status.toLowerCase()}`);
    }

    const actor = await client.user.findUnique({
      where: { id: viewer.id },
      select: { firstName: true, lastName: true },
    });
    const actorName = actor ? `${actor.firstName} ${actor.lastName}` : viewer.id;

    const [updated] = await client.$transaction([
      client.attendanceRecord.update({
        where: { id: recordId },
        data: { status: dto.status, ...(dto.note === undefined ? {} : { note: dto.note }) },
      }),
      client.attendanceAmendment.create({
        data: {
          recordId,
          fromStatus: record.status,
          toStatus: dto.status as AttendanceStatus,
          reason: dto.reason,
          actorUserId: viewer.id,
          actorName,
        },
      }),
    ]);

    return updated;
  }

  /** Student profiles this non-staff viewer is allowed to see. */
  private async visibleStudentProfileIds(viewer: AuthenticatedUser): Promise<Set<string>> {
    const client = await this.tenantPrisma.getClient();

    if (viewer.roles.includes("GUARDIAN")) {
      const links = await client.guardianLink.findMany({
        where: { guardianUserId: viewer.id },
        select: { studentProfileId: true },
      });
      return new Set(links.map((link) => link.studentProfileId));
    }

    const own = await client.studentProfile.findUnique({ where: { userId: viewer.id }, select: { id: true } });
    return new Set(own ? [own.id] : []);
  }
}
