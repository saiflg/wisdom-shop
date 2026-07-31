import { BadRequestException, NotFoundException } from "@nestjs/common";
import { CartService } from "./cart.service";
import type { PrismaService } from "../prisma/prisma.service";

function buildPrismaMock() {
  return {
    cart: { findUnique: jest.fn(), create: jest.fn() },
    cartItem: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    product: { findFirst: jest.fn() },
  } as unknown as PrismaService;
}

function withCart(prisma: PrismaService, cartId = "cart_1") {
  (prisma.cart.findUnique as jest.Mock).mockResolvedValue({ id: cartId });
}

describe("CartService", () => {
  describe("addItem", () => {
    it("rejects a product that isn't published", async () => {
      const prisma = buildPrismaMock();
      withCart(prisma);
      (prisma.product.findFirst as jest.Mock).mockResolvedValue(null);
      const service = new CartService(prisma);

      await expect(service.addItem("user_1", { productId: "p1" })).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.cartItem.create).not.toHaveBeenCalled();
    });

    it("creates a new line for a first-time add", async () => {
      const prisma = buildPrismaMock();
      withCart(prisma);
      (prisma.product.findFirst as jest.Mock).mockResolvedValue({
        id: "p1",
        priceCents: 1000,
        stockQty: null,
        variants: [],
      });
      (prisma.cartItem.findFirst as jest.Mock).mockResolvedValue(null);
      const service = new CartService(prisma);

      await service.addItem("user_1", { productId: "p1", quantity: 2 });

      expect(prisma.cartItem.create).toHaveBeenCalledWith({
        data: { cartId: "cart_1", productId: "p1", variantId: null, quantity: 2 },
      });
    });

    it("merges into the existing line instead of creating a duplicate", async () => {
      const prisma = buildPrismaMock();
      withCart(prisma);
      (prisma.product.findFirst as jest.Mock).mockResolvedValue({
        id: "p1",
        priceCents: 1000,
        stockQty: null,
        variants: [],
      });
      (prisma.cartItem.findFirst as jest.Mock).mockResolvedValue({ id: "item_1", quantity: 3 });
      const service = new CartService(prisma);

      await service.addItem("user_1", { productId: "p1", quantity: 2 });

      expect(prisma.cartItem.create).not.toHaveBeenCalled();
      expect(prisma.cartItem.update).toHaveBeenCalledWith({
        where: { id: "item_1" },
        data: { quantity: 5 },
      });
    });

    it("refuses to exceed tracked stock, counting what's already in the cart", async () => {
      const prisma = buildPrismaMock();
      withCart(prisma);
      (prisma.product.findFirst as jest.Mock).mockResolvedValue({
        id: "p1",
        priceCents: 1000,
        stockQty: 5,
        variants: [],
      });
      (prisma.cartItem.findFirst as jest.Mock).mockResolvedValue({ id: "item_1", quantity: 4 });
      const service = new CartService(prisma);

      // 4 already in cart + 2 more = 6 > 5 available
      await expect(service.addItem("user_1", { productId: "p1", quantity: 2 })).rejects.toThrow(
        /Only 5 left in stock/,
      );
      expect(prisma.cartItem.update).not.toHaveBeenCalled();
    });

    it("allows unlimited quantity when stock isn't tracked", async () => {
      const prisma = buildPrismaMock();
      withCart(prisma);
      (prisma.product.findFirst as jest.Mock).mockResolvedValue({
        id: "p1",
        priceCents: 500,
        stockQty: null,
        variants: [],
      });
      (prisma.cartItem.findFirst as jest.Mock).mockResolvedValue(null);
      const service = new CartService(prisma);

      await expect(service.addItem("user_1", { productId: "p1", quantity: 500 })).resolves.toBeDefined();
    });

    it("rejects an out-of-stock item", async () => {
      const prisma = buildPrismaMock();
      withCart(prisma);
      (prisma.product.findFirst as jest.Mock).mockResolvedValue({
        id: "p1",
        priceCents: 500,
        stockQty: 0,
        variants: [],
      });
      (prisma.cartItem.findFirst as jest.Mock).mockResolvedValue(null);
      const service = new CartService(prisma);

      await expect(service.addItem("user_1", { productId: "p1" })).rejects.toThrow(/out of stock/);
    });

    it("requires an option when the product has variants", async () => {
      const prisma = buildPrismaMock();
      withCart(prisma);
      (prisma.product.findFirst as jest.Mock).mockResolvedValue({
        id: "p1",
        priceCents: 1000,
        stockQty: null,
        variants: [{ id: "v1", priceCents: 1200, stockQty: null }],
      });
      const service = new CartService(prisma);

      await expect(service.addItem("user_1", { productId: "p1" })).rejects.toThrow(/choose an option/);
    });

    it("rejects a variant that belongs to a different product", async () => {
      const prisma = buildPrismaMock();
      withCart(prisma);
      (prisma.product.findFirst as jest.Mock).mockResolvedValue({
        id: "p1",
        priceCents: 1000,
        stockQty: null,
        variants: [{ id: "v1", priceCents: 1200, stockQty: null }],
      });
      const service = new CartService(prisma);

      await expect(
        service.addItem("user_1", { productId: "p1", variantId: "v-from-other-product" }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("enforces variant stock rather than the parent product's", async () => {
      const prisma = buildPrismaMock();
      withCart(prisma);
      (prisma.product.findFirst as jest.Mock).mockResolvedValue({
        id: "p1",
        priceCents: 1000,
        stockQty: 100, // plentiful at product level...
        variants: [{ id: "v1", priceCents: 1200, stockQty: 1 }], // ...but scarce for this option
      });
      (prisma.cartItem.findFirst as jest.Mock).mockResolvedValue(null);
      const service = new CartService(prisma);

      await expect(
        service.addItem("user_1", { productId: "p1", variantId: "v1", quantity: 3 }),
      ).rejects.toThrow(/Only 1 left in stock/);
    });

    it("creates a cart on the fly for a user who somehow has none", async () => {
      const prisma = buildPrismaMock();
      (prisma.cart.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.cart.create as jest.Mock).mockResolvedValue({ id: "cart_new" });
      (prisma.product.findFirst as jest.Mock).mockResolvedValue({
        id: "p1",
        priceCents: 100,
        stockQty: null,
        variants: [],
      });
      (prisma.cartItem.findFirst as jest.Mock).mockResolvedValue(null);
      const service = new CartService(prisma);

      await service.addItem("user_1", { productId: "p1" });

      expect(prisma.cart.create).toHaveBeenCalledWith({ data: { userId: "user_1" }, select: { id: true } });
    });
  });

  describe("getCart", () => {
    it("prefers the variant price over the product price and totals correctly", async () => {
      const prisma = buildPrismaMock();
      withCart(prisma);
      (prisma.cartItem.findMany as jest.Mock).mockResolvedValue([
        {
          id: "i1",
          productId: "p1",
          variantId: null,
          quantity: 2,
          product: { title: "Book", slug: "book", priceCents: 1500, currency: "USD", stockQty: 10, images: [] },
          variant: null,
        },
        {
          id: "i2",
          productId: "p2",
          variantId: "v1",
          quantity: 3,
          product: { title: "Course", slug: "course", priceCents: 9999, currency: "USD", stockQty: null, images: [] },
          variant: { name: "Annual", priceCents: 1000, stockQty: null },
        },
      ]);
      const service = new CartService(prisma);

      const cart = await service.getCart("user_1");

      expect(cart.items[0].unitPriceCents).toBe(1500);
      expect(cart.items[0].lineTotalCents).toBe(3000);
      // Variant price (1000) wins over the product's 9999.
      expect(cart.items[1].unitPriceCents).toBe(1000);
      expect(cart.items[1].lineTotalCents).toBe(3000);
      expect(cart.subtotalCents).toBe(6000);
      expect(cart.itemCount).toBe(5);
    });

    it("returns an empty cart rather than failing when there are no items", async () => {
      const prisma = buildPrismaMock();
      withCart(prisma);
      const service = new CartService(prisma);

      const cart = await service.getCart("user_1");

      expect(cart.items).toEqual([]);
      expect(cart.subtotalCents).toBe(0);
      expect(cart.itemCount).toBe(0);
      expect(cart.currency).toBe("USD");
    });
  });

  describe("ownership", () => {
    it("404s when updating an item that isn't in the caller's cart", async () => {
      const prisma = buildPrismaMock();
      (prisma.cartItem.findFirst as jest.Mock).mockResolvedValue(null);
      const service = new CartService(prisma);

      await expect(service.updateItemQuantity("user_1", "someone-elses-item", 2)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.cartItem.update).not.toHaveBeenCalled();
    });

    it("404s when removing an item that isn't in the caller's cart", async () => {
      const prisma = buildPrismaMock();
      (prisma.cartItem.findFirst as jest.Mock).mockResolvedValue(null);
      const service = new CartService(prisma);

      await expect(service.removeItem("user_1", "someone-elses-item")).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.cartItem.delete).not.toHaveBeenCalled();
    });

    it("scopes the ownership lookup by userId", async () => {
      const prisma = buildPrismaMock();
      withCart(prisma);
      (prisma.cartItem.findFirst as jest.Mock).mockResolvedValue({
        id: "i1",
        product: { stockQty: null },
        variant: null,
      });
      const service = new CartService(prisma);

      await service.removeItem("user_1", "i1");

      expect(prisma.cartItem.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "i1", cart: { userId: "user_1" } } }),
      );
    });
  });
});
