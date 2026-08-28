import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import type { CreateMedicalEntryDto } from "./dto/create-medical-entry.dto";
import { criticalOnly, forEmergency, summarise, validateEntry } from "./medical-rules";

const STAFF_ROLES = ["SCHOOL_ADMIN", "TEACHER"];

@Injectable()
export class MedicalService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /**
   * One child's record.
   *
   * There is deliberately no route that lists across children. A list of
   * every child in the school with a life-threatening allergy is a document
   * that should not exist in a school portal, and the easiest way to be sure
   * it never leaks is never to be able to produce it.
   */
  async forStudent(studentProfileId: string, viewer: AuthenticatedUser) {
    await this.assertMayView(studentProfileId, viewer);
    const client = await this.tenantPrisma.getClient();

    const entries = await client.medicalEntry.findMany({ where: { studentProfileId } });

    return {
      entries: forEmergency(entries),
      critical: criticalOnly(entries),
      summary: summarise(entries),
    };
  }

  async add(studentProfileId: string, dto: CreateMedicalEntryDto, actor: AuthenticatedUser) {
    if (!actor.roles.some((role) => STAFF_ROLES.includes(role))) {
      throw new ForbiddenException("Only school staff can write in a medical record");
    }

    const problem = validateEntry({
      kind: dto.kind,
      severity: dto.severity ?? null,
      title: dto.title,
    });
    if (problem) throw new BadRequestException(problem);

    const client = await this.tenantPrisma.getClient();
    const student = await client.studentProfile.findFirst({ where: { id: studentProfileId } });
    if (!student) throw new NotFoundException("No student found with that id");

    return client.medicalEntry.create({
      data: {
        studentProfileId,
        kind: dto.kind,
        severity: dto.severity ?? null,
        title: dto.title.trim(),
        detail: dto.detail?.trim() || null,
        action: dto.action?.trim() || null,
        recordedByUserId: actor.id,
        recordedByName: await this.nameOf(actor.id),
      },
    });
  }

  /**
   * Archive an entry.
   *
   * There is no delete. Health information about a child is not something a
   * school should be able to make disappear — a condition that turned out to
   * be wrong, or one a child grew out of, is still part of the record
   * somebody may need to understand later.
   */
  async archive(id: string, actor: AuthenticatedUser) {
    if (!actor.roles.some((role) => STAFF_ROLES.includes(role))) {
      throw new ForbiddenException("Only school staff can change a medical record");
    }
    const client = await this.tenantPrisma.getClient();
    const entry = await client.medicalEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException("No entry found with that id");
    if (entry.archivedAt) return { entry, alreadyArchived: true };

    const updated = await client.medicalEntry.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
    return { entry: updated, alreadyArchived: false };
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

    throw new NotFoundException("No student found with that id");
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
