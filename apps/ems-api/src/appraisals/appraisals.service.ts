import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import type { CreateAppraisalDto } from "./dto/create-appraisal.dto";
import type { UpdateAppraisalDto } from "./dto/update-appraisal.dto";
import type { TransitionAppraisalDto } from "./dto/transition-appraisal.dto";
import {
  appraisalProblem,
  availableTransitions,
  checkTransition,
  isVisibleToSubject,
  overallScore,
  validateRatings,
  type AppraisalStatus,
} from "./appraisal-rules";

@Injectable()
export class AppraisalsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(dto: CreateAppraisalDto, actor: AuthenticatedUser) {
    const problem = appraisalProblem({
      subjectUserId: dto.subjectUserId,
      reviewerUserId: actor.id,
      periodLabel: dto.periodLabel,
    });
    if (problem) throw new BadRequestException(problem);

    const client = await this.tenantPrisma.getClient();
    const subject = await client.user.findUnique({ where: { id: dto.subjectUserId }, select: { id: true } });
    if (!subject) throw new NotFoundException("No member of staff found with that id");

    return client.appraisal.create({
      data: {
        subjectUserId: dto.subjectUserId,
        reviewerUserId: actor.id,
        reviewerName: await this.nameOf(actor.id),
        periodLabel: dto.periodLabel.trim(),
        strengths: dto.strengths?.trim() || null,
        development: dto.development?.trim() || null,
        comment: dto.comment?.trim() || null,
      },
      include: { ratings: true },
    });
  }

  /**
   * Appraisals this person may see.
   *
   * A member of staff sees their own, and only once shared — a half-written
   * appraisal is not something to read about yourself. A reviewer sees the
   * ones they wrote. An administrator sees all of them, which is what makes
   * the acknowledgement rule meaningful: they can read everything and still
   * cannot sign on somebody else's behalf.
   */
  async list(viewer: AuthenticatedUser, subjectUserId?: string) {
    const client = await this.tenantPrisma.getClient();
    const isAdmin = viewer.roles.includes("SCHOOL_ADMIN");

    const appraisals = await client.appraisal.findMany({
      where: {
        deletedAt: null,
        ...(subjectUserId ? { subjectUserId } : {}),
        ...(isAdmin
          ? {}
          : {
              OR: [
                { reviewerUserId: viewer.id },
                { subjectUserId: viewer.id, status: { in: ["SHARED", "ACKNOWLEDGED"] } },
              ],
            }),
      },
      orderBy: { createdAt: "desc" },
      include: {
        ratings: { orderBy: { area: "asc" } },
        subject: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return appraisals.map((appraisal) => this.present(appraisal, viewer));
  }

  async findOne(id: string, viewer: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const appraisal = await client.appraisal.findFirst({
      where: { id, deletedAt: null },
      include: {
        ratings: { orderBy: { area: "asc" } },
        subject: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!appraisal) throw new NotFoundException("No appraisal found with that id");

    const isAdmin = viewer.roles.includes("SCHOOL_ADMIN");
    const isReviewer = appraisal.reviewerUserId === viewer.id;
    const isSubject = appraisal.subjectUserId === viewer.id;

    // A draft is a 404 for its subject, not a 403: knowing an unfinished
    // appraisal about you exists is most of what reading it would tell you.
    if (!isAdmin && !isReviewer) {
      if (!isSubject || !isVisibleToSubject(appraisal.status)) {
        throw new NotFoundException("No appraisal found with that id");
      }
    }

    return this.present(appraisal, viewer);
  }

  /** Editable while it is a draft, by the reviewer who wrote it. */
  async update(id: string, dto: UpdateAppraisalDto, actor: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const appraisal = await client.appraisal.findFirst({ where: { id, deletedAt: null } });
    if (!appraisal) throw new NotFoundException("No appraisal found with that id");

    if (appraisal.reviewerUserId !== actor.id && !actor.roles.includes("SCHOOL_ADMIN")) {
      throw new ForbiddenException("Only the reviewer can edit this appraisal");
    }
    if (appraisal.status !== "DRAFT") {
      throw new BadRequestException(
        "This appraisal has been shared. Take it back to draft before changing it.",
      );
    }

    if (dto.ratings) {
      const problem = validateRatings(dto.ratings);
      if (problem) throw new BadRequestException(problem);
    }

    return client.appraisal.update({
      where: { id },
      data: {
        periodLabel: dto.periodLabel?.trim(),
        strengths: dto.strengths?.trim(),
        development: dto.development?.trim(),
        comment: dto.comment?.trim(),
        ...(dto.ratings
          ? {
              // Replaced wholesale: the ratings are read together as one
              // picture, and a half-applied edit would be an appraisal nobody
              // wrote.
              ratings: {
                deleteMany: {},
                create: dto.ratings.map((rating) => ({
                  area: rating.area.trim(),
                  score: rating.score,
                  comment: rating.comment?.trim() || null,
                })),
              },
            }
          : {}),
      },
      include: { ratings: true },
    });
  }

  /**
   * Share, acknowledge, or take back.
   *
   * The decision is `checkTransition`, which holds the rule an administrator
   * cannot override: only the person being appraised may acknowledge it.
   */
  async transition(id: string, dto: TransitionAppraisalDto, actor: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const appraisal = await client.appraisal.findFirst({ where: { id, deletedAt: null } });
    if (!appraisal) throw new NotFoundException("No appraisal found with that id");

    const problem = checkTransition(appraisal.status as AppraisalStatus, dto.to, {
      isAdmin: actor.roles.includes("SCHOOL_ADMIN"),
      isReviewer: appraisal.reviewerUserId === actor.id,
      isSubject: appraisal.subjectUserId === actor.id,
    });
    if (problem) throw new ForbiddenException(problem);

    return client.appraisal.update({
      where: { id },
      data: {
        status: dto.to,
        ...(dto.to === "SHARED" ? { sharedAt: new Date(), acknowledgedAt: null } : {}),
        ...(dto.to === "ACKNOWLEDGED"
          ? { acknowledgedAt: new Date(), acknowledgementNote: dto.note?.trim() || null }
          : {}),
        // Taking it back to draft clears both dates, so the row never claims
        // a sharing that is no longer true.
        ...(dto.to === "DRAFT" ? { sharedAt: null, acknowledgedAt: null } : {}),
      },
      include: { ratings: true },
    });
  }

  private present(
    appraisal: {
      id: string;
      status: string;
      subjectUserId: string;
      reviewerUserId: string;
      ratings: { area: string; score: number }[];
    } & Record<string, unknown>,
    viewer: AuthenticatedUser,
  ) {
    return {
      ...appraisal,
      overall: overallScore(appraisal.ratings),
      availableTransitions: availableTransitions(appraisal.status as AppraisalStatus, {
        isAdmin: viewer.roles.includes("SCHOOL_ADMIN"),
        isReviewer: appraisal.reviewerUserId === viewer.id,
        isSubject: appraisal.subjectUserId === viewer.id,
      }),
    };
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
