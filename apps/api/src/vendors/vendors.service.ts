import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Vendor, VendorStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../common/audit/audit-log.service";
import { MailerService } from "../common/mailer/mailer.service";
import { slugify } from "../common/utils/slugify";
import type { ApplyVendorDto } from "./dto/vendor.dto";

/**
 * Allowed vendor status transitions. An application is reviewed once, then a
 * vendor is toggled between APPROVED and SUSPENDED; REJECTED is terminal so a
 * declined applicant re-applies rather than being silently revived.
 */
const ALLOWED_VENDOR_TRANSITIONS: Record<VendorStatus, VendorStatus[]> = {
  PENDING: ["APPROVED", "REJECTED"],
  APPROVED: ["SUSPENDED"],
  SUSPENDED: ["APPROVED"],
  REJECTED: [],
};

@Injectable()
export class VendorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly mailer: MailerService,
  ) {}

  private async ensureUniqueSlug(base: string): Promise<string> {
    let candidate = base;
    let suffix = 1;
    for (;;) {
      const existing = await this.prisma.vendor.findFirst({ where: { slug: candidate } });
      if (!existing) return candidate;
      suffix += 1;
      candidate = `${base}-${suffix}`;
    }
  }

  /** A user applies once; the application starts PENDING and grants nothing yet. */
  async apply(userId: string, dto: ApplyVendorDto): Promise<Vendor> {
    const existing = await this.prisma.vendor.findUnique({ where: { userId } });
    if (existing) {
      throw new ConflictException(
        `You already have a vendor account (status: ${existing.status.toLowerCase()})`,
      );
    }

    const slug = await this.ensureUniqueSlug(dto.slug ? slugify(dto.slug) : slugify(dto.storeName));
    const vendor = await this.prisma.vendor.create({
      data: { userId, storeName: dto.storeName, slug, status: "PENDING" },
    });

    await this.auditLog.record({
      userId,
      action: "vendor.applied",
      entity: "Vendor",
      entityId: vendor.id,
      metadata: { storeName: vendor.storeName },
    });

    return vendor;
  }

  async findMine(userId: string): Promise<Vendor> {
    const vendor = await this.prisma.vendor.findFirst({ where: { userId, deletedAt: null } });
    if (!vendor) throw new NotFoundException("You do not have a vendor account");
    return vendor;
  }

  /**
   * Resolves the caller's vendor id, refusing unless the account is APPROVED.
   * Every vendor-scoped route goes through this, so a PENDING or SUSPENDED
   * vendor cannot act even though they hold the VENDOR role.
   */
  async requireApprovedVendorId(userId: string): Promise<string> {
    const vendor = await this.prisma.vendor.findFirst({ where: { userId, deletedAt: null } });
    if (!vendor) throw new NotFoundException("You do not have a vendor account");
    if (vendor.status !== "APPROVED") {
      throw new ForbiddenException(
        `Your vendor account is ${vendor.status.toLowerCase()} and cannot manage products`,
      );
    }
    return vendor.id;
  }

  async listForAdmin(status?: VendorStatus) {
    return this.prisma.vendor.findMany({
      where: { status, deletedAt: null },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async findForAdmin(id: string) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id, deletedAt: null },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });
    if (!vendor) throw new NotFoundException("Vendor not found");
    return vendor;
  }

  /**
   * Approve / suspend / reject. Approving also grants the VENDOR role, and
   * suspending revokes it, so role membership always matches vendor state
   * rather than drifting apart.
   */
  async updateStatus(
    vendorId: string,
    nextStatus: VendorStatus,
    actorUserId: string,
    commissionPct?: number,
  ): Promise<Vendor> {
    const vendor = await this.prisma.vendor.findFirst({ where: { id: vendorId, deletedAt: null } });
    if (!vendor) throw new NotFoundException("Vendor not found");

    if (vendor.status === nextStatus) {
      throw new ConflictException(`Vendor is already ${nextStatus.toLowerCase()}`);
    }
    if (!ALLOWED_VENDOR_TRANSITIONS[vendor.status].includes(nextStatus)) {
      throw new ConflictException(`Cannot move a vendor from ${vendor.status} to ${nextStatus}`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.vendor.update({
        where: { id: vendorId },
        data: {
          status: nextStatus,
          commissionPct: commissionPct ?? undefined,
        },
      });

      const vendorRole = await tx.role.upsert({
        where: { name: "VENDOR" },
        update: {},
        create: { name: "VENDOR" },
      });

      if (nextStatus === "APPROVED") {
        await tx.userRole.upsert({
          where: { userId_roleId: { userId: vendor.userId, roleId: vendorRole.id } },
          update: {},
          create: { userId: vendor.userId, roleId: vendorRole.id },
        });
      } else {
        await tx.userRole.deleteMany({ where: { userId: vendor.userId, roleId: vendorRole.id } });
      }

      return result;
    });

    await this.auditLog.record({
      userId: actorUserId,
      action: "vendor.status_changed",
      entity: "Vendor",
      entityId: vendorId,
      metadata: { from: vendor.status, to: nextStatus, commissionPct },
    });

    await this.notifyApplicant(vendor.userId, updated);

    return updated;
  }

  /**
   * Order lines belonging to this vendor, with the commission that was
   * snapshotted when the order was placed.
   */
  async earnings(vendorId: string) {
    const items = await this.prisma.orderItem.findMany({
      where: { vendorId, order: { deletedAt: null } },
      include: {
        order: { select: { orderNumber: true, status: true, currency: true, createdAt: true } },
      },
      orderBy: { id: "desc" },
    });

    const lines = items.map((item) => {
      const grossCents = item.unitPriceCents * item.quantity;
      const commissionCents = item.commissionCents ?? 0;
      return {
        orderNumber: item.order.orderNumber,
        orderStatus: item.order.status,
        placedAt: item.order.createdAt,
        currency: item.order.currency,
        title: item.titleSnapshot,
        quantity: item.quantity,
        grossCents,
        commissionCents,
        netCents: grossCents - commissionCents,
      };
    });

    // Only settled orders count toward payable earnings. PENDING isn't paid
    // for yet; CANCELLED/REFUNDED money went back to the customer.
    const payableStatuses = new Set(["PAID", "PROCESSING", "SHIPPED", "DELIVERED"]);
    const payable = lines.filter((l) => payableStatuses.has(l.orderStatus));

    return {
      lines,
      totals: {
        currency: lines[0]?.currency ?? "USD",
        grossCents: payable.reduce((sum, l) => sum + l.grossCents, 0),
        commissionCents: payable.reduce((sum, l) => sum + l.commissionCents, 0),
        netCents: payable.reduce((sum, l) => sum + l.netCents, 0),
        payableLineCount: payable.length,
        excludedLineCount: lines.length - payable.length,
      },
    };
  }

  private async notifyApplicant(userId: string, vendor: Vendor): Promise<void> {
    const subjects: Partial<Record<VendorStatus, string>> = {
      APPROVED: "Your Wisdom Shop vendor application was approved",
      REJECTED: "Your Wisdom Shop vendor application was not approved",
      SUSPENDED: "Your Wisdom Shop vendor account has been suspended",
    };
    const subject = subjects[vendor.status];
    if (!subject) return;

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) return;

    await this.mailer.send({
      to: user.email,
      subject,
      html: `<p>Your vendor account <strong>${vendor.storeName}</strong> is now <strong>${vendor.status.toLowerCase()}</strong>.</p>`,
    });
  }
}
