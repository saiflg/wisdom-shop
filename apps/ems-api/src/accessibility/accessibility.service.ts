import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { RoleName } from "ems-tenant-client";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import type { UpdateAccessibilityProfileDto } from "./dto/update-accessibility-profile.dto";

const STAFF_ROLES: RoleName[] = ["SCHOOL_ADMIN", "TEACHER"];

function isStaff(viewer: AuthenticatedUser): boolean {
  return viewer.roles.some((role) => STAFF_ROLES.includes(role));
}

/** Everything except the note. */
const PUBLIC_FIELDS = {
  id: true,
  userId: true,
  largeText: true,
  highContrast: true,
  dyslexiaFont: true,
  reduceMotion: true,
  readingSupport: true,
  describeVisuals: true,
  requireCaptions: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * A student's accessibility profile.
 *
 * Two rules run through this service.
 *
 * **Students set their own preferences.** Needing larger text should not
 * require asking a teacher and waiting: the settings are the student's own,
 * on their own account, changeable whenever they like.
 *
 * **The note is staff-only, in both directions.** `notes` is where a school
 * would record a diagnosis or a support arrangement. A student reading a
 * clinical note about themselves in a settings screen is a harm, a guardian
 * reading one written for staff is a different harm, and neither is necessary
 * for the software to work — so the column is simply never selected for
 * anyone else, rather than filtered after the fact.
 */
@Injectable()
export class AccessibilityService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /** The profile the AI Teacher reads. Never includes the note. */
  async needsFor(userId: string) {
    const client = await this.tenantPrisma.getClient();
    return client.accessibilityProfile.findUnique({
      where: { userId },
      select: { readingSupport: true, describeVisuals: true, requireCaptions: true },
    });
  }

  async getOwn(viewer: AuthenticatedUser) {
    return this.read(viewer.id, false);
  }

  async getFor(userId: string, viewer: AuthenticatedUser) {
    await this.assertMayRead(userId, viewer);
    return this.read(userId, isStaff(viewer));
  }

  async updateOwn(dto: UpdateAccessibilityProfileDto, viewer: AuthenticatedUser) {
    // A student may not write the staff note about themselves, whatever they
    // send.
    return this.write(viewer.id, { ...dto, notes: undefined }, viewer, false);
  }

  async updateFor(userId: string, dto: UpdateAccessibilityProfileDto, viewer: AuthenticatedUser) {
    if (!isStaff(viewer)) throw new ForbiddenException("Only staff can change another student's settings");

    const client = await this.tenantPrisma.getClient();
    const user = await client.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw new NotFoundException("No user found with that id");

    return this.write(userId, dto, viewer, true);
  }

  private async read(userId: string, includeNotes: boolean) {
    const client = await this.tenantPrisma.getClient();

    const existing = await client.accessibilityProfile.findUnique({
      where: { userId },
      select: includeNotes ? { ...PUBLIC_FIELDS, notes: true, updatedByUserId: true } : PUBLIC_FIELDS,
    });
    if (existing) return existing;

    // A student who has never opened the settings still has preferences —
    // the default ones. Returning the defaults rather than null saves every
    // caller from a null check and means a row is only written when someone
    // actually changes something.
    return {
      id: null,
      userId,
      largeText: false,
      highContrast: false,
      dyslexiaFont: false,
      reduceMotion: false,
      readingSupport: "NONE" as const,
      describeVisuals: false,
      requireCaptions: false,
      createdAt: null,
      updatedAt: null,
      ...(includeNotes ? { notes: null, updatedByUserId: null } : {}),
    };
  }

  private async write(
    userId: string,
    dto: UpdateAccessibilityProfileDto,
    viewer: AuthenticatedUser,
    includeNotes: boolean,
  ) {
    const client = await this.tenantPrisma.getClient();

    const data = {
      ...(dto.largeText === undefined ? {} : { largeText: dto.largeText }),
      ...(dto.highContrast === undefined ? {} : { highContrast: dto.highContrast }),
      ...(dto.dyslexiaFont === undefined ? {} : { dyslexiaFont: dto.dyslexiaFont }),
      ...(dto.reduceMotion === undefined ? {} : { reduceMotion: dto.reduceMotion }),
      ...(dto.readingSupport === undefined ? {} : { readingSupport: dto.readingSupport }),
      ...(dto.describeVisuals === undefined ? {} : { describeVisuals: dto.describeVisuals }),
      ...(dto.requireCaptions === undefined ? {} : { requireCaptions: dto.requireCaptions }),
      ...(includeNotes && dto.notes !== undefined ? { notes: dto.notes.trim() || null } : {}),
      updatedByUserId: viewer.id,
    };

    await client.accessibilityProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });

    return this.read(userId, includeNotes);
  }

  private async assertMayRead(userId: string, viewer: AuthenticatedUser) {
    if (viewer.id === userId || isStaff(viewer)) return;

    const client = await this.tenantPrisma.getClient();

    if (viewer.roles.includes("GUARDIAN")) {
      const link = await client.guardianLink.findFirst({
        where: { guardianUserId: viewer.id, studentProfile: { userId } },
        select: { id: true },
      });
      if (link) return;
    }

    // 404 rather than 403: whose settings exist is itself information about
    // another student.
    throw new NotFoundException("No settings found for that user");
  }
}
