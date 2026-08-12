import { BadRequestException, Injectable } from "@nestjs/common";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import {
  actionable,
  blockers,
  planPromotion,
  summarise,
  type ClassMapping,
  type PromotionDecision,
} from "./promotion-plan";

export interface PromotionRequest {
  fromAcademicYear: string;
  toAcademicYear: string;
  /** Source class id -> destination class id, or null to graduate the class. */
  classMappings: Record<string, string | null>;
  overrides?: Record<string, "PROMOTE" | "REPEAT" | "GRADUATE">;
}

@Injectable()
export class PromotionService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /**
   * Work out what would happen, touching nothing.
   *
   * Preview and commit share this method so the list an office approves is
   * the list that runs. Recomputing the plan at commit time from the same
   * inputs is what stops a stale preview being applied — the alternative,
   * passing the previewed decisions back to be executed, would let a caller
   * hand back an edited plan.
   */
  async preview(request: PromotionRequest) {
    const client = await this.tenantPrisma.getClient();

    if (request.fromAcademicYear === request.toAcademicYear) {
      throw new BadRequestException("The destination year must be different from the current year");
    }

    const [fromClasses, toClasses] = await Promise.all([
      client.class.findMany({
        where: { academicYear: request.fromAcademicYear, deletedAt: null },
        select: { id: true, name: true, gradeLevel: true },
      }),
      client.class.findMany({
        where: { academicYear: request.toAcademicYear, deletedAt: null },
        select: { id: true, name: true, gradeLevel: true },
      }),
    ]);

    const fromClassIds = fromClasses.map((c) => c.id);

    const enrollments = await client.enrollment.findMany({
      where: {
        status: "ACTIVE",
        classId: { in: fromClassIds },
        studentProfile: { deletedAt: null },
      },
      select: {
        id: true,
        classId: true,
        studentProfileId: true,
        studentProfile: { select: { user: { select: { firstName: true, lastName: true } } } },
      },
    });

    // The idempotency key: who already holds any enrolment in the destination
    // year. Derived from the data rather than from a "promotion has run" flag,
    // because a flag can be wrong and a child sitting in next year's class
    // cannot.
    const nextYear = await client.enrollment.findMany({
      where: { class: { academicYear: request.toAcademicYear, deletedAt: null } },
      select: { studentProfileId: true },
    });
    const alreadyEnrolledNextYear = new Set(nextYear.map((e) => e.studentProfileId));

    // A repeater needs next year's version of the class they are in now,
    // matched by name — the same "JSS 1" a year later.
    const byName = new Map(toClasses.map((c) => [c.name.trim().toLowerCase(), c]));

    const mappings: Record<string, ClassMapping> = {};
    for (const source of fromClasses) {
      if (!(source.id in request.classMappings)) continue;
      const targetId = request.classMappings[source.id];
      const target = targetId ? toClasses.find((c) => c.id === targetId) : undefined;

      if (targetId && !target) {
        throw new BadRequestException(
          `The destination chosen for ${source.name} is not a class in ${request.toAcademicYear}`,
        );
      }

      const repeat = byName.get(source.name.trim().toLowerCase()) ?? null;
      mappings[source.id] = {
        promoteToClassId: target?.id ?? null,
        promoteToClassName: target?.name ?? null,
        repeatClassId: repeat?.id ?? null,
        repeatClassName: repeat?.name ?? null,
        graduating: targetId === null,
      };
    }

    const classNames = new Map(fromClasses.map((c) => [c.id, c.name]));

    const decisions = planPromotion({
      students: enrollments.map((e) => ({
        studentProfileId: e.studentProfileId,
        studentName: `${e.studentProfile.user.firstName} ${e.studentProfile.user.lastName}`,
        enrollmentId: e.id,
        fromClassId: e.classId,
        fromClassName: classNames.get(e.classId) ?? "Unknown class",
      })),
      mappings,
      overrides: request.overrides ?? {},
      alreadyEnrolledNextYear,
    });

    decisions.sort(
      (a, b) => a.fromClassName.localeCompare(b.fromClassName) || a.studentName.localeCompare(b.studentName),
    );

    return {
      fromAcademicYear: request.fromAcademicYear,
      toAcademicYear: request.toAcademicYear,
      classes: fromClasses.map((c) => ({
        id: c.id,
        name: c.name,
        gradeLevel: c.gradeLevel,
        studentCount: enrollments.filter((e) => e.classId === c.id).length,
      })),
      availableTargets: toClasses.map((c) => ({ id: c.id, name: c.name, gradeLevel: c.gradeLevel })),
      decisions,
      summary: summarise(decisions),
      blockers: blockers(decisions),
    };
  }

  /**
   * Apply the plan.
   *
   * Refuses outright if any child has nowhere to go. Running anyway would
   * leave that child enrolled nowhere while their classmates moved on, which
   * is invisible until a register comes up short — far better to stop and
   * make somebody choose.
   */
  async apply(request: PromotionRequest) {
    const client = await this.tenantPrisma.getClient();
    const plan = await this.preview(request);

    if (plan.blockers.length > 0) {
      throw new BadRequestException(
        `${plan.blockers.length} student(s) have nowhere to go. Choose a destination for every class first.`,
      );
    }

    const changes = actionable(plan.decisions);
    const now = new Date();

    // One transaction: a partial promotion is the state nobody can reason
    // about. If it fails halfway, nothing moved and it can simply be run
    // again — which the ALREADY_DONE check makes safe anyway.
    await client.$transaction(async (tx) => {
      for (const decision of changes) {
        await tx.enrollment.update({
          where: { id: decision.enrollmentId },
          data: { status: "COMPLETED", endDate: now },
        });

        if (decision.toClassId) {
          await tx.enrollment.create({
            data: {
              studentProfileId: decision.studentProfileId,
              classId: decision.toClassId,
              status: "ACTIVE",
              startDate: now,
            },
          });
        }
      }
    });

    return {
      applied: changes.length,
      summary: plan.summary,
      decisions: changes.map((d: PromotionDecision) => ({
        studentName: d.studentName,
        from: d.fromClassName,
        to: d.toClassName,
        outcome: d.outcome,
      })),
    };
  }
}
