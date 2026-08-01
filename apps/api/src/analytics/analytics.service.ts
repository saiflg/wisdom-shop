import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Order statuses that represent money actually taken. Revenue must never
 * count PENDING (not paid yet) or CANCELLED/REFUNDED (money returned) — the
 * same rule vendor earnings uses, kept consistent deliberately.
 *
 * PARTIALLY_REFUNDED counts, because most of that money is still ours — but
 * its *gross* total overstates what was kept, so settled refunds are
 * subtracted below. Leaving the order out entirely would understate revenue
 * by the whole order to avoid overstating it by the refund.
 */
const SETTLED_STATUSES = [
  "PAID",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "PARTIALLY_REFUNDED",
] as const;

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(days = 30) {
    const since = new Date(Date.now() - days * 86_400_000);

    const [
      settledAgg,
      settledCount,
      pendingCount,
      refundedCount,
      recentSettled,
      customerCount,
      productCount,
      pendingVendors,
      licenseCount,
      byStatus,
      settledCurrencies,
      refundAgg,
      windowRefundAgg,
    ] = await Promise.all([
      this.prisma.order.aggregate({
        where: { deletedAt: null, status: { in: [...SETTLED_STATUSES] } },
        _sum: { totalCents: true },
      }),
      this.prisma.order.count({ where: { deletedAt: null, status: { in: [...SETTLED_STATUSES] } } }),
      this.prisma.order.count({ where: { deletedAt: null, status: "PENDING" } }),
      this.prisma.order.count({ where: { deletedAt: null, status: "REFUNDED" } }),
      this.prisma.order.aggregate({
        where: { deletedAt: null, status: { in: [...SETTLED_STATUSES] }, createdAt: { gte: since } },
        _sum: { totalCents: true },
        _count: true,
      }),
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.product.count({ where: { deletedAt: null, status: "PUBLISHED" } }),
      this.prisma.vendor.count({ where: { deletedAt: null, status: "PENDING" } }),
      this.prisma.license.count({ where: { status: "ACTIVE" } }),
      this.prisma.order.groupBy({
        by: ["status"],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.order.findMany({
        where: { deletedAt: null, status: { in: [...SETTLED_STATUSES] } },
        distinct: ["currency"],
        select: { currency: true },
      }),
      // Only SUCCEEDED refunds reduce revenue. A PENDING one has not moved
      // yet and a FAILED one never will, so counting either would understate
      // what was actually kept.
      this.prisma.refund.aggregate({
        where: { status: "SUCCEEDED", order: { deletedAt: null, status: { in: [...SETTLED_STATUSES] } } },
        _sum: { amountCents: true },
      }),
      this.prisma.refund.aggregate({
        where: {
          status: "SUCCEEDED",
          order: {
            deletedAt: null,
            status: { in: [...SETTLED_STATUSES] },
            createdAt: { gte: since } },
        },
        _sum: { amountCents: true },
      }),
    ]);

    const grossCents = settledAgg._sum.totalCents ?? 0;
    const recentCents = recentSettled._sum.totalCents ?? 0;
    const refundedCents = refundAgg._sum.amountCents ?? 0;
    const windowRefundedCents = windowRefundAgg._sum.amountCents ?? 0;

    // Clamped: a refund ledger larger than the orders it belongs to would
    // otherwise report negative revenue, which reads as a bug rather than
    // the data problem it actually is.
    const netCents = Math.max(0, grossCents - refundedCents);
    const windowNetCents = Math.max(0, recentCents - windowRefundedCents);

    return {
      revenue: {
        // Every currency present among settled orders. Checkout rejects
        // mixed-currency carts, so each order is internally consistent — but
        // summing ACROSS orders is only meaningful when this list holds one
        // entry. It is reported rather than assumed so the caller can say so
        // instead of silently labelling the total with the wrong symbol.
        currencies: settledCurrencies.map((row) => row.currency).sort(),
        settledGrossCents: grossCents,
        // What was actually kept. Gross is reported alongside rather than
        // replaced, because "we took X and gave back Y" is the question
        // finance asks, and a single netted number cannot answer it.
        refundedCents,
        settledNetCents: netCents,
        settledOrderCount: settledCount,
        averageOrderValueCents: settledCount > 0 ? Math.round(netCents / settledCount) : 0,
        windowDays: days,
        windowGrossCents: recentCents,
        windowRefundedCents,
        windowNetCents,
        windowOrderCount: recentSettled._count,
      },
      orders: {
        pending: pendingCount,
        refunded: refundedCount,
        byStatus: Object.fromEntries(byStatus.map((row) => [row.status, row._count._all])),
      },
      catalog: { publishedProducts: productCount },
      customers: { total: customerCount },
      vendors: { awaitingApproval: pendingVendors },
      licenses: { active: licenseCount },
    };
  }

  /** Best-selling products by settled quantity, for the admin overview. */
  async topProducts(limit = 5) {
    const rows = await this.prisma.orderItem.groupBy({
      by: ["productId"],
      where: { order: { deletedAt: null, status: { in: [...SETTLED_STATUSES] } } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: limit,
    });

    if (rows.length === 0) return [];

    const products = await this.prisma.product.findMany({
      where: { id: { in: rows.map((r) => r.productId) } },
      select: { id: true, title: true, slug: true, priceCents: true, currency: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    return rows.flatMap((row) => {
      const product = byId.get(row.productId);
      if (!product) return [];
      return [{ ...product, unitsSold: row._sum.quantity ?? 0 }];
    });
  }
}
