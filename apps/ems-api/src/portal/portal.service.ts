import { Injectable, NotFoundException } from "@nestjs/common";
import type { RoleName } from "ems-tenant-client";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { AttendanceService } from "@/attendance/attendance.service";
import { FeesService } from "@/fees/fees.service";
import { HomeworkService } from "@/homework/homework.service";
import { TimetableService } from "@/timetable/timetable.service";
import { AiTeacherService } from "@/ai-teacher/ai-teacher.service";
import { GradingService } from "@/grading/grading.service";
import { ExamsService } from "@/exams/exams.service";
import { bucketByDue, weekdayOf } from "./portal-dates";

const STAFF_ROLES: RoleName[] = ["SCHOOL_ADMIN", "TEACHER"];

function isStaff(viewer: AuthenticatedUser): boolean {
  return viewer.roles.some((role) => STAFF_ROLES.includes(role));
}

export interface PortalChild {
  studentProfileId: string;
  /** The login behind the profile — what the photo route is keyed on. */
  userId: string;
  name: string;
  studentCode: string | null;
  className: string | null;
  classId: string | null;
}

/**
 * One request for everything a student or a family needs to see.
 *
 * Assembled server-side rather than left to the page, because a portal home
 * that fires six requests is slow on the phone most families will open it on,
 * and because six separate calls each get their scoping right independently
 * — this way there is one place to be careful about.
 *
 * That care is *composition*, not reimplementation: every figure here comes
 * from the service that already owns it, called with the viewer, so each one
 * re-checks. If this service resolved the wrong child, `attendance.forStudent`
 * would still refuse. Defence in depth, and the e2e proves it by asking for
 * another family's child directly.
 */
@Injectable()
export class PortalService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly attendance: AttendanceService,
    private readonly fees: FeesService,
    private readonly homework: HomeworkService,
    private readonly timetable: TimetableService,
    private readonly aiTeacher: AiTeacherService,
    private readonly grading: GradingService,
    private readonly exams: ExamsService,
  ) {}

  /** The students this viewer may look at: themselves, or their children. */
  async children(viewer: AuthenticatedUser): Promise<PortalChild[]> {
    const client = await this.tenantPrisma.getClient();

    const where = viewer.roles.includes("GUARDIAN")
      ? { guardianLinks: { some: { guardianUserId: viewer.id } } }
      : { userId: viewer.id };

    const profiles = await client.studentProfile.findMany({
      where: { ...where, deletedAt: null },
      include: {
        user: { select: { firstName: true, lastName: true } },
        enrollments: { where: { status: "ACTIVE" }, include: { class: true }, take: 1 },
      },
      orderBy: { createdAt: "asc" },
    });

    return profiles.map((profile) => {
      const enrolment = profile.enrollments[0];
      return {
        studentProfileId: profile.id,
        userId: profile.userId,
        name: `${profile.user.firstName} ${profile.user.lastName}`,
        studentCode: profile.studentCode,
        className: (enrolment?.class as { name?: string } | undefined)?.name ?? null,
        classId: enrolment?.classId ?? null,
      };
    });
  }

  async home(viewer: AuthenticatedUser, studentProfileId?: string) {
    const family = await this.children(viewer);

    // Staff have the whole ERP; a portal home for them would be a worse
    // version of the dashboard they already land on.
    if (family.length === 0) {
      return { isStaff: isStaff(viewer), children: [], child: null, today: [], homework: null };
    }

    const child = studentProfileId
      ? family.find((candidate) => candidate.studentProfileId === studentProfileId)
      : family[0];

    // 404 rather than silently falling back to their own child: a guardian
    // who asked for someone else should be told no, not handed a page that
    // looks like it worked.
    if (!child) throw new NotFoundException("No student found with that id");

    const now = new Date();

    // Each of these already returns its own summary; recomputing them here
    // would be a second definition of "attendance rate" free to drift from
    // the one the attendance page shows.
    const [attendance, fees, allHomework, lessons, results, exams] = await Promise.all([
      this.attendance.forStudent(child.studentProfileId, viewer).catch(() => null),
      this.fees.listInvoices(viewer, child.studentProfileId).catch(() => null),
      this.homework.list(viewer).catch(() => []),
      this.aiTeacher.list(viewer).catch(() => []),
      this.grading.resultsForStudent(child.studentProfileId, viewer).catch(() => []),
      // A module a school has not bought throws here rather than returning
      // nothing, so every one of these swallows its own failure — the portal
      // showing four sections instead of six is right, a portal that fails
      // entirely because one module is off is not.
      this.exams.listExams(viewer, child.classId ?? undefined).catch(() => []),
    ]);

    const today = child.classId
      ? await this.todaysLessons(child.classId, viewer, now).catch(() => [])
      : [];

    // Only this child's work, and only from their own class.
    const theirs = (allHomework as HomeworkRow[]).filter(
      (assignment) => assignment.classId === child.classId,
    );

    return {
      isStaff: isStaff(viewer),
      children: family,
      child,
      today,
      homework: this.summariseHomework(theirs, now),
      attendance: (attendance as AttendanceResult | null)?.summary ?? null,
      fees: (fees as FeesResult | null)?.summary ?? null,
      lessons: (lessons as LessonRow[]).slice(0, 5).map((lesson) => ({
        id: lesson.id,
        // The scheme's lesson when it differs from what the student typed —
        // a parent reading "adverb, vowels, noun" for three lessons that all
        // taught parts of speech has been told something untrue about their
        // own child's tutoring.
        topic: lesson.displayTitle ?? lesson.topic,
        askedAbout: lesson.followsScheme ? lesson.topic : null,
        subject: lesson.subject?.name ?? null,
        status: lesson.status,
        percent: lesson.percent ?? 0,
      })),
      // The formal record, distinct from the "recently marked" list above:
      // one is a running total the school is still working on, the other is
      // what it has decided and stands behind.
      results: (results as TermResultRow[]).map((result) => ({
        id: result.id,
        academicYear: result.academicYear,
        term: result.term,
        className: result.class?.name ?? null,
        overallPercent: result.overallPercentHundredths,
        grade: result.overallGrade ?? null,
        subjectCount: result.subjects?.length ?? 0,
      })),
      exams: this.summariseExams(exams as ExamRow[], now),
    };
  }

  /**
   * The papers this student can actually do something about.
   *
   * Sitting one is time-critical in a way nothing else on this page is, so
   * the portal says which are open now and which are coming — and stops
   * mentioning a paper once it has been sat, because "you have an exam" for
   * something already submitted is alarming for no reason.
   */
  private summariseExams(exams: ExamRow[], now: Date) {
    const iso = (value: Date | string | null | undefined) =>
      value ? new Date(value).toISOString() : null;

    return exams
      .filter((exam) => exam.status === "PUBLISHED" && !exam.attempt?.submittedAt)
      .map((exam) => {
        const opensAt = iso(exam.opensAt);
        const closesAt = iso(exam.closesAt);
        return {
          id: exam.id,
          title: exam.title,
          subject: exam.subject?.name ?? null,
          opensAt,
          closesAt,
          open:
            (!opensAt || new Date(opensAt) <= now) && (!closesAt || new Date(closesAt) > now),
          started: Boolean(exam.attempt),
        };
      })
      .sort((a, b) => (a.closesAt ?? "￿").localeCompare(b.closesAt ?? "￿"))
      .slice(0, 5);
  }

  private async todaysLessons(classId: string, viewer: AuthenticatedUser, now: Date) {
    const entries = (await this.timetable.classTimetable(classId, viewer)) as TimetableRow[];
    const today = weekdayOf(now);

    return entries
      .filter((entry) => entry.weekday === today)
      .sort((a, b) => (a.period?.startMinute ?? 0) - (b.period?.startMinute ?? 0))
      .map((entry) => ({
        period: entry.period?.label ?? "",
        startMinute: entry.period?.startMinute ?? 0,
        subject: entry.subject?.name ?? "",
        teacher: entry.teacher ? `${entry.teacher.firstName} ${entry.teacher.lastName}` : null,
      }));
  }

  private summariseHomework(assignments: HomeworkRow[], now: Date) {
    // Only work still open to them; closed work is history, not a to-do.
    const outstanding = assignments.filter(
      (assignment) =>
        assignment.status === "SET" &&
        !(assignment.submissions ?? []).some((submission) => submission.status !== undefined),
    );

    const buckets = bucketByDue(
      outstanding.map((assignment) => ({
        ...assignment,
        dueAt: assignment.dueAt ? new Date(assignment.dueAt) : null,
      })),
      now,
    );

    const marked = assignments
      .flatMap((assignment) =>
        (assignment.submissions ?? [])
          // Released only. An unreleased mark is absent from the response
          // entirely — see HomeworkService.presentForStudent — so this is
          // belt and braces rather than the only guard.
          .filter((submission) => submission.status === "RELEASED")
          .map((submission) => ({
            assignmentId: assignment.id,
            title: assignment.title,
            subject: assignment.subject?.name ?? null,
            scoreHundredths: submission.scoreHundredths ?? null,
            maxScoreHundredths: assignment.maxScoreHundredths,
            feedback: submission.feedback ?? null,
          })),
      )
      .slice(0, 5);

    return {
      overdue: buckets.overdue.map(brief),
      today: buckets.today.map(brief),
      upcoming: buckets.upcoming.slice(0, 5).map(brief),
      noDeadline: buckets.noDeadline.map(brief),
      recentlyMarked: marked,
    };
  }

}

function brief(assignment: HomeworkRow & { dueAt: Date | null }) {
  return {
    id: assignment.id,
    title: assignment.title,
    subject: assignment.subject?.name ?? null,
    dueAt: assignment.dueAt,
  };
}

interface TermResultRow {
  id: string;
  academicYear: string;
  term: string;
  overallPercentHundredths: number;
  overallGrade?: string | null;
  class?: { name: string } | null;
  subjects?: unknown[];
}

interface ExamRow {
  id: string;
  title: string;
  status: string;
  opensAt?: Date | string | null;
  closesAt?: Date | string | null;
  subject?: { name: string } | null;
  /** Present only on the student-facing shape — see presentAttemptForStudent. */
  attempt?: { submittedAt?: Date | string | null } | null;
}

interface HomeworkRow {
  id: string;
  classId: string;
  title: string;
  status: string;
  dueAt: string | Date | null;
  maxScoreHundredths: number;
  subject?: { name: string };
  submissions?: Array<{ status?: string; scoreHundredths?: number | null; feedback?: string | null }>;
}

/** `{ records, summary }` — the shape AttendanceService.forStudent returns. */
interface AttendanceResult {
  summary: { total: number; presentRate: number | null; counts: Record<string, number> };
}

/** `{ invoices, summary }` — the shape FeesService.listInvoices returns. */
interface FeesResult {
  summary: { invoiced: number; collected: number; outstanding: number; invoiceCount: number };
}

interface LessonRow {
  id: string;
  topic: string;
  displayTitle?: string;
  followsScheme?: boolean;
  status: string;
  percent?: number;
  subject?: { name: string };
}

interface TimetableRow {
  weekday: string;
  period?: { label: string; startMinute: number };
  subject?: { name: string };
  teacher?: { firstName: string; lastName: string };
}
