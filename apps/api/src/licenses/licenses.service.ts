import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { License, Prisma, ProductType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../common/audit/audit-log.service";
import { MailerService } from "../common/mailer/mailer.service";
import type { EnvConfig } from "../config/env.validation";
import { generateLicenseKey } from "./license-key";
import { createHandoffToken } from "./edu-handoff";

/**
 * Product types that produce a license on purchase. `SUBSCRIPTION` and
 * `MEMBERSHIP` are included because they also gate access and need an expiry;
 * plain `DIGITAL`/`DOWNLOADABLE` goods do not — those are downloads, not
 * activations.
 */
const LICENSABLE_TYPES: ProductType[] = ["SOFTWARE", "LICENSE", "SUBSCRIPTION", "MEMBERSHIP"];

/** Handoff tokens are for an immediate redirect, so they live briefly. */
const HANDOFF_TTL_SECONDS = 300;

const LICENSE_INCLUDE = {
  product: { select: { id: true, title: true, slug: true, type: true } },
  order: { select: { orderNumber: true, createdAt: true } },
} satisfies Prisma.LicenseInclude;

@Injectable()
export class LicensesService {
  private readonly logger = new Logger(LicensesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly auditLog: AuditLogService,
    private readonly mailer: MailerService,
  ) {}

  /**
   * Issues licenses for every licensable line on a paid order.
   *
   * Called from the payment webhook path, which providers redeliver, so this
   * must be safe to run repeatedly: `License.orderItemId` is UNIQUE and each
   * insert is guarded, so a redelivery is a no-op rather than a second key.
   * Never throws into the caller — a licensing failure must not cause a
   * webhook to be retried forever after the payment itself succeeded.
   */
  async issueForOrder(orderId: string): Promise<License[]> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: { items: { include: { product: true } } },
      });
      if (!order) return [];

      const issued: License[] = [];

      for (const item of order.items) {
        if (!LICENSABLE_TYPES.includes(item.product.type)) continue;

        const existing = await this.prisma.license.findUnique({ where: { orderItemId: item.id } });
        if (existing) continue;

        // Subscription-style products carry their term in metadata; anything
        // else is perpetual until explicitly revoked.
        const metadata = (item.product.metadata ?? {}) as { licenseDurationDays?: number };
        const durationDays =
          typeof metadata.licenseDurationDays === "number" ? metadata.licenseDurationDays : null;
        const expiresAt =
          durationDays === null ? null : new Date(Date.now() + durationDays * 86_400_000);

        try {
          const license = await this.prisma.license.create({
            data: {
              key: generateLicenseKey(),
              userId: order.userId,
              productId: item.productId,
              orderId: order.id,
              orderItemId: item.id,
              // One license per line, carrying quantity as seats, rather than
              // N separate keys for a quantity of N.
              seats: item.quantity,
              expiresAt,
            },
          });
          issued.push(license);
        } catch (error) {
          // A concurrent redelivery won the unique constraint — that's the
          // idempotency guard doing its job, not an error.
          if ((error as { code?: string }).code === "P2002") continue;
          throw error;
        }
      }

      if (issued.length > 0) {
        await this.auditLog.record({
          userId: order.userId,
          action: "license.issued",
          entity: "Order",
          entityId: order.id,
          metadata: { count: issued.length, orderNumber: order.orderNumber },
        });
        await this.sendLicenseEmail(order.userId, order.orderNumber, issued);
      }

      return issued;
    } catch (error) {
      this.logger.error(
        `Failed to issue licenses for order ${orderId}: ${(error as Error).message}`,
      );
      return [];
    }
  }

  listForUser(userId: string) {
    return this.prisma.license.findMany({
      where: { userId },
      include: LICENSE_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
  }

  /** Scoped by userId so another customer's key returns 404, not a license. */
  async findOwned(userId: string, key: string) {
    const license = await this.prisma.license.findFirst({
      where: { key, userId },
      include: LICENSE_INCLUDE,
    });
    if (!license) throw new NotFoundException("License not found");
    return license;
  }

  /**
   * Builds the "Complete Your School Setup" redirect: a short-lived signed
   * token the separate EMS portal can verify without calling back here.
   */
  async createSetupHandoff(userId: string, key: string) {
    const license = await this.findOwned(userId, key);

    if (license.status !== "ACTIVE") {
      throw new BadRequestException(`This license is ${license.status.toLowerCase()}`);
    }
    if (license.expiresAt && license.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException("This license has expired");
    }

    const token = createHandoffToken(
      { k: license.key, u: license.userId, p: license.productId, o: license.orderId },
      this.config.get("EDU_SETUP_SIGNING_SECRET", { infer: true }),
      HANDOFF_TTL_SECONDS,
    );

    const base = this.config.get("EDU_SETUP_REDIRECT_URL", { infer: true });
    const url = new URL(base);
    url.searchParams.set("token", token);

    await this.auditLog.record({
      userId,
      action: "license.setup_handoff",
      entity: "License",
      entityId: license.id,
      metadata: { key: license.key },
    });

    return { redirectUrl: url.toString(), expiresInSeconds: HANDOFF_TTL_SECONDS };
  }

  /** Admin/support revocation — e.g. after a refund or a licence dispute. */
  async revoke(key: string, actorUserId: string) {
    const license = await this.prisma.license.findUnique({ where: { key } });
    if (!license) throw new NotFoundException("License not found");

    const updated = await this.prisma.license.update({
      where: { key },
      data: { status: "REVOKED" },
    });

    await this.auditLog.record({
      userId: actorUserId,
      action: "license.revoked",
      entity: "License",
      entityId: license.id,
      metadata: { key },
    });

    return updated;
  }

  private async sendLicenseEmail(
    userId: string,
    orderNumber: string,
    licenses: License[],
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) return;

    const rows = licenses
      .map((l) => `<li><code>${l.key}</code>${l.seats > 1 ? ` — ${l.seats} seats` : ""}</li>`)
      .join("");

    await this.mailer.send({
      to: user.email,
      subject: `Your license keys for order ${orderNumber}`,
      html: `<p>Thanks for your purchase. Your license ${licenses.length === 1 ? "key is" : "keys are"}:</p>
<ul>${rows}</ul>
<p>Sign in and choose <strong>Complete Your School Setup</strong> to activate.</p>`,
    });
  }
}
