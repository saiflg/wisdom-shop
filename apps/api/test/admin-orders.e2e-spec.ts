import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";

const FIXTURE_PREFIX = "adminorders-fixture-";

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
      await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    }
  }

  const stale = await prisma.product.findMany({
    where: { slug: { startsWith: FIXTURE_PREFIX } },
    select: { id: true },
  });
  if (stale.length > 0) {
    const ids = stale.map((p) => p.id);
    await prisma.orderItem.deleteMany({ where: { productId: { in: ids } } });
    await prisma.cartItem.deleteMany({ where: { productId: { in: ids } } });
    await prisma.product.deleteMany({ where: { id: { in: ids } } });
  }

  await prisma.user.deleteMany({ where: { email: { startsWith: FIXTURE_PREFIX } } });
}

describe("Admin order management (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = Date.now();
  const adminEmail = `${FIXTURE_PREFIX}admin-${suffix}@wisdomshop.example`;
  const supportEmail = `${FIXTURE_PREFIX}support-${suffix}@wisdomshop.example`;
  const customerEmail = `${FIXTURE_PREFIX}customer-${suffix}@wisdomshop.example`;
  const password = "Sup3rSecret!Pass";

  const INITIAL_STOCK = 10;
  const ORDERED_QTY = 3;

  let adminToken: string;
  let supportToken: string;
  let customerToken: string;
  let stockedProductId: string;
  let digitalProductId: string;
  let orderNumber: string;
  let cancellableOrderNumber: string;

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function grantRole(userId: string, name: "ADMIN" | "SUPPORT") {
    const role = await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
    await prisma.userRole.create({ data: { userId, roleId: role.id } });
  }

  async function login(email: string): Promise<string> {
    const res = await request(app.getHttpServer()).post("/v1/auth/login").send({ email, password });
    return res.body.accessToken;
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    await purgeFixtures(prisma);

    const adminReg = await request(app.getHttpServer())
      .post("/v1/auth/register")
      .send({ email: adminEmail, password, firstName: "Ord", lastName: "Admin" });
    await grantRole(adminReg.body.user.id, "ADMIN");
    adminToken = await login(adminEmail);

    const supportReg = await request(app.getHttpServer())
      .post("/v1/auth/register")
      .send({ email: supportEmail, password, firstName: "Ord", lastName: "Support" });
    await grantRole(supportReg.body.user.id, "SUPPORT");
    supportToken = await login(supportEmail);

    const customerReg = await request(app.getHttpServer())
      .post("/v1/auth/register")
      .send({ email: customerEmail, password, firstName: "Ord", lastName: "Customer" });
    customerToken = customerReg.body.accessToken;

    const stocked = await prisma.product.create({
      data: {
        title: `Admin Orders Stocked ${suffix}`,
        slug: `${FIXTURE_PREFIX}stocked-${suffix}`,
        description: "Physical item with tracked stock.",
        type: "PHYSICAL",
        status: "PUBLISHED",
        priceCents: 5000,
        stockQty: INITIAL_STOCK,
      },
    });
    stockedProductId = stocked.id;

    const digital = await prisma.product.create({
      data: {
        title: `Admin Orders Digital ${suffix}`,
        slug: `${FIXTURE_PREFIX}digital-${suffix}`,
        description: "Digital item, untracked stock.",
        type: "DIGITAL",
        status: "PUBLISHED",
        priceCents: 1000,
      },
    });
    digitalProductId = digital.id;

    // Order 1: the one we walk through the fulfilment lifecycle.
    await request(app.getHttpServer())
      .post("/v1/cart/items")
      .set(auth(customerToken))
      .send({ productId: digitalProductId, quantity: 1 })
      .expect(201);
    const order1 = await request(app.getHttpServer())
      .post("/v1/orders")
      .set(auth(customerToken))
      .send({})
      .expect(201);
    orderNumber = order1.body.orderNumber;

    // Order 2: stocked items, used to prove cancellation restores inventory.
    await request(app.getHttpServer())
      .post("/v1/addresses")
      .set(auth(customerToken))
      .send({
        fullName: "Ord Customer",
        phone: "+2348012345678",
        line1: "1 Test Road",
        city: "Lagos",
        country: "NG",
      })
      .expect(201);
    await request(app.getHttpServer())
      .post("/v1/cart/items")
      .set(auth(customerToken))
      .send({ productId: stockedProductId, quantity: ORDERED_QTY })
      .expect(201);
    const addresses = await request(app.getHttpServer()).get("/v1/addresses").set(auth(customerToken));
    const order2 = await request(app.getHttpServer())
      .post("/v1/orders")
      .set(auth(customerToken))
      .send({ addressId: addresses.body[0].id })
      .expect(201);
    cancellableOrderNumber = order2.body.orderNumber;
  });

  afterAll(async () => {
    if (prisma) await purgeFixtures(prisma).catch(() => undefined);
    if (app) await app.close();
  });

  it("refuses admin order access without a token", async () => {
    await request(app.getHttpServer()).get("/v1/admin/orders").expect(401);
  });

  it("refuses admin order access to a plain customer", async () => {
    await request(app.getHttpServer()).get("/v1/admin/orders").set(auth(customerToken)).expect(403);
  });

  it("lets SUPPORT read orders", async () => {
    const res = await request(app.getHttpServer())
      .get("/v1/admin/orders")
      .set(auth(supportToken))
      .expect(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("does NOT let SUPPORT change order status", async () => {
    await request(app.getHttpServer())
      .patch(`/v1/admin/orders/${orderNumber}/status`)
      .set(auth(supportToken))
      .send({ status: "PAID" })
      .expect(403);
  });

  it("filters by status and searches by customer email", async () => {
    const byStatus = await request(app.getHttpServer())
      .get("/v1/admin/orders?status=PENDING")
      .set(auth(adminToken))
      .expect(200);
    expect(byStatus.body.data.every((o: { status: string }) => o.status === "PENDING")).toBe(true);

    const bySearch = await request(app.getHttpServer())
      .get(`/v1/admin/orders?search=${encodeURIComponent(customerEmail)}`)
      .set(auth(adminToken))
      .expect(200);
    expect(bySearch.body.data.length).toBeGreaterThanOrEqual(2);
    expect(bySearch.body.data.map((o: { orderNumber: string }) => o.orderNumber)).toContain(orderNumber);
  });

  it("rejects a reversed date range rather than silently returning nothing", async () => {
    await request(app.getHttpServer())
      .get("/v1/admin/orders?from=2030-01-01T00:00:00.000Z&to=2020-01-01T00:00:00.000Z")
      .set(auth(adminToken))
      .expect(400);
  });

  it("refuses an illegal transition (PENDING straight to DELIVERED)", async () => {
    await request(app.getHttpServer())
      .patch(`/v1/admin/orders/${orderNumber}/status`)
      .set(auth(adminToken))
      .send({ status: "DELIVERED" })
      .expect(409);
  });

  it("refuses tracking on an unpaid order", async () => {
    await request(app.getHttpServer())
      .patch(`/v1/admin/orders/${orderNumber}/shipment`)
      .set(auth(adminToken))
      .send({ carrier: "DHL", trackingNumber: "X1" })
      .expect(409);
  });

  it("walks the fulfilment path and records who changed what", async () => {
    for (const status of ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"]) {
      await request(app.getHttpServer())
        .patch(`/v1/admin/orders/${orderNumber}/status`)
        .set(auth(adminToken))
        .send({ status, note: `moved to ${status}` })
        .expect(200);
    }

    const detail = await request(app.getHttpServer())
      .get(`/v1/admin/orders/${orderNumber}`)
      .set(auth(adminToken))
      .expect(200);

    expect(detail.body.status).toBe("DELIVERED");
    expect(detail.body.shippedAt).not.toBeNull();
    expect(detail.body.deliveredAt).not.toBeNull();

    // History is newest-first and attributes every move to the admin.
    const history = detail.body.statusHistory;
    expect(history).toHaveLength(4);
    expect(history[0].toStatus).toBe("DELIVERED");
    expect(history[3].fromStatus).toBe("PENDING");
    expect(history[3].toStatus).toBe("PAID");
    expect(history[0].changedByUser.email).toBe(adminEmail);
    expect(history[0].note).toBe("moved to DELIVERED");
  });

  it("rejects moving to the status it is already in", async () => {
    await request(app.getHttpServer())
      .patch(`/v1/admin/orders/${orderNumber}/status`)
      .set(auth(adminToken))
      .send({ status: "DELIVERED" })
      .expect(409);
  });

  it("returns items to stock exactly once when an order is cancelled", async () => {
    const afterOrder = await prisma.product.findUniqueOrThrow({ where: { id: stockedProductId } });
    // Checkout already decremented stock.
    expect(afterOrder.stockQty).toBe(INITIAL_STOCK - ORDERED_QTY);

    await request(app.getHttpServer())
      .patch(`/v1/admin/orders/${cancellableOrderNumber}/status`)
      .set(auth(adminToken))
      .send({ status: "CANCELLED", note: "customer changed their mind" })
      .expect(200);

    const afterCancel = await prisma.product.findUniqueOrThrow({ where: { id: stockedProductId } });
    expect(afterCancel.stockQty).toBe(INITIAL_STOCK);

    const order = await prisma.order.findFirstOrThrow({ where: { orderNumber: cancellableOrderNumber } });
    expect(order.stockRestored).toBe(true);
    expect(order.cancelledAt).not.toBeNull();
  });

  it("treats CANCELLED as terminal, so stock cannot be credited twice", async () => {
    const before = await prisma.product.findUniqueOrThrow({ where: { id: stockedProductId } });

    // Every onward move from CANCELLED is rejected by the transition table,
    // which is what stops a second cancellation inflating inventory.
    for (const status of ["PENDING", "PAID", "CANCELLED", "REFUNDED"]) {
      await request(app.getHttpServer())
        .patch(`/v1/admin/orders/${cancellableOrderNumber}/status`)
        .set(auth(adminToken))
        .send({ status })
        .expect(409);
    }

    const after = await prisma.product.findUniqueOrThrow({ where: { id: stockedProductId } });
    expect(after.stockQty).toBe(before.stockQty);
  });

  it("refuses tracking on a cancelled order", async () => {
    await request(app.getHttpServer())
      .patch(`/v1/admin/orders/${cancellableOrderNumber}/shipment`)
      .set(auth(adminToken))
      .send({ carrier: "DHL", trackingNumber: "X2" })
      .expect(409);
  });

  it("404s for an unknown order number", async () => {
    await request(app.getHttpServer())
      .get("/v1/admin/orders/WS-20200101-DEADBEEF00")
      .set(auth(adminToken))
      .expect(404);
  });
});
