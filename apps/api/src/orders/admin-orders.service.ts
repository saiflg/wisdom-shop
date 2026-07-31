import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Order, OrderStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../common/audit/audit-log.service";
import { MailerService } from "../common/mailer/mailer.service";
import { canTransition, isAlreadyInState } from "../payments/order-status";
import type { QueryAdminOrdersDto } from "./dto/admin-order.dto";

const ADMIN_ORDER_INCLUDE = {
  items: true,
  address: true,
  payments: {
    select: { id: true, provider: true, status: true, amountCents: true, currency: true, createdAt: true },
  },
  user: { select: { id: true, email: true, firstName: true, lastName: true } },
  statusHistory: {
    orderBy: { createdAt: "desc" as const },
    include: { changedByUser: { select: { id: true, email: true } } },
  },
} satisfies Prisma.OrderInclude;

@Injectable()
export class AdminOrdersService {
  private readonly logger = new Logger(AdminOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly mailer: MailerService,
  ) {}

  async list(query: QueryAdminOrdersDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    if (query.from && query.to && new Date(query.from) > new Date(query.to)) {
      throw new BadRequestException("`from` must not be after `to`");
    }

    const where: Prisma.OrderWhereInput = {
      deletedAt: null,
      status: query.status,
      createdAt: {
        gte: query.from ? new Date(query.from) : undefined,
        lte: query.to ? new Date(query.to) : undefined,
      },
      // Staff search by whichever identifier the customer quotes them.
      ...(query.search
        ? {
            OR: [
              { orderNumber: { contains: query.search, mode: "insensitive" as const } },
              { user: { email: { contains: query.search, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: ADMIN_ORDER_INCLUDE,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
  }

  async findByOrderNumber(orderNumber: string) {
    const order = await this.prisma.order.findFirst({
      where: { orderNumber, deletedAt: null },
      include: ADMIN_ORDER_INCLUDE,
    });
    if (!order) throw new NotFoundException("Order not found");
    return order;
  }

  /**
   * Moves an order to a new status, enforcing the shared transition table and
   * recording who did it.
   *
   * Cancelling returns the order's items to stock — otherwise every cancelled
   * order silently leaks inventory. `Order.stockRestored` makes that
   * idempotent: it is set inside the same transaction, so a concurrent or
   * repeated cancellation cannot double-credit stock.
   */
  async updateStatus(
    orderNumber: string,
    nextStatus: OrderStatus,
    actorUserId: string,
    note?: string,
  ): Promise<Order> {
    const order = await this.prisma.order.findFirst({
      where: { orderNumber, deletedAt: null },
      include: { items: true },
    });
    if (!order) throw new NotFoundException("Order not found");

    if (isAlreadyInState(order.status, nextStatus)) {
      throw new ConflictException(`Order is already ${nextStatus.toLowerCase()}`);
    }
    if (!canTransition(order.status, nextStatus)) {
      throw new ConflictException(
        `Cannot move an order from ${order.status} to ${nextStatus}`,
      );
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      if (nextStatus === "CANCELLED" && !order.stockRestored) {
        for (const item of order.items) {
          if (item.variantId) {
            // Only restore tracked stock; null means untracked/unlimited.
            await tx.productVariant.updateMany({
              where: { id: item.variantId, stockQty: { not: null } },
              data: { stockQty: { increment: item.quantity } },
            });
          } else {
            await tx.product.updateMany({
              where: { id: item.productId, stockQty: { not: null } },
              data: { stockQty: { increment: item.quantity } },
            });
          }
        }
      }

      const result = await tx.order.update({
        where: { id: order.id },
        data: {
          status: nextStatus,
          shippedAt: nextStatus === "SHIPPED" ? now : undefined,
          deliveredAt: nextStatus === "DELIVERED" ? now : undefined,
          cancelledAt: nextStatus === "CANCELLED" ? now : undefined,
          stockRestored: nextStatus === "CANCELLED" ? true : undefined,
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: nextStatus,
          changedByUserId: actorUserId,
          note,
        },
      });

      return result;
    });

    await this.auditLog.record({
      userId: actorUserId,
      action: "order.status_changed",
      entity: "Order",
      entityId: order.id,
      metadata: { orderNumber, from: order.status, to: nextStatus, note },
    });

    await this.notifyCustomer(order.userId, orderNumber, nextStatus);

    return updated;
  }

  /**
   * Records carrier and tracking number. Allowed while the order is paid or
   * in progress — but not once it's cancelled or refunded, where a tracking
   * number would be meaningless.
   */
  async updateShipment(
    orderNumber: string,
    carrier: string,
    trackingNumber: string,
    actorUserId: string,
  ): Promise<Order> {
    const order = await this.prisma.order.findFirst({
      where: { orderNumber, deletedAt: null },
      select: { id: true, status: true, userId: true },
    });
    if (!order) throw new NotFoundException("Order not found");

    if (order.status === "PENDING") {
      throw new ConflictException("Cannot add tracking to an unpaid order");
    }
    if (order.status === "CANCELLED" || order.status === "REFUNDED") {
      throw new ConflictException(`Cannot add tracking to a ${order.status.toLowerCase()} order`);
    }

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: { carrier, trackingNumber },
    });

    await this.auditLog.record({
      userId: actorUserId,
      action: "order.shipment_updated",
      entity: "Order",
      entityId: order.id,
      metadata: { orderNumber, carrier, trackingNumber },
    });

    return updated;
  }

  private async notifyCustomer(userId: string, orderNumber: string, status: OrderStatus): Promise<void> {
    // Only statuses the customer actually cares about receiving mail for.
    const subjects: Partial<Record<OrderStatus, string>> = {
      SHIPPED: `Your order ${orderNumber} has shipped`,
      DELIVERED: `Your order ${orderNumber} was delivered`,
      CANCELLED: `Your order ${orderNumber} was cancelled`,
      REFUNDED: `Your order ${orderNumber} was refunded`,
    };
    const subject = subjects[status];
    if (!subject) return;

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) return;

    await this.mailer.send({
      to: user.email,
      subject,
      html: `<p>Your order <strong>${orderNumber}</strong> is now <strong>${status.toLowerCase()}</strong>.</p>
<p>You can view it in your account.</p>`,
    });
  }
}
