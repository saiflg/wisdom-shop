import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AddCartItemDto } from "./dto/add-cart-item.dto";
import { MAX_ITEM_QUANTITY } from "./dto/add-cart-item.dto";

const CART_ITEM_INCLUDE = {
  product: {
    include: { images: { orderBy: { position: "asc" as const }, take: 1 } },
  },
  variant: true,
} satisfies Prisma.CartItemInclude;

export interface CartLine {
  id: string;
  productId: string;
  variantId: string | null;
  title: string;
  slug: string;
  variantName: string | null;
  imageUrl: string | null;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
  /** null when the item's stock isn't tracked (digital goods, unlimited supply). */
  availableStock: number | null;
}

export interface CartSummary {
  id: string;
  currency: string;
  items: CartLine[];
  itemCount: number;
  subtotalCents: number;
}

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registration creates a cart for every user, but seeded/legacy accounts
   * may predate that, so resolve defensively instead of assuming one exists.
   */
  private async resolveCartId(userId: string): Promise<string> {
    const existing = await this.prisma.cart.findUnique({ where: { userId }, select: { id: true } });
    if (existing) return existing.id;
    const created = await this.prisma.cart.create({ data: { userId }, select: { id: true } });
    return created.id;
  }

  async getCart(userId: string): Promise<CartSummary> {
    const cartId = await this.resolveCartId(userId);
    const items = await this.prisma.cartItem.findMany({
      where: { cartId },
      include: CART_ITEM_INCLUDE,
      orderBy: { createdAt: "asc" },
    });

    const lines: CartLine[] = items.map((item) => {
      const unitPriceCents = item.variant?.priceCents ?? item.product.priceCents;
      return {
        id: item.id,
        productId: item.productId,
        variantId: item.variantId,
        title: item.product.title,
        slug: item.product.slug,
        variantName: item.variant?.name ?? null,
        imageUrl: item.product.images[0]?.url ?? null,
        unitPriceCents,
        quantity: item.quantity,
        lineTotalCents: unitPriceCents * item.quantity,
        availableStock: item.variant ? item.variant.stockQty : item.product.stockQty,
      };
    });

    return {
      id: cartId,
      // Mixed-currency carts aren't supported yet; every seeded product is
      // USD and checkout (Phase 5) will need an explicit decision here.
      currency: items[0]?.product.currency ?? "USD",
      items: lines,
      itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
      subtotalCents: lines.reduce((sum, line) => sum + line.lineTotalCents, 0),
    };
  }

  async addItem(userId: string, dto: AddCartItemDto): Promise<CartSummary> {
    const quantity = dto.quantity ?? 1;

    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, status: "PUBLISHED", deletedAt: null },
      include: { variants: { where: { deletedAt: null } } },
    });
    if (!product) {
      // Deliberately identical to a nonexistent id: don't disclose that an
      // unpublished/archived product exists.
      throw new NotFoundException("Product not found");
    }

    let variantStock: number | null = null;
    if (dto.variantId) {
      const variant = product.variants.find((v) => v.id === dto.variantId);
      if (!variant) throw new BadRequestException("That option isn't available for this product");
      variantStock = variant.stockQty;
    } else if (product.variants.length > 0) {
      throw new BadRequestException("This product requires you to choose an option");
    }

    const availableStock = dto.variantId ? variantStock : product.stockQty;
    const cartId = await this.resolveCartId(userId);

    // Postgres treats NULLs as distinct in unique constraints, so the
    // @@unique([cartId, productId, variantId]) index does NOT dedupe rows
    // where variantId is null. Look the line up explicitly rather than
    // relying on the constraint or an upsert.
    const existing = await this.prisma.cartItem.findFirst({
      where: { cartId, productId: dto.productId, variantId: dto.variantId ?? null },
    });

    const newQuantity = (existing?.quantity ?? 0) + quantity;
    if (newQuantity > MAX_ITEM_QUANTITY) {
      throw new BadRequestException(`You can have at most ${MAX_ITEM_QUANTITY} of an item in your cart`);
    }
    this.assertWithinStock(newQuantity, availableStock);

    if (existing) {
      await this.prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: newQuantity } });
    } else {
      await this.prisma.cartItem.create({
        data: { cartId, productId: dto.productId, variantId: dto.variantId ?? null, quantity },
      });
    }

    return this.getCart(userId);
  }

  async updateItemQuantity(userId: string, itemId: string, quantity: number): Promise<CartSummary> {
    const item = await this.findOwnedItem(userId, itemId);

    const availableStock = item.variant ? item.variant.stockQty : item.product.stockQty;
    this.assertWithinStock(quantity, availableStock);

    await this.prisma.cartItem.update({ where: { id: item.id }, data: { quantity } });
    return this.getCart(userId);
  }

  async removeItem(userId: string, itemId: string): Promise<CartSummary> {
    const item = await this.findOwnedItem(userId, itemId);
    await this.prisma.cartItem.delete({ where: { id: item.id } });
    return this.getCart(userId);
  }

  async clear(userId: string): Promise<CartSummary> {
    const cartId = await this.resolveCartId(userId);
    await this.prisma.cartItem.deleteMany({ where: { cartId } });
    return this.getCart(userId);
  }

  /**
   * Scopes the lookup to the caller's own cart, so guessing another user's
   * cart-item id yields 404 rather than letting them mutate it.
   */
  private async findOwnedItem(userId: string, itemId: string) {
    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, cart: { userId } },
      include: { product: true, variant: true },
    });
    if (!item) throw new NotFoundException("Cart item not found");
    return item;
  }

  private assertWithinStock(quantity: number, availableStock: number | null): void {
    if (availableStock === null) return;
    if (availableStock <= 0) {
      throw new BadRequestException("This item is out of stock");
    }
    if (quantity > availableStock) {
      throw new BadRequestException(`Only ${availableStock} left in stock`);
    }
  }
}
