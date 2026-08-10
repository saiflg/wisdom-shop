import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import { StorageService } from "@/storage/storage.service";
import { ALLOWED_IMAGE_TYPES, buildPhotoKey, isPhotoKeyForSchool, REJECTED_IMAGE_TYPES } from "@/storage/storage";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import { canChangePhoto, canSeePhoto, explainRejectedPhoto, type PhotoViewer } from "./photo-visibility";

export interface UploadedPhoto {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

@Injectable()
export class PeopleService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly storage: StorageService,
  ) {}

  async setPhoto(userId: string, file: UploadedPhoto | undefined, actor: AuthenticatedUser) {
    if (!file) throw new BadRequestException("No image was uploaded");

    const client = await this.tenantPrisma.getClient();
    const subject = await this.subjectFor(userId);
    const viewer = await this.viewerFor(actor);
    if (!canChangePhoto(viewer, subject)) {
      throw new ForbiddenException("You cannot change that person's photo");
    }

    // SVG first and by name: it is XML that can carry a script, and it is the
    // one type somebody will genuinely try to upload as a portrait.
    if (REJECTED_IMAGE_TYPES.includes(file.mimetype)) {
      throw new BadRequestException("That image type is not allowed. Use a PNG, JPEG or WebP.");
    }
    const extension = ALLOWED_IMAGE_TYPES[file.mimetype];
    if (!extension) {
      throw new BadRequestException("That image type is not allowed. Use a PNG, JPEG or WebP.");
    }
    const problem = explainRejectedPhoto({ mimeType: file.mimetype, bytes: file.size });
    if (problem) throw new BadRequestException(problem);

    const schoolId = this.tenantPrisma.currentSchoolId;
    const key = buildPhotoKey(schoolId, extension);
    await this.storage.save(key, file.buffer);

    const existing = await client.user.findUnique({ where: { id: userId }, select: { photoKey: true } });
    await client.user.update({ where: { id: userId }, data: { photoKey: key } });

    // Deleted after the new one is recorded, never before: a crash between
    // the two should leave a stale file on disk rather than a record pointing
    // at nothing.
    if (existing?.photoKey) await this.storage.delete(existing.photoKey).catch(() => undefined);

    return { userId, hasPhoto: true };
  }

  async removePhoto(userId: string, actor: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const subject = await this.subjectFor(userId);
    const viewer = await this.viewerFor(actor);
    if (!canChangePhoto(viewer, subject)) {
      throw new ForbiddenException("You cannot change that person's photo");
    }

    const existing = await client.user.findUnique({ where: { id: userId }, select: { photoKey: true } });
    await client.user.update({ where: { id: userId }, data: { photoKey: null } });
    if (existing?.photoKey) await this.storage.delete(existing.photoKey).catch(() => undefined);

    return { userId, hasPhoto: false };
  }

  /**
   * The bytes, if this viewer is allowed them.
   *
   * A 404 rather than a 403 when they are not: whether a particular child has
   * a photograph on file is itself information, and a distinguishable refusal
   * would let anyone enumerate that one request at a time.
   */
  async readPhoto(userId: string, actor: AuthenticatedUser) {
    const client = await this.tenantPrisma.getClient();
    const user = await client.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, photoKey: true },
    });
    if (!user?.photoKey) throw new NotFoundException("No photo");

    const subject = await this.subjectFor(userId);
    const viewer = await this.viewerFor(actor);
    if (!canSeePhoto(viewer, subject)) throw new NotFoundException("No photo");

    // The key came from our own database, so this is a guard against a bug
    // rather than a hostile caller — but a key pointing outside this school's
    // directory must fail to load rather than succeed quietly.
    const schoolId = this.tenantPrisma.currentSchoolId;
    if (!isPhotoKeyForSchool(user.photoKey, schoolId)) throw new NotFoundException("No photo");

    return { key: user.photoKey, stream: await this.storage.readStream(user.photoKey) };
  }

  /** Which classes a person is in, for the visibility rule. */
  private async subjectFor(userId: string) {
    const client = await this.tenantPrisma.getClient();
    const user = await client.user.findFirst({ where: { id: userId, deletedAt: null }, select: { id: true } });
    if (!user) throw new NotFoundException("No person found with that id");

    return { userId, classIds: await this.classIdsFor(userId) };
  }

  private async viewerFor(actor: AuthenticatedUser): Promise<PhotoViewer> {
    const client = await this.tenantPrisma.getClient();
    const children = await client.guardianLink.findMany({
      where: { guardianUserId: actor.id },
      select: { studentProfile: { select: { userId: true } } },
    });

    return {
      userId: actor.id,
      roles: actor.roles,
      classIds: await this.classIdsFor(actor.id),
      childUserIds: children.map((link) => link.studentProfile.userId),
    };
  }

  private async classIdsFor(userId: string): Promise<string[]> {
    const client = await this.tenantPrisma.getClient();
    const classes = await client.class.findMany({
      where: {
        deletedAt: null,
        OR: [
          { homeroomTeacherId: userId },
          { teachingAssignments: { some: { teacherUserId: userId } } },
          { enrollments: { some: { status: "ACTIVE", studentProfile: { userId } } } },
        ],
      },
      select: { id: true },
    });
    return classes.map((klass) => klass.id);
  }
}
