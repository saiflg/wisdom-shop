import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../common/audit/audit-log.service";
import { StorageService } from "../storage/storage.service";
import {
  buildStorageKey,
  displayName,
  FILE_PREFIX,
  safeExtensionFrom,
} from "../storage/storage";
import { canDownload, SETTLED_ORDER_STATUSES } from "./entitlement";

@Injectable()
export class DownloadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly auditLog: AuditLogService,
  ) {}

  /** Attaches a downloadable file to a product. */
  async attach(
    productId: string,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
    actorUserId: string,
  ) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true },
    });
    if (!product) throw new NotFoundException("Product not found");

    const key = buildStorageKey(FILE_PREFIX, safeExtensionFrom(file.originalname));
    await this.storage.save(key, file.buffer);

    const record = await this.prisma.productFile.create({
      data: {
        productId,
        storageKey: key,
        originalName: displayName(file.originalname),
        // Recorded for the download response. It is not trusted for
        // anything else — files always go out as an attachment.
        contentType: file.mimetype || "application/octet-stream",
        sizeBytes: file.size,
      },
    });

    await this.auditLog.record({
      userId: actorUserId,
      action: "product.file_attached",
      entity: "Product",
      entityId: productId,
      metadata: { fileId: record.id, originalName: record.originalName },
    });

    return this.present(record);
  }

  async listForProduct(productId: string) {
    const files = await this.prisma.productFile.findMany({
      where: { productId },
      orderBy: { createdAt: "asc" },
    });
    return files.map((file) => this.present(file));
  }

  async remove(fileId: string, actorUserId: string): Promise<void> {
    const file = await this.prisma.productFile.findUnique({ where: { id: fileId } });
    if (!file) throw new NotFoundException("File not found");

    await this.prisma.productFile.delete({ where: { id: fileId } });
    await this.storage.delete(file.storageKey);

    await this.auditLog.record({
      userId: actorUserId,
      action: "product.file_removed",
      entity: "Product",
      entityId: file.productId,
      metadata: { fileId, originalName: file.originalName },
    });
  }

  /** Everything the signed-in user is entitled to download. */
  async listMine(userId: string) {
    const items = await this.prisma.orderItem.findMany({
      where: {
        order: {
          userId,
          deletedAt: null,
          status: { in: [...SETTLED_ORDER_STATUSES] },
        },
        product: { files: { some: {} } },
      },
      select: {
        titleSnapshot: true,
        order: { select: { orderNumber: true, createdAt: true } },
        product: {
          select: {
            id: true,
            title: true,
            slug: true,
            files: true,
          },
        },
      },
      orderBy: { id: "desc" },
    });

    // One product bought twice should appear once, not once per order.
    const seen = new Set<string>();
    return items.flatMap((item) => {
      if (seen.has(item.product.id)) return [];
      seen.add(item.product.id);
      return [
        {
          productId: item.product.id,
          productTitle: item.product.title,
          productSlug: item.product.slug,
          orderNumber: item.order.orderNumber,
          purchasedAt: item.order.createdAt,
          files: item.product.files.map((file) => this.present(file)),
        },
      ];
    });
  }

  /**
   * Resolves a file for download, refusing anyone without an entitlement.
   *
   * The refusal is a 403 with a reason rather than a 404: the caller already
   * knows the file id (they got it from a listing), so hiding its existence
   * buys nothing and a vague error just generates support tickets.
   */
  async openForUser(fileId: string, user: { id: string; roles: string[] }) {
    const file = await this.prisma.productFile.findUnique({
      where: { id: fileId },
      include: {
        product: {
          select: {
            id: true,
            title: true,
            vendor: { select: { userId: true } },
          },
        },
      },
    });
    if (!file) throw new NotFoundException("File not found");

    const orders = await this.prisma.orderItem.findMany({
      where: { productId: file.productId, order: { userId: user.id, deletedAt: null } },
      select: { order: { select: { status: true } } },
    });

    const decision = canDownload({
      roles: user.roles,
      productVendorUserId: file.product.vendor?.userId ?? null,
      requestingUserId: user.id,
      purchasedOrderStatuses: orders.map((o) => o.order.status),
    });

    if (!decision.allowed) {
      throw new ForbiddenException(
        decision.reason === "not-purchased"
          ? "You haven't purchased this product."
          : "This download unlocks once the order is paid for. Cancelled and refunded orders don't include it.",
      );
    }

    await this.auditLog.record({
      userId: user.id,
      action: "product.file_downloaded",
      entity: "Product",
      entityId: file.productId,
      metadata: { fileId: file.id },
    });

    return {
      stream: await this.storage.readStream(file.storageKey),
      filename: file.originalName,
      contentType: file.contentType,
      sizeBytes: file.sizeBytes,
    };
  }

  private present(file: {
    id: string;
    originalName: string;
    contentType: string;
    sizeBytes: number;
    createdAt: Date;
  }) {
    // Deliberately omits storageKey. A client never needs it, and publishing
    // it would invite someone to try addressing the file directly.
    return {
      id: file.id,
      originalName: file.originalName,
      contentType: file.contentType,
      sizeBytes: file.sizeBytes,
      createdAt: file.createdAt,
    };
  }
}
