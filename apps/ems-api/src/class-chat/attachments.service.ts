import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { ReadStream } from "node:fs";
import { TenantPrismaService } from "@/tenancy/tenant-prisma.service";
import { StorageService } from "@/storage/storage.service";
import { buildAttachmentKey, isAttachmentKeyForSchool } from "@/storage/storage";
import type { AuthenticatedUser } from "@/auth/interfaces/jwt-payload.interface";
import {
  MAX_VOICE_SECONDS,
  attachmentProblem,
  attachmentReadableWhenMessageIs,
  dispositionFor,
  extensionFor,
  kindOf,
  safeDisplayName,
  type AttachmentKind,
} from "./attachments";

/** What multer hands us. */
export interface UploadedAttachment {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

@Injectable()
export class ClassAttachmentsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Store a file and hand back its id, before the message that carries it
   * exists.
   *
   * Two steps rather than one multipart post that also creates the message:
   * a photograph taken on a phone takes seconds to upload, and a child should
   * see that finish before they decide what to type. The row is written with
   * no message, and attached when the message is posted.
   */
  async upload(file: UploadedAttachment | undefined, durationSeconds?: number) {
    if (!file) throw new BadRequestException("No file was uploaded.");

    const problem = attachmentProblem({ contentType: file.mimetype, bytes: file.size });
    if (problem) throw new BadRequestException(problem);

    const kind = kindOf(file.mimetype) as AttachmentKind;
    const extension = extensionFor(file.mimetype);
    if (!extension) throw new BadRequestException("That kind of file cannot be shared here.");

    if (kind === "AUDIO" && durationSeconds && durationSeconds > MAX_VOICE_SECONDS) {
      throw new BadRequestException(
        `That voice note is too long. Keep it under ${MAX_VOICE_SECONDS / 60} minutes.`,
      );
    }

    // Built from the resolved tenant, never from anything in the request, and
    // named with a UUID so nothing the uploader typed reaches a path.
    const key = buildAttachmentKey(this.tenantPrisma.currentSchoolId, extension);
    await this.storage.save(key, file.buffer);

    return {
      key,
      kind,
      contentType: file.mimetype.toLowerCase().split(";")[0].trim(),
      byteSize: file.size,
      displayName: safeDisplayName(file.originalname ?? "", file.mimetype),
      durationSeconds: kind === "AUDIO" ? (durationSeconds ?? null) : null,
    };
  }

  /**
   * The bytes, for somebody who has proved they may read the message.
   *
   * Authorisation is deliberately *not* re-derived here from the attachment.
   * The caller passes in whether the message is readable, because an
   * attachment with its own notion of "may read" is how a file outlives the
   * conversation it was posted in.
   */
  async read(
    attachmentId: string,
    viewer: AuthenticatedUser,
    messageReadable: (message: { conversationId: string; deletedAt: Date | null }) => Promise<boolean>,
  ): Promise<{ stream: ReadStream; contentType: string; disposition: string; displayName: string }> {
    const client = await this.tenantPrisma.getClient();

    const attachment = await client.classMessageAttachment.findUnique({
      where: { id: attachmentId },
      include: { message: { select: { conversationId: true, deletedAt: true } } },
    });
    if (!attachment) throw new NotFoundException("File not found");

    const readable = await messageReadable(attachment.message);
    if (!attachmentReadableWhenMessageIs(readable, attachment.message.deletedAt !== null)) {
      // 404 rather than 403: a file somebody may not see should not be
      // confirmed to exist.
      throw new NotFoundException("File not found");
    }

    // The key comes from our own database, so this guards against a bug
    // rather than an attacker — and it is the only thing standing between two
    // tenants sharing one storage root.
    if (!isAttachmentKeyForSchool(attachment.storageKey, this.tenantPrisma.currentSchoolId)) {
      throw new NotFoundException("File not found");
    }

    return {
      stream: await this.storage.readStream(attachment.storageKey),
      contentType: attachment.contentType,
      disposition: dispositionFor(attachment.kind as AttachmentKind),
      displayName: attachment.displayName,
    };
  }

  /** Shown beside a message. Never includes the storage key. */
  present(attachment: {
    id: string;
    kind: string;
    contentType: string;
    byteSize: number;
    displayName: string;
    durationSeconds: number | null;
  }) {
    return {
      id: attachment.id,
      kind: attachment.kind,
      contentType: attachment.contentType,
      byteSize: attachment.byteSize,
      displayName: attachment.displayName,
      durationSeconds: attachment.durationSeconds,
      /** The only address these bytes ever have. Authorised, never guessable. */
      url: `/v1/class-chat/attachments/${attachment.id}`,
    };
  }
}
