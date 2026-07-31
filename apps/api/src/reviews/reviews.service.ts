import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../common/audit/audit-log.service";
import { canReview, summariseRatings, type RatingSummary } from "./review-policy";

const REVIEW_SELECT = {
  id: true,
  rating: true,
  title: true,
  body: true,
  createdAt: true,
  updatedAt: true,
  userId: true,
  user: { select: { firstName: true, lastName: true } },
} satisfies Prisma.ReviewSelect;

/** Staff who may remove a review that breaks the rules. */
const MODERATORS = ["ADMIN", "SUPER_ADMIN", "MANAGER", "EDITOR", "SUPPORT"];

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  private async productBySlug(slug: string) {
    const product = await this.prisma.product.findFirst({
      where: { slug, status: "PUBLISHED", deletedAt: null },
      select: { id: true, title: true },
    });
    if (!product) throw new NotFoundException("Product not found");
    return product;
  }

  /** Public listing plus the summary, so a page needs one request not two. */
  async listForProduct(slug: string, query: { page?: number; limit?: number }) {
    const product = await this.productBySlug(slug);
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const where: Prisma.ReviewWhereInput = { productId: product.id, deletedAt: null };

    const [data, total, all] = await Promise.all([
      this.prisma.review.findMany({
        where,
        select: REVIEW_SELECT,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.review.count({ where }),
      // Every rating, for the summary. Cheap at this size; if review volume
      // ever makes it not, this is the query to replace with a groupBy.
      this.prisma.review.findMany({ where, select: { rating: true } }),
    ]);

    return {
      data: data.map((review) => this.present(review)),
      summary: summariseRatings(all.map((r) => r.rating)),
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  /** Rating summaries for many products at once, for listing pages. */
  async summariesFor(productIds: string[]): Promise<Record<string, RatingSummary>> {
    if (productIds.length === 0) return {};

    const rows = await this.prisma.review.findMany({
      where: { productId: { in: productIds }, deletedAt: null },
      select: { productId: true, rating: true },
    });

    const byProduct = new Map<string, number[]>();
    for (const row of rows) {
      const list = byProduct.get(row.productId) ?? [];
      list.push(row.rating);
      byProduct.set(row.productId, list);
    }

    return Object.fromEntries(
      productIds.map((id) => [id, summariseRatings(byProduct.get(id) ?? [])]),
    );
  }

  /** What the signed-in user may do here, so the UI can say so up front. */
  async eligibility(slug: string, userId: string) {
    const product = await this.productBySlug(slug);

    const [orders, existing] = await Promise.all([
      this.prisma.orderItem.findMany({
        where: { productId: product.id, order: { userId, deletedAt: null } },
        select: { order: { select: { status: true } } },
      }),
      this.prisma.review.findFirst({
        where: { productId: product.id, userId, deletedAt: null },
        select: REVIEW_SELECT,
      }),
    ]);

    const decision = canReview({
      purchasedOrderStatuses: orders.map((o) => o.order.status),
      hasExistingReview: existing !== null,
    });

    return {
      canReview: decision.allowed,
      reason: decision.allowed ? null : decision.reason,
      // Returned so the form can start populated when they are editing.
      yourReview: existing ? this.present(existing) : null,
    };
  }

  async create(
    slug: string,
    userId: string,
    input: { rating: number; title?: string; body?: string },
  ) {
    const product = await this.productBySlug(slug);

    const [orders, existing] = await Promise.all([
      this.prisma.orderItem.findMany({
        where: { productId: product.id, order: { userId, deletedAt: null } },
        select: { order: { select: { status: true } } },
      }),
      this.prisma.review.findFirst({
        where: { productId: product.id, userId, deletedAt: null },
        select: { id: true },
      }),
    ]);

    const decision = canReview({
      purchasedOrderStatuses: orders.map((o) => o.order.status),
      hasExistingReview: existing !== null,
    });

    if (!decision.allowed) {
      if (decision.reason === "already-reviewed") {
        throw new ConflictException("You've already reviewed this product. Edit that review instead.");
      }
      throw new ForbiddenException(
        decision.reason === "not-purchased"
          ? "Only customers who bought this product can review it."
          : "You can review this once the order has been paid for.",
      );
    }

    // A previously soft-deleted review still occupies the unique
    // (productId, userId) slot, so it is revived rather than duplicated.
    const review = await this.prisma.review.upsert({
      where: { productId_userId: { productId: product.id, userId } },
      create: {
        productId: product.id,
        userId,
        rating: input.rating,
        title: input.title,
        body: input.body,
      },
      update: {
        rating: input.rating,
        title: input.title,
        body: input.body,
        deletedAt: null,
      },
      select: REVIEW_SELECT,
    });

    await this.auditLog.record({
      userId,
      action: "review.created",
      entity: "Product",
      entityId: product.id,
      metadata: { reviewId: review.id, rating: input.rating },
    });

    return this.present(review);
  }

  async update(
    reviewId: string,
    userId: string,
    input: { rating?: number; title?: string; body?: string },
  ) {
    const existing = await this.prisma.review.findFirst({
      where: { id: reviewId, deletedAt: null },
      select: { id: true, userId: true },
    });
    if (!existing) throw new NotFoundException("Review not found");

    // Only the author edits their own words. Moderators can remove a review
    // but never rewrite one — a changed review still carries the author's
    // name, so editing it would put words in their mouth.
    if (existing.userId !== userId) {
      throw new ForbiddenException("You can only edit your own review");
    }

    const review = await this.prisma.review.update({
      where: { id: reviewId },
      data: input,
      select: REVIEW_SELECT,
    });
    return this.present(review);
  }

  async remove(reviewId: string, actor: { id: string; roles: string[] }) {
    const existing = await this.prisma.review.findFirst({
      where: { id: reviewId, deletedAt: null },
      select: { id: true, userId: true, productId: true },
    });
    if (!existing) throw new NotFoundException("Review not found");

    const isModerator = actor.roles.some((role) => MODERATORS.includes(role));
    if (existing.userId !== actor.id && !isModerator) {
      throw new ForbiddenException("You can only remove your own review");
    }

    // Soft-deleted, so removing and re-reviewing does not fight the unique
    // constraint, and so moderation is auditable rather than silent.
    await this.prisma.review.update({
      where: { id: reviewId },
      data: { deletedAt: new Date() },
    });

    await this.auditLog.record({
      userId: actor.id,
      action: isModerator && existing.userId !== actor.id ? "review.moderated" : "review.removed",
      entity: "Product",
      entityId: existing.productId,
      metadata: { reviewId, authorUserId: existing.userId },
    });
  }

  private present(review: {
    id: string;
    rating: number;
    title: string | null;
    body: string | null;
    createdAt: Date;
    updatedAt: Date;
    userId: string;
    user: { firstName: string; lastName: string };
  }) {
    return {
      id: review.id,
      rating: review.rating,
      title: review.title,
      body: review.body,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
      // First name and last initial only. A review page is public, and a
      // full name plus a purchase history is more than a customer agreed to
      // publish by leaving a rating.
      authorName: `${review.user.firstName} ${review.user.lastName.charAt(0)}.`.trim(),
      authorUserId: review.userId,
    };
  }
}
