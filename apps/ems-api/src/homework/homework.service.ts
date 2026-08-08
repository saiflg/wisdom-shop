import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { RoleName } from "ems-tenant-client";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import {
  canMark,
  canSubmit,
  isMarkVisibleToStudent,
  summariseProgress,
  type SubmissionStatus,
} from "./submission-rules";
import type {
  CreateAssignmentDto,
  MarkSubmissionDto,
  SubmitWorkDto,
  UpdateAssignmentDto,
} from "./dto/homework.dto";

const STAFF_ROLES: RoleName[] = ["SCHOOL_ADMIN", "TEACHER"];

function isStaff(viewer: AuthenticatedUser): boolean {
  return viewer.roles.some((role) => STAFF_ROLES.includes(role));
}

@Injectable()
export class HomeworkService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  // ── Setting work ───────────────────────────────────────────────────────

  async create(dto: CreateAssignmentDto, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();

    const klass = await client.class.findFirst({ where: { id: dto.classId, deletedAt: null } });
    if (!klass) throw new NotFoundException("No class found with that id");

    const subject = await client.subject.findFirst({ where: { id: dto.subjectId, deletedAt: null } });
    if (!subject) throw new NotFoundException("No subject found with that id");

    if (dto.assessmentId) {
      const assessment = await client.assessment.findFirst({
        where: { id: dto.assessmentId, deletedAt: null },
      });
      if (!assessment) throw new NotFoundException("No assessment found with that id");
      // Otherwise a released mark would be written to a different class's
      // gradebook, which nobody would notice until reports came out.
      if (assessment.classId !== dto.classId || assessment.subjectId !== dto.subjectId) {
        throw new BadRequestException(
          "That assessment belongs to a different class or subject, so a mark could not count towards it",
        );
      }
    }

    return client.assignment.create({
      data: {
        classId: dto.classId,
        subjectId: dto.subjectId,
        title: dto.title.trim(),
        instructions: dto.instructions.trim(),
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        maxScoreHundredths: dto.maxScoreHundredths ?? 10_000,
        assessmentId: dto.assessmentId ?? null,
        setByUserId: viewer.id,
      },
      include: { class: true, subject: true },
    });
  }

  async update(id: string, dto: UpdateAssignmentDto) {
    const client = await this.tenantPrisma.getClient();
    const existing = await client.assignment.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException("No assignment found with that id");

    return client.assignment.update({
      where: { id },
      data: {
        ...(dto.title === undefined ? {} : { title: dto.title.trim() }),
        ...(dto.instructions === undefined ? {} : { instructions: dto.instructions.trim() }),
        ...(dto.dueAt === undefined ? {} : { dueAt: dto.dueAt ? new Date(dto.dueAt) : null }),
        ...(dto.status === undefined ? {} : { status: dto.status }),
        ...(dto.maxScoreHundredths === undefined ? {} : { maxScoreHundredths: dto.maxScoreHundredths }),
      },
      include: { class: true, subject: true },
    });
  }

  // ── Reading ────────────────────────────────────────────────────────────

  /**
   * The work a viewer can see.
   *
   * Students and guardians never see a DRAFT: an unfinished assignment is the
   * teacher's working copy, and a half-written instruction shown to a class
   * generates thirty questions.
   */
  async list(viewer: AuthenticatedUser, classId?: string) {
    const client = await this.tenantPrisma.getClient();
    const staff = isStaff(viewer);

    const assignments = await client.assignment.findMany({
      where: {
        deletedAt: null,
        ...(classId ? { classId } : {}),
        ...(staff ? {} : { status: { in: ["SET", "CLOSED"] as const }, classId: { in: await this.visibleClassIds(viewer) } }),
      },
      include: {
        class: true,
        subject: true,
        _count: { select: { submissions: true } },
      },
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
    });

    if (staff) return assignments;

    // For a student or guardian, the useful fact is "have we handed this in",
    // not how many of the class have.
    const profileIds = await this.visibleStudentProfileIds(viewer);
    const submissions = await client.submission.findMany({
      where: {
        assignmentId: { in: assignments.map((a) => a.id) },
        studentProfileId: { in: [...profileIds] },
      },
    });

    return assignments.map(({ _count, ...assignment }) => {
      void _count;
      const mine = submissions.filter((s) => s.assignmentId === assignment.id);
      return {
        ...assignment,
        submissions: mine.map((submission) => this.presentForStudent(submission)),
      };
    });
  }

  async findOne(id: string, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();

    const assignment = await client.assignment.findFirst({
      where: { id, deletedAt: null },
      include: { class: true, subject: true, assessment: true },
    });
    if (!assignment) throw new NotFoundException("No assignment found with that id");

    if (isStaff(viewer)) {
      const submissions = await client.submission.findMany({
        where: { assignmentId: id },
        include: { studentProfile: { include: { user: true } } },
        orderBy: { submittedAt: "asc" },
      });

      const expected = await client.enrollment.count({
        where: { classId: assignment.classId, status: "ACTIVE" },
      });

      return { ...assignment, submissions, progress: summariseProgress(expected, submissions) };
    }

    // 404 rather than 403: which assignments exist for other classes is not
    // this family's business.
    const visibleClasses = await this.visibleClassIds(viewer);
    if (assignment.status === "DRAFT" || !visibleClasses.includes(assignment.classId)) {
      throw new NotFoundException("No assignment found with that id");
    }

    const profileIds = await this.visibleStudentProfileIds(viewer);
    const submissions = await client.submission.findMany({
      where: { assignmentId: id, studentProfileId: { in: [...profileIds] } },
    });

    return { ...assignment, submissions: submissions.map((s) => this.presentForStudent(s)) };
  }

  // ── Handing in ─────────────────────────────────────────────────────────

  /**
   * A student hands in their own work, and nobody else's.
   *
   * The student profile is resolved from the token rather than taken from the
   * request, so there is no parameter to tamper with — a guardian or another
   * student has nothing to point at someone else's record.
   */
  async submit(assignmentId: string, dto: SubmitWorkDto, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();

    const profile = await client.studentProfile.findUnique({
      where: { userId: viewer.id },
      select: { id: true },
    });
    if (!profile) throw new ForbiddenException("Only a student can hand work in");

    const assignment = await client.assignment.findFirst({
      where: { id: assignmentId, deletedAt: null },
    });
    if (!assignment) throw new NotFoundException("No assignment found with that id");

    const enrolled = await client.enrollment.findFirst({
      where: { classId: assignment.classId, studentProfileId: profile.id, status: "ACTIVE" },
    });
    if (!enrolled || assignment.status === "DRAFT") {
      throw new NotFoundException("No assignment found with that id");
    }

    const existing = await client.submission.findFirst({
      where: { assignmentId, studentProfileId: profile.id },
    });

    const decision = canSubmit(
      { status: assignment.status, dueAt: assignment.dueAt },
      existing ? { status: existing.status as SubmissionStatus } : null,
      new Date(),
    );
    if (!decision.allowed) throw new ForbiddenException(decision.reason);

    const data = {
      content: dto.content.trim(),
      // Decided now and stored. A due date moved afterwards must not
      // retroactively make a student late for work handed in on time.
      isLate: decision.isLate,
      submittedAt: new Date(),
      status: "SUBMITTED" as const,
    };

    const submission = existing
      ? await client.submission.update({ where: { id: existing.id }, data })
      : await client.submission.create({
          data: { assignmentId, studentProfileId: profile.id, ...data },
        });

    return this.presentForStudent(submission);
  }

  // ── Marking ────────────────────────────────────────────────────────────

  async mark(submissionId: string, dto: MarkSubmissionDto, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();

    const submission = await client.submission.findFirst({
      where: { id: submissionId },
      include: { assignment: true },
    });
    if (!submission) throw new NotFoundException("No submission found with that id");

    const score = dto.scoreHundredths ?? null;
    const decision = canMark(score, submission.assignment.maxScoreHundredths);
    if (!decision.allowed) throw new BadRequestException(decision.reason);

    const actor = await client.user.findUnique({
      where: { id: viewer.id },
      select: { firstName: true, lastName: true },
    });

    const release = dto.release ?? false;
    const updated = await client.submission.update({
      where: { id: submissionId },
      data: {
        scoreHundredths: score,
        feedback: dto.feedback?.trim() || null,
        status: release ? "RELEASED" : "MARKED",
        markedAt: new Date(),
        markedByUserId: viewer.id,
        markedByName: actor ? `${actor.firstName} ${actor.lastName}` : viewer.id,
        ...(release ? { releasedAt: new Date() } : {}),
      },
    });

    if (release) await this.writeThroughToGradebook(updated.id);
    return updated;
  }

  /** Releases every marked submission for one assignment at once. */
  async release(assignmentId: string) {
    const client = await this.tenantPrisma.getClient();

    const assignment = await client.assignment.findFirst({ where: { id: assignmentId, deletedAt: null } });
    if (!assignment) throw new NotFoundException("No assignment found with that id");

    const marked = await client.submission.findMany({
      where: { assignmentId, status: "MARKED" },
      select: { id: true },
    });

    await client.submission.updateMany({
      where: { assignmentId, status: "MARKED" },
      data: { status: "RELEASED", releasedAt: new Date() },
    });

    for (const submission of marked) await this.writeThroughToGradebook(submission.id);
    return { released: marked.length };
  }

  /**
   * Copies a released mark into the linked assessment.
   *
   * So homework reaches the report card instead of being re-typed into a
   * second gradebook. Only for assignments that were deliberately linked —
   * most homework is formative and counts towards nothing.
   */
  private async writeThroughToGradebook(submissionId: string) {
    const client = await this.tenantPrisma.getClient();

    const submission = await client.submission.findFirst({
      where: { id: submissionId },
      include: { assignment: true },
    });
    if (!submission?.assignment.assessmentId || submission.scoreHundredths === null) return;

    const assessment = await client.assessment.findFirst({
      where: { id: submission.assignment.assessmentId, deletedAt: null },
    });
    if (!assessment) return;

    // The assignment and the assessment can be out of different totals, so
    // the mark is scaled rather than copied — 8/10 on the homework is 16/20
    // in a gradebook out of 20, not 8.
    const scaled = Math.round(
      (submission.scoreHundredths / submission.assignment.maxScoreHundredths) *
        assessment.maxScoreHundredths,
    );

    await client.mark.upsert({
      where: {
        assessmentId_studentProfileId: {
          assessmentId: assessment.id,
          studentProfileId: submission.studentProfileId,
        },
      },
      create: {
        assessmentId: assessment.id,
        studentProfileId: submission.studentProfileId,
        scoreHundredths: scaled,
        status: "RECORDED",
      },
      update: { scoreHundredths: scaled, status: "RECORDED" },
    });
  }

  // ── Scoping ────────────────────────────────────────────────────────────

  /** Hides an unreleased mark from the student it is about. */
  private presentForStudent(submission: Record<string, unknown>) {
    if (isMarkVisibleToStudent(submission.status as SubmissionStatus)) return submission;

    // Removed rather than nulled: a null score with a MARKED status still
    // tells a student their work has been marked, which is the thing being
    // withheld.
    const { scoreHundredths, feedback, markedByName, markedAt, ...rest } = submission;
    void scoreHundredths;
    void feedback;
    void markedByName;
    void markedAt;
    return rest;
  }

  private async visibleClassIds(viewer: AuthenticatedUser): Promise<string[]> {
    const client = await this.tenantPrisma.getClient();
    const profileIds = await this.visibleStudentProfileIds(viewer);
    if (profileIds.size === 0) return [];

    const enrollments = await client.enrollment.findMany({
      where: { studentProfileId: { in: [...profileIds] }, status: "ACTIVE" },
      select: { classId: true },
    });
    return [...new Set(enrollments.map((e) => e.classId))];
  }

  /** Student profiles this non-staff viewer may see — their own, or their children's. */
  private async visibleStudentProfileIds(viewer: AuthenticatedUser): Promise<Set<string>> {
    const client = await this.tenantPrisma.getClient();

    if (viewer.roles.includes("GUARDIAN")) {
      const links = await client.guardianLink.findMany({
        where: { guardianUserId: viewer.id },
        select: { studentProfileId: true },
      });
      return new Set(links.map((link) => link.studentProfileId));
    }

    const own = await client.studentProfile.findUnique({
      where: { userId: viewer.id },
      select: { id: true },
    });
    return new Set(own ? [own.id] : []);
  }
}
