import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";

const FIXTURE_PREFIX = "coupons-fixture-";

async function purgeFixtures(prisma: PrismaService): Promise<void> {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: FIXTURE_PREFIX } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  if (userIds.length > 0) {
    const orders = await prisma.order.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
    const orderIds = orders.map((o) => o.id);
    if (orderIds.length > 0) {
      await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.refund.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    }
    await prisma.cartItem.deleteMany({ where: { cart: { userId: { in: userIds } } } });
  }

  await prisma.coupon.deleteMany({ where: { code: { startsWith: "FIXT" } } });

  const products = await prisma.product.findMany({
    where: { slug: { startsWith: FIXTURE_PREFIX } },
    select: { id: true },
  });
  if (products.length > 0) {
    const ids = products.map((p) => p.id);
    await prisma.orderItem.deleteMany({ where: { productId: { in: ids } } });
    await prisma.cartItem.deleteMany({ where: { productId: { in: ids } } });
    await prisma.product.deleteMany({ where: { id: { in: ids } } });
  }

  await prisma.user.deleteMany({ where: { email: { startsWith: FIXTURE_PREFIX } } });
}

describe("Coupons (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const suffix = Date.now();
  const password = "Sup3rSecret!Pass";
  const adminEmail = `${FIXTURE_PREFIX}admin-${suffix}@wisdomshop.example`;
  const shopperEmail = `${FIXTURE_PREFIX}shopper-${suffix}@wisdomshop.example`;

  let adminToken: string;
  let shopperToken: string;
  let productId: string;

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const http = () => request(app.getHttpServer());

  async function register(email: string) {
    const res = await http()
      .post("/v1/auth/register")
      .send({ email, password, firstName: "Cou", lastName: "Pon" });
    return { id: res.body.user.id, token: res.body.accessToken };
  }

  /** Puts one unit of the fixture product in the shopper's cart. */
  async function fillCart(quantity = 1) {
    await http().delete("/v1/cart").set(auth(shopperToken));
    await http()
      .post("/v1/cart/items")
      .set(auth(shopperToken))
      .send({ productId, quantity })
      .expect(201);
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.init();

    const server = app.getHttpServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));

    prisma = app.get(PrismaService);
    await purgeFixtures(prisma);

    const admin = await register(adminEmail);
    const role = await prisma.role.upsert({ where: { name: "ADMIN" }, update: {}, create: { name: "ADMIN" } });
    await prisma.userRole.create({ data: { userId: admin.id, roleId: role.id } });
    adminToken = (await http().post("/v1/auth/login").send({ email: adminEmail, password })).body.accessToken;

    shopperToken = (await register(shopperEmail)).token;

    const product = await prisma.product.create({
      data: {
        title: `Coupon Test Item ${suffix}`,
        slug: `${FIXTURE_PREFIX}item-${suffix}`,
        description: "Digital, so checkout needs no address.",
        type: "DIGITAL",
        status: "PUBLISHED",
        priceCents: 10_000,
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    if (prisma) await purgeFixtures(prisma).catch(() => undefined);
    if (app) await app.close();
  });

  describe("administration", () => {
    it("creates a percentage coupon", async () => {
      const res = await http()
        .post("/v1/admin/coupons")
        .set(auth(adminToken))
        .send({ code: `fixt-pct-${suffix}`, percentOff: 10 })
        .expect(201);

      // Codes are normalised so "save10" and "SAVE10" are one coupon.
      expect(res.body.code).toBe(`FIXT-PCT-${suffix}`);
    });

    it("refuses a coupon that sets both kinds of discount", async () => {
      await http()
        .post("/v1/admin/coupons")
        .set(auth(adminToken))
        .send({ code: `FIXT-BOTH-${suffix}`, percentOff: 10, amountOffCents: 500 })
        .expect(400);
    });

    it("refuses a coupon that sets neither", async () => {
      await http()
        .post("/v1/admin/coupons")
        .set(auth(adminToken))
        .send({ code: `FIXT-NEITHER-${suffix}` })
        .expect(400);
    });

    it("refuses a duplicate code regardless of casing", async () => {
      await http()
        .post("/v1/admin/coupons")
        .set(auth(adminToken))
        .send({ code: `FIXT-PCT-${suffix}`.toLowerCase(), percentOff: 5 })
        .expect(409);
    });

    it("is closed to ordinary customers", async () => {
      await http().get("/v1/admin/coupons").set(auth(shopperToken)).expect(403);
      await http()
        .post("/v1/admin/coupons")
        .set(auth(shopperToken))
        .send({ code: `FIXT-NOPE-${suffix}`, percentOff: 90 })
        .expect(403);
    });
  });

  describe("previewing", () => {
    it("reports an invalid code in the body rather than as an error", async () => {
      // The cart shows the reason inline; a 4xx would make that a failure
      // state instead of a message.
      const res = await http()
        .post("/v1/coupons/preview")
        .set(auth(shopperToken))
        .send({ code: "NOT-A-REAL-CODE", subtotalCents: 10_000 })
        .expect(200);

      expect(res.body.valid).toBe(false);
      expect(res.body.message).toBeTruthy();
    });

    it("quotes the discount without consuming a redemption", async () => {
      const code = `FIXT-PREVIEW-${suffix}`;
      await http()
        .post("/v1/admin/coupons")
        .set(auth(adminToken))
        .send({ code, percentOff: 25, maxRedemptions: 1 })
        .expect(201);

      const res = await http()
        .post("/v1/coupons/preview")
        .set(auth(shopperToken))
        .send({ code, subtotalCents: 10_000 })
        .expect(200);

      expect(res.body).toMatchObject({ valid: true, discountCents: 2500 });

      const coupon = await prisma.coupon.findUniqueOrThrow({ where: { code } });
      expect(coupon.redeemedCount).toBe(0);
    });

    it("refuses below the minimum spend", async () => {
      const code = `FIXT-MIN-${suffix}`;
      await http()
        .post("/v1/admin/coupons")
        .set(auth(adminToken))
        .send({ code, percentOff: 10, minSubtotalCents: 50_000 })
        .expect(201);

      const res = await http()
        .post("/v1/coupons/preview")
        .set(auth(shopperToken))
        .send({ code, subtotalCents: 10_000 })
        .expect(200);

      expect(res.body).toMatchObject({ valid: false, reason: "below-minimum" });
    });
  });

  describe("checkout", () => {
    it("applies the discount and records it on the order", async () => {
      const code = `FIXT-CHECKOUT-${suffix}`;
      await http()
        .post("/v1/admin/coupons")
        .set(auth(adminToken))
        .send({ code, percentOff: 10 })
        .expect(201);

      await fillCart();
      const res = await http()
        .post("/v1/orders")
        .set(auth(shopperToken))
        .send({ couponCode: code })
        .expect(201);

      expect(res.body.subtotalCents).toBe(10_000);
      expect(res.body.discountCents).toBe(1000);
      expect(res.body.totalCents).toBe(9000);
      expect(res.body.couponId).toBeTruthy();

      const coupon = await prisma.coupon.findUniqueOrThrow({ where: { code } });
      expect(coupon.redeemedCount).toBe(1);
    });

    it("matches the code case-insensitively", async () => {
      const code = `FIXT-CASE-${suffix}`;
      await http()
        .post("/v1/admin/coupons")
        .set(auth(adminToken))
        .send({ code, percentOff: 50 })
        .expect(201);

      await fillCart();
      const res = await http()
        .post("/v1/orders")
        .set(auth(shopperToken))
        .send({ couponCode: code.toLowerCase() })
        .expect(201);

      expect(res.body.discountCents).toBe(5000);
    });

    it("refuses an expired coupon at checkout", async () => {
      const code = `FIXT-EXPIRED-${suffix}`;
      await http()
        .post("/v1/admin/coupons")
        .set(auth(adminToken))
        .send({ code, percentOff: 10, expiresAt: "2020-01-01T00:00:00.000Z" })
        .expect(201);

      await fillCart();
      await http()
        .post("/v1/orders")
        .set(auth(shopperToken))
        .send({ couponCode: code })
        .expect(400);
    });

    it("refuses a deactivated coupon at checkout", async () => {
      const code = `FIXT-OFF-${suffix}`;
      const created = await http()
        .post("/v1/admin/coupons")
        .set(auth(adminToken))
        .send({ code, percentOff: 10 })
        .expect(201);

      await http()
        .patch(`/v1/admin/coupons/${created.body.id}`)
        .set(auth(adminToken))
        .send({ active: false })
        .expect(200);

      await fillCart();
      await http()
        .post("/v1/orders")
        .set(auth(shopperToken))
        .send({ couponCode: code })
        .expect(400);
    });

    it("never lets a fixed discount exceed the order", async () => {
      const code = `FIXT-HUGE-${suffix}`;
      await http()
        .post("/v1/admin/coupons")
        .set(auth(adminToken))
        .send({ code, amountOffCents: 999_999 })
        .expect(201);

      await fillCart();
      const res = await http()
        .post("/v1/orders")
        .set(auth(shopperToken))
        .send({ couponCode: code })
        .expect(201);

      // A negative total would mean refunding the customer for shopping.
      expect(res.body.discountCents).toBe(10_000);
      expect(res.body.totalCents).toBe(0);
    });

    it("honours the expected-total guard against the discounted price", async () => {
      const code = `FIXT-GUARD-${suffix}`;
      await http()
        .post("/v1/admin/coupons")
        .set(auth(adminToken))
        .send({ code, percentOff: 10 })
        .expect(201);

      await fillCart();
      // The customer was shown the undiscounted total, so this must stop
      // rather than silently charge something else.
      await http()
        .post("/v1/orders")
        .set(auth(shopperToken))
        .send({ couponCode: code, expectedTotalCents: 10_000 })
        .expect(409);
    });

    it("stops at the redemption limit", async () => {
      const code = `FIXT-ONCE-${suffix}`;
      await http()
        .post("/v1/admin/coupons")
        .set(auth(adminToken))
        .send({ code, percentOff: 10, maxRedemptions: 1 })
        .expect(201);

      await fillCart();
      await http().post("/v1/orders").set(auth(shopperToken)).send({ couponCode: code }).expect(201);

      await fillCart();
      await http().post("/v1/orders").set(auth(shopperToken)).send({ couponCode: code }).expect(400);

      const coupon = await prisma.coupon.findUniqueOrThrow({ where: { code } });
      expect(coupon.redeemedCount).toBe(1);
    });

    it("does not burn a redemption when checkout fails inside the transaction", async () => {
      const code = `FIXT-ROLLBACK-${suffix}`;
      await http()
        .post("/v1/admin/coupons")
        .set(auth(adminToken))
        .send({ code, percentOff: 10 })
        .expect(201);

      // The failure has to happen *after* the coupon is claimed, which means
      // inside the transaction. Stocking the product, adding it to the cart,
      // and then emptying the shelf underneath gets there: the stock
      // compare-and-swap fails mid-transaction and everything rolls back.
      const physical = await prisma.product.create({
        data: {
          title: `Coupon Rollback Item ${suffix}`,
          slug: `${FIXTURE_PREFIX}physical-${suffix}`,
          description: "Goes out of stock between cart and checkout.",
          type: "PHYSICAL",
          status: "PUBLISHED",
          priceCents: 5000,
          stockQty: 1,
        },
      });

      const address = await prisma.address.create({
        data: {
          userId: (await prisma.user.findUniqueOrThrow({ where: { email: shopperEmail } })).id,
          fullName: "Cou Pon",
          phone: "+15550000000",
          line1: "1 Test Street",
          city: "Testville",
          country: "GB",
        },
      });

      await http().delete("/v1/cart").set(auth(shopperToken));
      await http()
        .post("/v1/cart/items")
        .set(auth(shopperToken))
        .send({ productId: physical.id, quantity: 1 })
        .expect(201);

      await prisma.product.update({ where: { id: physical.id }, data: { stockQty: 0 } });

      await http()
        .post("/v1/orders")
        .set(auth(shopperToken))
        .send({ couponCode: code, addressId: address.id })
        .expect(409);

      // The redemption must have rolled back with the transaction rather
      // than burning a use on an order that never existed.
      const coupon = await prisma.coupon.findUniqueOrThrow({ where: { code } });
      expect(coupon.redeemedCount).toBe(0);

      // And no order was left behind.
      const orphan = await prisma.order.findFirst({ where: { couponId: coupon.id } });
      expect(orphan).toBeNull();
    });
  });

  describe("deleting", () => {
    it("refuses to delete a coupon that is on an order", async () => {
      const used = await prisma.coupon.findFirstOrThrow({
        where: { code: `FIXT-CHECKOUT-${suffix}` },
      });

      // Deleting it would orphan the discount recorded on those orders.
      await http().delete(`/v1/admin/coupons/${used.id}`).set(auth(adminToken)).expect(409);
    });

    it("deletes an unused coupon", async () => {
      const created = await http()
        .post("/v1/admin/coupons")
        .set(auth(adminToken))
        .send({ code: `FIXT-UNUSED-${suffix}`, percentOff: 5 })
        .expect(201);

      await http().delete(`/v1/admin/coupons/${created.body.id}`).set(auth(adminToken)).expect(204);
    });
  });
});
