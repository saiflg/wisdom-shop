import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { RoleName } from "ems-tenant-client";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import {
  computeOverallPercent,
  computeSubjectScore,
  findBand,
  validateBands,
  validateWeights,
  type BandInput,
  type MarkInput,
} from "./grading-math";
import type {
  CreateAssessmentDto,
  PublishResultsDto,
  RecordMarksDto,
  UpsertGradeScaleDto,
} from "./dto/grading.dto";

const STAFF_ROLES: RoleName[] = ["SCHOOL_ADMIN", "TEACHER"];
const UNIQUE_VIOLATION = "P2002";

function isStaff(viewer: AuthenticatedUser): boolean {
  return viewer.roles.some((role) => STAFF_ROLES.includes(role));
}

@Injectable()
export class GradingService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  // ------------------------------------------------------------ grade scales

  async listScales() {
    const client = await this.tenantPrisma.getClient();
    return client.gradeScale.findMany({
      where: { deletedAt: null },
      include: { bands: { orderBy: { minPercent: "desc" } } },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });
  }

  async createScale(dto: UpsertGradeScaleDto) {
    const client = await this.tenantPrisma.getClient();
    this.assertBandsSound(dto.bands);

    return client.$transaction(async (tx) => {
      if (dto.isDefault) await tx.gradeScale.updateMany({ data: { isDefault: false } });
      return tx.gradeScale.create({
        data: {
          name: dto.name,
          isDefault: dto.isDefault ?? false,
          bands: { create: dto.bands },
        },
        include: { bands: { orderBy: { minPercent: "desc" } } },
      });
    });
  }

  /**
   * Replaces a scale's bands.
   *
   * Deliberately allowed even after results have been published: schools do
   * retune their grading. Published report cards are unaffected because
   * every grade label was snapshotted onto SubjectResult at publication —
   * this edit changes what *future* publications compute, nothing already
   * issued.
   */
  async updateScale(id: string, dto: UpsertGradeScaleDto) {
    const client = await this.tenantPrisma.getClient();
    this.assertBandsSound(dto.bands);

    const scale = await client.gradeScale.findFirst({ where: { id, deletedAt: null } });
    if (!scale) throw new NotFoundException("No grade scale found with that id");

    return client.$transaction(async (tx) => {
      if (dto.isDefault) await tx.gradeScale.updateMany({ data: { isDefault: false } });
      await tx.gradeBand.deleteMany({ where: { gradeScaleId: id } });
      return tx.gradeScale.update({
        where: { id },
        data: {
          name: dto.name,
          isDefault: dto.isDefault ?? scale.isDefault,
          bands: { create: dto.bands },
        },
        include: { bands: { orderBy: { minPercent: "desc" } } },
      });
    });
  }

  private assertBandsSound(bands: BandInput[]): void {
    const problem = validateBands(bands);
    if (problem) throw new BadRequestException(problem);
  }

  // ------------------------------------------------------------- assessments

  async createAssessment(dto: CreateAssessmentDto) {
    const client = await this.tenantPrisma.getClient();

    const [subject, klass] = await Promise.all([
      client.subject.findFirst({ where: { id: dto.subjectId, deletedAt: null } }),
      client.class.findFirst({ where: { id: dto.classId, deletedAt: null } }),
    ]);
    if (!subject) throw new NotFoundException("No subject found with that id");
    if (!klass) throw new NotFoundException("No class found with that id");

    try {
      return await client.assessment.create({
        data: {
          subjectId: dto.subjectId,
          classId: dto.classId,
          name: dto.name,
          academicYear: dto.academicYear,
          term: dto.term,
          maxScoreHundredths: dto.maxScoreHundredths,
          weightPercent: dto.weightPercent,
        },
        include: { subject: { select: { id: true, name: true } } },
      });
    } catch (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
        throw new ConflictException("That subject already has an assessment with that name this term");
      }
      throw error;
    }
  }

  async listAssessments(classId: string, academicYear: string, term: string) {
    const client = await this.tenantPrisma.getClient();
    return client.assessment.findMany({
      where: { classId, academicYear, term, deletedAt: null },
      include: {
        subject: { select: { id: true, name: true } },
        marks: {
          include: { studentProfile: { include: { user: { select: { firstName: true, lastName: true } } } } },
        },
      },
      orderBy: [{ subject: { name: "asc" } }, { name: "asc" }],
    });
  }

  async deleteAssessment(id: string) {
    const client = await this.tenantPrisma.getClient();
    const assessment = await client.assessment.findFirst({ where: { id, deletedAt: null } });
    if (!assessment) throw new NotFoundException("No assessment found with that id");
    await client.assessment.update({ where: { id }, data: { deletedAt: new Date() } });
    return { id, deleted: true };
  }

  // -------------------------------------------------------------------- marks

  /**
   * Records or corrects marks for one assessment.
   *
   * Upsert rather than insert: entering a class's marks twice corrects them
   * instead of duplicating, and the unique index guarantees that even when
   * two teachers submit at once. Only students actually enrolled in the
   * class may be marked.
   */
  async recordMarks(assessmentId: string, dto: RecordMarksDto, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();

    const assessment = await client.assessment.findFirst({ where: { id: assessmentId, deletedAt: null } });
    if (!assessment) throw new NotFoundException("No assessment found with that id");

    await this.assertNotPublished(assessment.classId, assessment.academicYear, assessment.term);

    const enrolled = await client.enrollment.findMany({
      where: { classId: assessment.classId, status: "ACTIVE" },
      select: { studentProfileId: true },
    });
    const enrolledIds = new Set(enrolled.map((e) => e.studentProfileId));

    const strangers = dto.marks.filter((mark) => !enrolledIds.has(mark.studentProfileId));
    if (strangers.length > 0) {
      throw new BadRequestException(
        `${strangers.length} student(s) are not actively enrolled in this class and cannot be marked`,
      );
    }

    const overMax = dto.marks.filter(
      (mark) => mark.scoreHundredths !== undefined && mark.scoreHundredths > assessment.maxScoreHundredths,
    );
    if (overMax.length > 0) {
      throw new BadRequestException(
        `${overMax.length} score(s) exceed this assessment's maximum of ${assessment.maxScoreHundredths / 100}`,
      );
    }

    const actor = await client.user.findUnique({
      where: { id: viewer.id },
      select: { firstName: true, lastName: true },
    });
    const recordedByName = actor ? `${actor.firstName} ${actor.lastName}` : viewer.id;

    for (const mark of dto.marks) {
      // A score cannot coexist with a status that means there isn't one.
      const scoreHundredths = mark.status === "RECORDED" ? (mark.scoreHundredths ?? null) : null;
      if (mark.status === "RECORDED" && scoreHundredths === null) {
        throw new BadRequestException("A recorded mark needs a score");
      }

      await client.mark.upsert({
        where: {
          assessmentId_studentProfileId: { assessmentId, studentProfileId: mark.studentProfileId },
        },
        create: {
          assessmentId,
          studentProfileId: mark.studentProfileId,
          scoreHundredths,
          status: mark.status,
          comment: mark.comment,
          recordedByUserId: viewer.id,
          recordedByName,
        },
        update: {
          scoreHundredths,
          status: mark.status,
          comment: mark.comment,
          recordedByUserId: viewer.id,
          recordedByName,
        },
      });
    }

    return this.listAssessments(assessment.classId, assessment.academicYear, assessment.term);
  }

  /** Published results are frozen; marks behind them cannot be edited. */
  private async assertNotPublished(classId: string, academicYear: string, term: string): Promise<void> {
    const client = await this.tenantPrisma.getClient();
    const published = await client.termResult.count({
      where: { classId, academicYear, term, status: "PUBLISHED" },
    });
    if (published > 0) {
      throw new ConflictException(
        "Results for this class and term are already published; unpublish them before changing marks",
      );
    }
  }

  // --------------------------------------------------------------- publishing

  /**
   * Computes and freezes a class's results for a term.
   *
   * Refuses while anything is missing — an incomplete report card is worse
   * than a late one, and it is a document a family keeps. Two guards:
   * every subject's weights must total exactly 100, and every enrolled
   * student must have a mark (or an explicit ABSENT/EXCUSED) for every
   * assessment. A silently absent mark would otherwise be counted as a zero
   * nobody decided on.
   */
  async publish(dto: PublishResultsDto, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();

    const klass = await client.class.findFirst({ where: { id: dto.classId, deletedAt: null } });
    if (!klass) throw new NotFoundException("No class found with that id");

    const scale = dto.gradeScaleId
      ? await client.gradeScale.findFirst({ where: { id: dto.gradeScaleId, deletedAt: null } })
      : await client.gradeScale.findFirst({ where: { isDefault: true, deletedAt: null } });
    if (!scale) throw new BadRequestException("This school has no grade scale to publish against");

    const bands = await client.gradeBand.findMany({ where: { gradeScaleId: scale.id } });
    const bandProblem = validateBands(bands);
    if (bandProblem) throw new BadRequestException(`That grade scale is unusable: ${bandProblem}`);

    const assessments = await client.assessment.findMany({
      where: { classId: dto.classId, academicYear: dto.academicYear, term: dto.term, deletedAt: null },
      include: { marks: true },
    });
    if (assessments.length === 0) {
      throw new BadRequestException("There are no assessments for this class and term");
    }

    // Weights must total 100 per subject, checked before anything is written.
    const bySubject = new Map<string, typeof assessments>();
    for (const assessment of assessments) {
      const list = bySubject.get(assessment.subjectId) ?? [];
      list.push(assessment);
      bySubject.set(assessment.subjectId, list);
    }
    for (const [subjectId, list] of bySubject) {
      const problem = validateWeights(list.map((a) => a.weightPercent));
      if (problem) {
        const subject = await client.subject.findUnique({ where: { id: subjectId }, select: { name: true } });
        throw new BadRequestException(`${subject?.name ?? "A subject"}: ${problem}`);
      }
    }

    const enrollments = await client.enrollment.findMany({
      where: { classId: dto.classId, status: "ACTIVE" },
      select: { studentProfileId: true },
    });
    if (enrollments.length === 0) throw new BadRequestException("No students are enrolled in this class");

    // Every student needs a mark for every assessment before anything is
    // published — reported as a count, so a bursar or teacher knows how much
    // is outstanding rather than being told only that it failed.
    const missing: string[] = [];
    for (const { studentProfileId } of enrollments) {
      for (const assessment of assessments) {
        if (!assessment.marks.some((mark) => mark.studentProfileId === studentProfileId)) {
          missing.push(`${studentProfileId}:${assessment.id}`);
        }
      }
    }
    if (missing.length > 0) {
      throw new BadRequestException(
        `${missing.length} mark(s) are still missing across ${enrollments.length} student(s); ` +
          "record them, or mark the student absent or excused, before publishing",
      );
    }

    const publishedAt = new Date();
    const actor = await client.user.findUnique({
      where: { id: viewer.id },
      select: { firstName: true, lastName: true },
    });
    const publishedByName = actor ? `${actor.firstName} ${actor.lastName}` : viewer.id;

    const results = [];
    for (const { studentProfileId } of enrollments) {
      const subjectRows: {
        subjectId: string;
        percentHundredths: number;
        gradeLabel: string;
        gradeRemark: string | null;
        gradePoint: number | null;
      }[] = [];
      const subjectPercents: (number | null)[] = [];

      for (const [subjectId, list] of bySubject) {
        const marks: MarkInput[] = list.map((assessment) => {
          const mark = assessment.marks.find((m) => m.studentProfileId === studentProfileId);
          return {
            weightPercent: assessment.weightPercent,
            maxScoreHundredths: assessment.maxScoreHundredths,
            scoreHundredths: mark?.scoreHundredths ?? null,
            status: mark?.status ?? "ABSENT",
          };
        });

        const { percentHundredths } = computeSubjectScore(marks);
        subjectPercents.push(percentHundredths);
        if (percentHundredths === null) continue;

        const band = findBand(percentHundredths, bands);
        subjectRows.push({
          subjectId,
          percentHundredths,
          // The band label is copied by value here — this is the snapshot
          // that makes a later scale edit harmless to an issued report card.
          gradeLabel: band?.label ?? "—",
          gradeRemark: band?.remark ?? null,
          gradePoint: band?.gradePoint ?? null,
        });
      }

      const overall = computeOverallPercent(subjectPercents);

      const result = await client.termResult.upsert({
        where: {
          studentProfileId_classId_academicYear_term: {
            studentProfileId,
            classId: dto.classId,
            academicYear: dto.academicYear,
            term: dto.term,
          },
        },
        create: {
          studentProfileId,
          classId: dto.classId,
          academicYear: dto.academicYear,
          term: dto.term,
          status: "PUBLISHED",
          gradeScaleId: scale.id,
          overallPercentHundredths: overall,
          publishedAt,
          publishedByUserId: viewer.id,
          publishedByName,
        },
        update: {
          status: "PUBLISHED",
          gradeScaleId: scale.id,
          overallPercentHundredths: overall,
          publishedAt,
          publishedByUserId: viewer.id,
          publishedByName,
        },
      });

      // Republishing recomputes from scratch rather than merging, so a
      // withdrawn subject cannot linger on a reissued card.
      await client.subjectResult.deleteMany({ where: { termResultId: result.id } });
      if (subjectRows.length > 0) {
        await client.subjectResult.createMany({
          data: subjectRows.map((row) => ({ ...row, termResultId: result.id })),
        });
      }

      results.push(result.id);
    }

    return {
      classId: dto.classId,
      academicYear: dto.academicYear,
      term: dto.term,
      gradeScaleId: scale.id,
      studentsPublished: results.length,
    };
  }

  /** Returns a class's term results to DRAFT so marks can be corrected. */
  async unpublish(dto: PublishResultsDto) {
    const client = await this.tenantPrisma.getClient();
    const { count } = await client.termResult.updateMany({
      where: { classId: dto.classId, academicYear: dto.academicYear, term: dto.term, status: "PUBLISHED" },
      data: { status: "DRAFT" },
    });
    return { unpublished: count };
  }

  // ------------------------------------------------------------ report cards

  async listResults(classId: string, academicYear: string, term: string, viewer: AuthenticatedUser) {
    if (!isStaff(viewer)) throw new NotFoundException("No results found for that class");
    const client = await this.tenantPrisma.getClient();
    return client.termResult.findMany({
      where: { classId, academicYear, term },
      include: {
        studentProfile: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
        subjects: { include: { subject: { select: { id: true, name: true } } } },
      },
      orderBy: { overallPercentHundredths: "desc" },
    });
  }

  /**
   * One student's report card.
   *
   * A family sees only PUBLISHED results — a draft is working material, and
   * a parent reading a half-computed grade would be told something the
   * school has not decided yet. A guardian asking about a child who isn't
   * theirs gets a 404, never a 403.
   */
  async reportCard(studentProfileId: string, academicYear: string, term: string, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();

    if (!isStaff(viewer)) {
      const visible = await this.visibleStudentProfileIds(viewer);
      if (!visible.has(studentProfileId)) throw new NotFoundException("No report card found for that student");
    }

    const result = await client.termResult.findFirst({
      where: {
        studentProfileId,
        academicYear,
        term,
        ...(isStaff(viewer) ? {} : { status: "PUBLISHED" }),
      },
      include: {
        studentProfile: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
        class: { select: { id: true, name: true } },
        subjects: { include: { subject: { select: { id: true, name: true } } } },
      },
    });
    if (!result) throw new NotFoundException("No report card found for that student");

    return result;
  }

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
