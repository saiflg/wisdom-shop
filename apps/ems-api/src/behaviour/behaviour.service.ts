import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import type { CreateBehaviourRecordDto } from "./dto/create-behaviour-record.dto";
import type { UpdateBehaviourRecordDto } from "./dto/update-behaviour-record.dto";
import { summariseBehaviour, validatePoints } from "./behaviour-summary";

const STAFF_ROLES = ["SCHOOL_ADMIN", "TEACHER"];

@Injectable()
export class BehaviourService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(dto: CreateBehaviourRecordDto, actor: AuthenticatedUser) {
    const problem = validatePoints(dto.points ?? 0);
    if (problem) throw new BadRequestException(problem);

    const client = await this.tenantPrisma.getClient();

    const student = await client.studentProfile.findFirst({ where: { id: dto.studentProfileId } });
    if (!student) throw new NotFoundException("No student found with that id");

    return client.behaviourRecord.create({
      data: {
        studentProfileId: dto.studentProfileId,
        classId: dto.classId ?? null,
        kind: dto.kind,
        category: dto.category.trim(),
        description: dto.description.trim(),
        points: dto.points ?? 0,
        // When it happened, not when it was typed up. A teacher writing up
        // Friday break on Monday morning should not have it filed as Monday.
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
        recordedByUserId: actor.id,
        recordedByName: await this.nameOf(actor.id),
      },
    });
  }

  /**
   * A child's record, with what it adds up to.
   *
   * Scoped by viewer: staff see any child, a family sees their own. There is
   * no listing across children and no ordering by points anywhere in this
   * service — see the note on the model.
   */
  async forStudent(studentProfileId: string, viewer: AuthenticatedUser) {
    await this.assertMayView(studentProfileId, viewer);
    const client = await this.tenantPrisma.getClient();

    const records = await client.behaviourRecord.findMany({
      where: { studentProfileId, deletedAt: null },
      orderBy: { occurredAt: "desc" },
      include: { class: { select: { id: true, name: true } } },
    });

    return { records, summary: summariseBehaviour(records) };
  }

  /**
   * Amend a record.
   *
   * Staff only, and the amendment is visible: `updatedAt` moves, and the
   * screen shows "edited" beside anything whose updatedAt has left its
   * createdAt behind. A record about a child that could be rewritten with no
   * trace would be worth nothing to a family disputing it.
   */
  async update(id: string, dto: UpdateBehaviourRecordDto, actor: AuthenticatedUser) {
    if (!actor.roles.some((role) => STAFF_ROLES.includes(role))) {
      throw new ForbiddenException("Only school staff can amend a behaviour record");
    }
    if (dto.points !== undefined) {
      const problem = validatePoints(dto.points);
      if (problem) throw new BadRequestException(problem);
    }

    const client = await this.tenantPrisma.getClient();
    const existing = await client.behaviourRecord.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException("No behaviour record found with that id");

    return client.behaviourRecord.update({
      where: { id },
      data: {
        kind: dto.kind,
        category: dto.category?.trim(),
        description: dto.description?.trim(),
        points: dto.points,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined,
      },
    });
  }

  /**
   * Withdraw a record.
   *
   * Soft-delete only, and administrators only. Something written about a
   * child that turned out to be wrong should stop counting against them, but
   * a school that can make it never have existed is a school that cannot
   * answer a family asking what was said.
   */
  async remove(id: string, actor: AuthenticatedUser) {
    if (!actor.roles.includes("SCHOOL_ADMIN")) {
      throw new ForbiddenException("Only an administrator can withdraw a behaviour record");
    }
    const client = await this.tenantPrisma.getClient();
    const existing = await client.behaviourRecord.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException("No behaviour record found with that id");

    await client.behaviourRecord.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  private async nameOf(userId: string): Promise<string> {
    const client = await this.tenantPrisma.getClient();
    const user = await client.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });
    return user ? `${user.firstName} ${user.lastName}`.trim() : "Unknown";
  }

  /** Staff see any child; a family sees their own and gets a 404 otherwise. */
  private async assertMayView(studentProfileId: string, viewer: AuthenticatedUser) {
    if (viewer.roles.some((role) => STAFF_ROLES.includes(role))) return;

    const client = await this.tenantPrisma.getClient();

    if (viewer.roles.includes("GUARDIAN")) {
      const link = await client.guardianLink.findFirst({
        where: { guardianUserId: viewer.id, studentProfileId },
      });
      if (link) return;
    }

    const own = await client.studentProfile.findUnique({
      where: { userId: viewer.id },
      select: { id: true },
    });
    if (own?.id === studentProfileId) return;

    // 404, like fees and wallets: 403 would confirm the child exists here.
    throw new NotFoundException("No student found with that id");
  }
}
