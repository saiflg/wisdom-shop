import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Order, Prisma, ProductType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../common/audit/audit-log.service";
import { MailerService } from "../common/mailer/mailer.service";
import type { EnvConfig } from "../config/env.validation";
import { calculateOrderTotals } from "./pricing";
import { CouponsService } from "../coupons/coupons.service";
import { generateOrderNumber } from "./order-number";
import type { CreateOrderDto } from "./dto/create-order.dto";

/**
 * Product types that need a shipping address. BUNDLE is intentionally
 * excluded for now: a bundle *could* contain physical goods, but nothing
 * models bundle contents yet, so treating it as shippable would invent a
 * charge. Revisit when bundles are implemented.
 */
const SHIPPABLE_TYPES: ProductType[] = ["PHYSICAL"];

const ORDER_INCLUDE = {
  items: true,
  address: true,
  payments: true,
} satisfies Prisma.OrderInclude;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly auditLog: AuditLogService,
    private readonly mailer: MailerService,
    private readonly coupons: CouponsService,
  ) {}

  /** Everything the checkout page needs to show totals before committing. */
  async preview(userId: string) {
    const { lines, currency, requiresShipping } = await this.loadCartForCheckout(userId);
    const subtotalCents = lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);
    const totals = calculateOrderTotals({ subtotalCents, requiresShipping }, this.pricingConfig());

    return {
      currency,
      requiresShipping,
      items: lines.map((l) => ({
        productId: l.productId,
        variantId: l.variantId,
        title: l.titleSnapshot,
        unitPriceCents: l.unitPriceCents,
        quantity: l.quantity,
        lineTotalCents: l.unitPriceCents * l.quantity,
      })),
      ...totals,
    };
  }

  async createFromCart(userId: string, dto: CreateOrderDto): Promise<Order> {
    const { cartId, lines, currency, requiresShipping } = await this.loadCartForCheckout(userId);

    if (requiresShipping && !dto.addressId) {
      throw new BadRequestException("A shipping address is required for physical items");
    }

    if (dto.addressId) {
      const address = await this.prisma.address.findFirst({
        where: { id: dto.addressId, userId, deletedAt: null },
      });
      if (!address) throw new NotFoundException("Address not found");
    }

    const subtotalCents = lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);

    // Evaluated before the transaction so an invalid code fails fast without
    // touching stock. It is *redeemed* inside the transaction below, where
    // the compare-and-swap lives.
    const preview = dto.couponCode
      ? await this.coupons.preview(dto.couponCode, subtotalCents)
      : null;
    if (preview && !preview.valid) {
      throw new BadRequestException(preview.message);
    }

    const totals = calculateOrderTotals(
      { subtotalCents, requiresShipping, discountCents: preview?.valid ? preview.discountCents : 0 },
      this.pricingConfig(),
    );

    // If the customer was shown a different total, stop and tell them what
    // changed instead of quietly charging the new amount.
    if (dto.expectedTotalCents !== undefined && dto.expectedTotalCents !== totals.totalCents) {
      throw new ConflictException({
        message: "Prices changed while you were checking out. Review the new total and try again.",
        expectedTotalCents: dto.expectedTotalCents,
        actualTotalCents: totals.totalCents,
      });
    }

    const order = await this.prisma.$transaction(async (tx) => {
      // Claimed inside the transaction, so a later stock conflict rolls the
      // redemption back rather than burning a use of the coupon on an order
      // that never existed.
      const redemption = dto.couponCode
        ? await this.coupons.redeemWithin(tx, dto.couponCode, subtotalCents)
        : null;

      // Compare-and-swap each stocked line. `updateMany` with a `gte` guard
      // decrements only if enough is still on hand, so two simultaneous
      // checkouts for the last unit cannot both succeed — the loser sees
      // count === 0 and the whole transaction rolls back.
      for (const line of lines) {
        if (line.variantId) {
          if (line.variantStockQty === null) continue;
          const res = await tx.productVariant.updateMany({
            where: { id: line.variantId, stockQty: { gte: line.quantity } },
            data: { stockQty: { decrement: line.quantity } },
          });
          if (res.count === 0) {
            throw new ConflictException(`"${line.titleSnapshot}" just went out of stock`);
          }
        } else {
          if (line.productStockQty === null) continue;
          const res = await tx.product.updateMany({
            where: { id: line.productId, stockQty: { gte: line.quantity } },
            data: { stockQty: { decrement: line.quantity } },
          });
          if (res.count === 0) {
            throw new ConflictException(`"${line.titleSnapshot}" just went out of stock`);
          }
        }
      }

      const created = await tx.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          userId,
          addressId: dto.addressId,
          status: "PENDING",
          currency,
          couponId: redemption?.couponId,
          subtotalCents: totals.subtotalCents,
          discountCents: totals.discountCents,
          shippingCents: totals.shippingCents,
          taxCents: totals.taxCents,
          totalCents: totals.totalCents,
          items: {
            create: lines.map((line) => ({
              productId: line.productId,
              variantId: line.variantId,
              // Snapshot: the order must always show what was actually
              // charged, even if the product is renamed or repriced later.
              titleSnapshot: line.titleSnapshot,
              unitPriceCents: line.unitPriceCents,
              quantity: line.quantity,
              vendorId: line.vendorId,
              commissionPct: line.commissionPct,
              commissionCents: line.commissionCents,
            })),
          },
        },
        include: ORDER_INCLUDE,
      });

      // The cart is consumed by a successful order. Same transaction, so a
      // later failure can't leave the cart empty with no order to show.
      await tx.cartItem.deleteMany({ where: { cartId } });

      return created;
    },
    {
      // Prisma defaults to a 5s interactive-transaction timeout. The work in
      // here is bounded (one write per cart line, then the order), so this is
      // not covering for a slow query — but a checkout that exceeds the
      // default returns a 500 at the single worst moment in the funnel, and
      // 5s is not much headroom on a loaded database. Raised deliberately.
      timeout: 15_000,
      maxWait: 10_000,
    });

    await this.auditLog.record({
      userId,
      action: "order.created",
      entity: "Order",
      entityId: order.id,
      metadata: { orderNumber: order.orderNumber, totalCents: order.totalCents },
    });

    await this.sendOrderConfirmation(userId, order);

    return order;
  }

  async listForUser(userId: string) {
    return this.prisma.order.findMany({
      where: { userId, deletedAt: null },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
  }

  async findOwned(userId: string, orderNumber: string) {
    const order = await this.prisma.order.findFirst({
      where: { orderNumber, userId, deletedAt: null },
      include: ORDER_INCLUDE,
    });
    if (!order) throw new NotFoundException("Order not found");
    return order;
  }

  private pricingConfig() {
    return {
      shippingFlatCents: this.config.get("SHIPPING_FLAT_CENTS", { infer: true }),
      taxPercent: this.config.get("TAX_PERCENT", { infer: true }),
    };
  }

  /**
   * Reads the cart and resolves each line into the exact values the order
   * will record. Rejects carts that can't be turned into a valid order.
   */
  private async loadCartForCheckout(userId: string) {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: { product: { include: { vendor: true } }, variant: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!cart || cart.items.length === 0) {
      throw new BadRequestException("Your cart is empty");
    }

    const lines = cart.items.map((item) => {
      // Re-validate at checkout: a product may have been unpublished or
      // deleted while it sat in the cart.
      if (item.product.deletedAt || item.product.status !== "PUBLISHED") {
        throw new ConflictException(`"${item.product.title}" is no longer available`);
      }
      if (item.variant?.deletedAt) {
        throw new ConflictException(`The selected option for "${item.product.title}" is no longer available`);
      }

      const unitPriceCents = item.variant?.priceCents ?? item.product.priceCents;
      // Snapshot the vendor's commission rate the same way prices are
      // snapshotted: changing a vendor's rate later must not rewrite what was
      // owed on orders already placed.
      const commissionPct = item.product.vendor?.commissionPct
        ? Number(item.product.vendor.commissionPct)
        : null;
      const commissionCents =
        commissionPct === null
          ? null
          : Math.round((unitPriceCents * item.quantity * commissionPct) / 100);

      return {
        productId: item.productId,
        variantId: item.variantId,
        titleSnapshot: item.variant ? `${item.product.title} — ${item.variant.name}` : item.product.title,
        unitPriceCents,
        quantity: item.quantity,
        productStockQty: item.product.stockQty,
        variantStockQty: item.variant?.stockQty ?? null,
        currency: item.product.currency,
        type: item.product.type,
        vendorId: item.product.vendorId,
        commissionPct,
        commissionCents,
      };
    });

    // Totals in two currencies can't be summed into one order.
    const currencies = new Set(lines.map((l) => l.currency));
    if (currencies.size > 1) {
      throw new BadRequestException(
        "Your cart mixes currencies. Please check out these items separately.",
      );
    }

    return {
      cartId: cart.id,
      lines,
      currency: lines[0]!.currency,
      requiresShipping: lines.some((l) => SHIPPABLE_TYPES.includes(l.type)),
    };
  }

  private async sendOrderConfirmation(userId: string, order: Order & { items: { titleSnapshot: string; quantity: number; unitPriceCents: number }[] }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) return;

    const money = (cents: number) =>
      new Intl.NumberFormat("en-US", { style: "currency", currency: order.currency }).format(cents / 100);

    const rows = order.items
      .map(
        (item) =>
          `<tr><td>${item.titleSnapshot}</td><td>${item.quantity}</td><td>${money(item.unitPriceCents * item.quantity)}</td></tr>`,
      )
      .join("");

    await this.mailer.send({
      to: user.email,
      subject: `Your Wisdom Shop order ${order.orderNumber}`,
      html: `<p>Thanks for your order!</p>
<p><strong>Order number:</strong> ${order.orderNumber}</p>
<table><thead><tr><th>Item</th><th>Qty</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>
<p>Subtotal: ${money(order.subtotalCents)}<br/>
Shipping: ${money(order.shippingCents)}<br/>
Tax: ${money(order.taxCents)}<br/>
<strong>Total: ${money(order.totalCents)}</strong></p>
<p>Your order is awaiting payment.</p>`,
    });
  }
}
