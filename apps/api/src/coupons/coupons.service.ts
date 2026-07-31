import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../common/audit/audit-log.service";
import {
  evaluateCoupon,
  isWellFormed,
  normaliseCode,
  type CouponDecision,
} from "./coupon-policy";

/** The transaction client shape, so redemption can join the checkout tx. */
type TxClient = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

@Injectable()
export class CouponsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  /** Checks a code against a subtotal without consuming it. */
  async preview(code: string, subtotalCents: number): Promise<CouponDecision & { code: string }> {
    const normalised = normaliseCode(code);
    const coupon = await this.prisma.coupon.findUnique({ where: { code: normalised } });

    if (!coupon) {
      // Deliberately the same shape as any other refusal: whether a code
      // exists is not worth a distinct response, and telling people would
      // turn this into an oracle for guessing valid codes.
      return {
        valid: false,
        reason: "inactive",
        message: "That coupon code isn't valid.",
        code: normalised,
      };
    }

    return { ...evaluateCoupon(coupon, subtotalCents), code: normalised };
  }

  /**
   * Claims one redemption of a coupon, inside the caller's transaction.
   *
   * The increment is a compare-and-swap against the redemption count read a
   * moment ago. Two customers racing for the last use of a coupon both pass
   * `evaluateCoupon`; only one can win the update, and the loser's whole
   * checkout transaction rolls back rather than overselling the discount.
   */
  async redeemWithin(
    tx: TxClient,
    code: string,
    subtotalCents: number,
  ): Promise<{ couponId: string; discountCents: number }> {
    const normalised = normaliseCode(code);
    const coupon = await tx.coupon.findUnique({ where: { code: normalised } });
    if (!coupon) throw new BadRequestException("That coupon code isn't valid.");

    const decision = evaluateCoupon(coupon, subtotalCents);
    if (!decision.valid) throw new BadRequestException(decision.message);

    if (coupon.maxRedemptions !== null) {
      const claimed = await tx.coupon.updateMany({
        // `lt` against the limit read above — a plain increment would let
        // simultaneous checkouts push redeemedCount past maxRedemptions.
        where: { id: coupon.id, redeemedCount: { lt: coupon.maxRedemptions } },
        data: { redeemedCount: { increment: 1 } },
      });
      if (claimed.count === 0) {
        throw new ConflictException("That coupon was just fully redeemed.");
      }
    } else {
      await tx.coupon.update({
        where: { id: coupon.id },
        data: { redeemedCount: { increment: 1 } },
      });
    }

    return { couponId: coupon.id, discountCents: decision.discountCents };
  }

  // --- Administration ------------------------------------------------------

  async list() {
    return this.prisma.coupon.findMany({ orderBy: { createdAt: "desc" } });
  }

  async create(
    input: {
      code: string;
      percentOff?: number;
      amountOffCents?: number;
      minSubtotalCents?: number;
      maxRedemptions?: number;
      expiresAt?: string;
    },
    actorUserId: string,
  ) {
    const code = normaliseCode(input.code);
    if (!code) throw new BadRequestException("A coupon code is required");

    // Refused at creation rather than left to surprise someone at checkout.
    if (!isWellFormed({
      percentOff: input.percentOff ?? null,
      amountOffCents: input.amountOffCents ?? null,
    })) {
      throw new BadRequestException(
        "Set exactly one of a percentage or a fixed amount — not both, and not neither.",
      );
    }

    if (input.percentOff !== undefined && (input.percentOff < 1 || input.percentOff > 100)) {
      throw new BadRequestException("A percentage discount must be between 1 and 100");
    }

    const existing = await this.prisma.coupon.findUnique({ where: { code } });
    if (existing) throw new ConflictException(`A coupon with the code "${code}" already exists`);

    const coupon = await this.prisma.coupon.create({
      data: {
        code,
        percentOff: input.percentOff ?? null,
        amountOffCents: input.amountOffCents ?? null,
        minSubtotalCents: input.minSubtotalCents ?? null,
        maxRedemptions: input.maxRedemptions ?? null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      },
    });

    await this.auditLog.record({
      userId: actorUserId,
      action: "coupon.created",
      entity: "Coupon",
      entityId: coupon.id,
      metadata: { code },
    });

    return coupon;
  }

  async update(
    id: string,
    input: { active?: boolean; maxRedemptions?: number | null; expiresAt?: string | null },
    actorUserId: string,
  ) {
    const existing = await this.prisma.coupon.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Coupon not found");

    const data: Prisma.CouponUpdateInput = {};
    if (input.active !== undefined) data.active = input.active;
    if (input.maxRedemptions !== undefined) data.maxRedemptions = input.maxRedemptions;
    if (input.expiresAt !== undefined) {
      data.expiresAt = input.expiresAt === null ? null : new Date(input.expiresAt);
    }

    // The discount itself is deliberately not editable. Orders snapshot what
    // they were charged, but a code already in circulation changing its value
    // underneath customers is a support problem, not a feature — deactivate
    // it and issue a new one.
    const coupon = await this.prisma.coupon.update({ where: { id }, data });

    await this.auditLog.record({
      userId: actorUserId,
      action: "coupon.updated",
      entity: "Coupon",
      entityId: id,
      metadata: { changes: Object.keys(data) },
    });

    return coupon;
  }

  async remove(id: string, actorUserId: string): Promise<void> {
    const existing = await this.prisma.coupon.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Coupon not found");

    const usedBy = await this.prisma.order.count({ where: { couponId: id } });
    if (usedBy > 0) {
      // Deleting it would orphan the discount recorded on those orders.
      throw new ConflictException(
        `That coupon has been used on ${usedBy} order${usedBy === 1 ? "" : "s"}. Deactivate it instead.`,
      );
    }

    await this.prisma.coupon.delete({ where: { id } });
    await this.auditLog.record({
      userId: actorUserId,
      action: "coupon.deleted",
      entity: "Coupon",
      entityId: id,
      metadata: { code: existing.code },
    });
  }
}
