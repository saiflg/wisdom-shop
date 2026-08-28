import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { ReadStream } from "node:fs";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import { StorageService } from "@/storage/storage.service";
import { buildAttachmentKey, isAttachmentKeyForSchool } from "@/storage/storage";
import { getTenantContext } from "@/tenancy/tenant-context";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";

const STAFF_ROLES = ["SCHOOL_ADMIN", "TEACHER"];

/** Ten megabytes. A birth certificate scan, not a video. */
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * What a school actually attaches to a child.
 *
 * An allow-list, not a block-list. This accepts uploads from anybody who can
 * edit a student record and hands them back to browsers later; "anything
 * except the dangerous ones" is a list that is always one format out of date.
 */
const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly storage: StorageService,
  ) {}

  async list(studentProfileId: string, viewer: AuthenticatedUser) {
    await this.assertMayView(studentProfileId, viewer);
    const client = await this.tenantPrisma.getClient();

    return client.studentDocument.findMany({
      where: { studentProfileId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      // storageKey is deliberately not selected. It is an internal path, and
      // a client that never receives it cannot be talked into asking for
      // somebody else's.
      select: {
        id: true,
        label: true,
        mimeType: true,
        bytes: true,
        uploadedByName: true,
        createdAt: true,
      },
    });
  }

  async upload(
    studentProfileId: string,
    label: string,
    file: UploadedFile | undefined,
    actor: AuthenticatedUser,
  ) {
    if (!actor.roles.some((role) => STAFF_ROLES.includes(role))) {
      throw new ForbiddenException("Only school staff can attach a document to a child");
    }
    if (!file) throw new BadRequestException("Choose a file");
    if (!label.trim()) throw new BadRequestException("Say what the document is");

    const extension = ALLOWED_TYPES[file.mimetype];
    if (!extension) {
      throw new BadRequestException(
        `That file type is not accepted. Use ${Object.values(ALLOWED_TYPES).join(", ")}.`,
      );
    }
    if (file.size > MAX_BYTES) throw new BadRequestException("That file is larger than 10 MB");
    if (file.size <= 0) throw new BadRequestException("That file is empty");

    const client = await this.tenantPrisma.getClient();
    const student = await client.studentProfile.findFirst({ where: { id: studentProfileId } });
    if (!student) throw new NotFoundException("No student found with that id");

    const schoolId = getTenantContext()?.schoolId;
    if (!schoolId) throw new ForbiddenException("No school in this request");

    // Random UUID under the school's own prefix: one school's key cannot
    // address another's file, and a key cannot be guessed from a child's name.
    const key = buildAttachmentKey(schoolId, extension);
    await this.storage.save(key, file.buffer);

    return client.studentDocument.create({
      data: {
        studentProfileId,
        label: label.trim(),
        storageKey: key,
        mimeType: file.mimetype,
        bytes: file.size,
        uploadedByUserId: actor.id,
        uploadedByName: await this.nameOf(actor.id),
      },
      select: { id: true, label: true, mimeType: true, bytes: true, createdAt: true },
    });
  }

  /**
   * The bytes, for somebody entitled to them.
   *
   * Streamed through this route, never a public URL. A child's birth
   * certificate at a guessable address is the failure this whole design is
   * arranged around, and the key is checked against the requesting school
   * before anything is opened.
   */
  async read(
    id: string,
    viewer: AuthenticatedUser,
  ): Promise<{ stream: ReadStream; mimeType: string; label: string }> {
    const client = await this.tenantPrisma.getClient();
    const document = await client.studentDocument.findFirst({ where: { id, deletedAt: null } });
    if (!document) throw new NotFoundException("No document found with that id");

    await this.assertMayView(document.studentProfileId, viewer);

    const schoolId = getTenantContext()?.schoolId;
    // Belt and braces: the row was found in this school's database, so the
    // key should already belong to it. If those two ever disagree, the honest
    // response is to refuse rather than to serve the file and find out later.
    if (!schoolId || !isAttachmentKeyForSchool(document.storageKey, schoolId)) {
      throw new NotFoundException("No document found with that id");
    }

    return {
      stream: await this.storage.readStream(document.storageKey),
      mimeType: document.mimeType,
      label: document.label,
    };
  }

  /**
   * Withdraw a document.
   *
   * Soft-deleted, and the bytes are left alone. A file removed in error is
   * recoverable; one deleted from disk is a birth certificate a family has to
   * find again.
   */
  async remove(id: string, actor: AuthenticatedUser) {
    if (!actor.roles.includes("SCHOOL_ADMIN")) {
      throw new ForbiddenException("Only an administrator can remove a document");
    }
    const client = await this.tenantPrisma.getClient();
    const document = await client.studentDocument.findFirst({ where: { id, deletedAt: null } });
    if (!document) throw new NotFoundException("No document found with that id");

    await client.studentDocument.update({ where: { id }, data: { deletedAt: new Date() } });
  }

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
