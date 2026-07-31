import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";

const FIXTURE_SLUG_PREFIX = "checkout-fixture-";
const FIXTURE_EMAIL_PREFIX = "checkout-fixture-";

async function purgeFixtures(prisma: PrismaService): Promise<void> {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: FIXTURE_EMAIL_PREFIX } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  if (userIds.length > 0) {
    const orders = await prisma.order.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
    if (orders.length > 0) {
      await prisma.orderItem.deleteMany({ where: { orderId: { in: orders.map((o) => o.id) } } });
      await prisma.order.deleteMany({ where: { id: { in: orders.map((o) => o.id) } } });
    }
  }

  const stale = await prisma.product.findMany({
    where: { slug: { startsWith: FIXTURE_SLUG_PREFIX } },
    select: { id: true },
  });
  if (stale.length > 0) {
    const ids = stale.map((p) => p.id);
    await prisma.orderItem.deleteMany({ where: { productId: { in: ids } } });
    await prisma.cartItem.deleteMany({ where: { productId: { in: ids } } });
    await prisma.product.deleteMany({ where: { id: { in: ids } } });
  }

  await prisma.user.deleteMany({ where: { email: { startsWith: FIXTURE_EMAIL_PREFIX } } });
}

describe("Checkout (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = Date.now();
  const emailA = `${FIXTURE_EMAIL_PREFIX}a-${suffix}@wisdomshop.example`;
  const emailB = `${FIXTURE_EMAIL_PREFIX}b-${suffix}@wisdomshop.example`;
  const password = "Sup3rSecret!Pass";

  let tokenA: string;
  let tokenB: string;
  let digitalId: string;
  let physicalId: string;
  let lastUnitId: string;
  let addressId: string;

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    await purgeFixtures(prisma);

    const regA = await request(app.getHttpServer())
      .post("/v1/auth/register")
      .send({ email: emailA, password, firstName: "Check", lastName: "A" });
    tokenA = regA.body.accessToken;

    const regB = await request(app.getHttpServer())
      .post("/v1/auth/register")
      .send({ email: emailB, password, firstName: "Check", lastName: "B" });
    tokenB = regB.body.accessToken;

    const digital = await prisma.product.create({
      data: {
        title: `Checkout Digital ${suffix}`,
        slug: `${FIXTURE_SLUG_PREFIX}digital-${suffix}`,
        description: "Digital, no shipping required.",
        type: "DIGITAL",
        status: "PUBLISHED",
        priceCents: 3000,
      },
    });
    digitalId = digital.id;

    const physical = await prisma.product.create({
      data: {
        title: `Checkout Physical ${suffix}`,
        slug: `${FIXTURE_SLUG_PREFIX}physical-${suffix}`,
        description: "Physical, needs shipping.",
        type: "PHYSICAL",
        status: "PUBLISHED",
        priceCents: 2000,
        stockQty: 10,
      },
    });
    physicalId = physical.id;

    const lastUnit = await prisma.product.create({
      data: {
        title: `Checkout LastUnit ${suffix}`,
        slug: `${FIXTURE_SLUG_PREFIX}lastunit-${suffix}`,
        description: "Exactly one in stock.",
        type: "DIGITAL",
        status: "PUBLISHED",
        priceCents: 1000,
        stockQty: 1,
      },
    });
    lastUnitId = lastUnit.id;
  });

  afterAll(async () => {
    if (prisma) await purgeFixtures(prisma).catch(() => undefined);
    if (app) await app.close();
  });

  it("requires authentication to check out", async () => {
    await request(app.getHttpServer()).post("/v1/orders").send({}).expect(401);
  });

  it("refuses to create an order from an empty cart", async () => {
    await request(app.getHttpServer()).post("/v1/orders").set(auth(tokenA)).send({}).expect(400);
  });

  it("creates an address, and the first one becomes the default", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/addresses")
      .set(auth(tokenA))
      .send({
        fullName: "Check A",
        phone: "+2348012345678",
        line1: "1 Test Road",
        city: "Lagos",
        country: "NG",
      })
      .expect(201);

    expect(res.body.isDefault).toBe(true);
    addressId = res.body.id;
  });

  it("does not expose another user's address", async () => {
    await request(app.getHttpServer()).get(`/v1/addresses/${addressId}`).set(auth(tokenB)).expect(404);
  });

  it("previews totals for a digital-only cart with no shipping required", async () => {
    await request(app.getHttpServer())
      .post("/v1/cart/items")
      .set(auth(tokenA))
      .send({ productId: digitalId, quantity: 2 })
      .expect(201);

    const res = await request(app.getHttpServer()).get("/v1/checkout/preview").set(auth(tokenA)).expect(200);

    expect(res.body.requiresShipping).toBe(false);
    expect(res.body.subtotalCents).toBe(6000);
    expect(res.body.totalCents).toBe(6000);
  });

  it("rejects checkout when the total the customer saw no longer matches", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/orders")
      .set(auth(tokenA))
      .send({ expectedTotalCents: 1 })
      .expect(409);

    expect(res.body.message.actualTotalCents ?? res.body.actualTotalCents).toBe(6000);
  });

  it("creates a PENDING order, snapshots prices, and clears the cart", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/orders")
      .set(auth(tokenA))
      .send({ expectedTotalCents: 6000 })
      .expect(201);

    expect(res.body.status).toBe("PENDING");
    expect(res.body.orderNumber).toMatch(/^WS-\d{8}-[0-9A-F]{10}$/);
    expect(res.body.totalCents).toBe(6000);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].unitPriceCents).toBe(3000);
    expect(res.body.items[0].titleSnapshot).toBe(`Checkout Digital ${suffix}`);

    const cart = await request(app.getHttpServer()).get("/v1/cart").set(auth(tokenA)).expect(200);
    expect(cart.body.items).toEqual([]);
  });

  it("keeps the snapshot price even after the product is repriced", async () => {
    const orders = await request(app.getHttpServer()).get("/v1/orders").set(auth(tokenA)).expect(200);
    const orderNumber = orders.body[0].orderNumber;

    await prisma.product.update({ where: { id: digitalId }, data: { priceCents: 9999 } });

    const res = await request(app.getHttpServer())
      .get(`/v1/orders/${orderNumber}`)
      .set(auth(tokenA))
      .expect(200);

    // The order still shows what was actually charged, not the new price.
    expect(res.body.items[0].unitPriceCents).toBe(3000);
    expect(res.body.totalCents).toBe(6000);

    await prisma.product.update({ where: { id: digitalId }, data: { priceCents: 3000 } });
  });

  it("requires a shipping address when the cart has physical items", async () => {
    await request(app.getHttpServer())
      .post("/v1/cart/items")
      .set(auth(tokenA))
      .send({ productId: physicalId, quantity: 1 })
      .expect(201);

    const preview = await request(app.getHttpServer())
      .get("/v1/checkout/preview")
      .set(auth(tokenA))
      .expect(200);
    expect(preview.body.requiresShipping).toBe(true);

    await request(app.getHttpServer()).post("/v1/orders").set(auth(tokenA)).send({}).expect(400);
  });

  it("rejects an address belonging to someone else", async () => {
    await request(app.getHttpServer())
      .post("/v1/orders")
      .set(auth(tokenB))
      .send({ addressId })
      .expect(400); // user B's cart is empty, so it fails before address checks

    await request(app.getHttpServer())
      .post("/v1/cart/items")
      .set(auth(tokenB))
      .send({ productId: physicalId, quantity: 1 })
      .expect(201);

    await request(app.getHttpServer())
      .post("/v1/orders")
      .set(auth(tokenB))
      .send({ addressId })
      .expect(404);
  });

  it("decrements stock when the order succeeds", async () => {
    const before = await prisma.product.findUniqueOrThrow({ where: { id: physicalId } });

    await request(app.getHttpServer())
      .post("/v1/orders")
      .set(auth(tokenA))
      .send({ addressId })
      .expect(201);

    const after = await prisma.product.findUniqueOrThrow({ where: { id: physicalId } });
    expect(after.stockQty).toBe((before.stockQty ?? 0) - 1);
  });

  it("lets only one of two concurrent checkouts win the last unit", async () => {
    // Both users put the single remaining unit in their cart...
    await request(app.getHttpServer())
      .post("/v1/cart/items")
      .set(auth(tokenA))
      .send({ productId: lastUnitId, quantity: 1 })
      .expect(201);
    await request(app.getHttpServer())
      .post("/v1/cart/items")
      .set(auth(tokenB))
      .send({ productId: lastUnitId, quantity: 1 })
      .expect(201);

    // ...and both try to check out at the same moment.
    const [resA, resB] = await Promise.all([
      request(app.getHttpServer()).post("/v1/orders").set(auth(tokenA)).send({ addressId }),
      request(app.getHttpServer()).post("/v1/orders").set(auth(tokenB)).send({}),
    ]);

    const statuses = [resA.status, resB.status].sort();
    // Exactly one 201; the loser gets 409 (out of stock) or 400 (needs an
    // address) — never two successes.
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);

    const product = await prisma.product.findUniqueOrThrow({ where: { id: lastUnitId } });
    expect(product.stockQty).toBe(0);
    expect(product.stockQty).toBeGreaterThanOrEqual(0);
  });

  it("refuses to check out a product that was unpublished while in the cart", async () => {
    const shelved = await prisma.product.create({
      data: {
        title: `Checkout Shelved ${suffix}`,
        slug: `${FIXTURE_SLUG_PREFIX}shelved-${suffix}`,
        description: "Gets unpublished mid-session.",
        type: "DIGITAL",
        status: "PUBLISHED",
        priceCents: 500,
      },
    });

    await request(app.getHttpServer())
      .post("/v1/cart/items")
      .set(auth(tokenB))
      .send({ productId: shelved.id, quantity: 1 })
      .expect(201);

    await prisma.product.update({ where: { id: shelved.id }, data: { status: "ARCHIVED" } });

    await request(app.getHttpServer()).post("/v1/orders").set(auth(tokenB)).send({}).expect(409);

    await prisma.cartItem.deleteMany({ where: { productId: shelved.id } });
    await prisma.product.delete({ where: { id: shelved.id } });
  });

  it("does not let a user read another user's order", async () => {
    const orders = await request(app.getHttpServer()).get("/v1/orders").set(auth(tokenA)).expect(200);
    const orderNumber = orders.body[0].orderNumber;

    await request(app.getHttpServer()).get(`/v1/orders/${orderNumber}`).set(auth(tokenB)).expect(404);
  });
});
