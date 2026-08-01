import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";

const FIXTURE_PREFIX = "vendors-fixture-";

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
    const vendors = await prisma.vendor.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
    const vendorIds = vendors.map((v) => v.id);
    if (vendorIds.length > 0) {
      const vProducts = await prisma.product.findMany({
        where: { vendorId: { in: vendorIds } },
        select: { id: true },
      });
      const pIds = vProducts.map((p) => p.id);
      if (pIds.length > 0) {
        await prisma.orderItem.deleteMany({ where: { productId: { in: pIds } } });
        await prisma.cartItem.deleteMany({ where: { productId: { in: pIds } } });
        await prisma.product.deleteMany({ where: { id: { in: pIds } } });
      }
      await prisma.vendor.deleteMany({ where: { id: { in: vendorIds } } });
    }
  }

  await prisma.user.deleteMany({ where: { email: { startsWith: FIXTURE_PREFIX } } });
}

describe("Vendor marketplace (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = Date.now();
  const adminEmail = `${FIXTURE_PREFIX}admin-${suffix}@wisdomshop.example`;
  const vendorAEmail = `${FIXTURE_PREFIX}vendora-${suffix}@wisdomshop.example`;
  const vendorBEmail = `${FIXTURE_PREFIX}vendorb-${suffix}@wisdomshop.example`;
  const buyerEmail = `${FIXTURE_PREFIX}buyer-${suffix}@wisdomshop.example`;
  const password = "Sup3rSecret!Pass";

  let adminToken: string;
  let vendorAToken: string;
  let vendorBToken: string;
  let buyerToken: string;
  let vendorAId: string;
  let vendorBId: string;
  let vendorAProductId: string;
  let vendorBProductId: string;

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const http = () => request(app.getHttpServer());

  async function login(email: string): Promise<string> {
    const res = await http().post("/v1/auth/login").send({ email, password });
    return res.body.accessToken;
  }

  async function registerUser(email: string, first: string): Promise<string> {
    const res = await http()
      .post("/v1/auth/register")
      .send({ email, password, firstName: first, lastName: "Test" });
    return res.body.user.id;
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    await purgeFixtures(prisma);

    const adminUserId = await registerUser(adminEmail, "Ven");
    const adminRole = await prisma.role.upsert({
      where: { name: "ADMIN" },
      update: {},
      create: { name: "ADMIN" },
    });
    await prisma.userRole.create({ data: { userId: adminUserId, roleId: adminRole.id } });
    adminToken = await login(adminEmail);

    await registerUser(vendorAEmail, "VendorA");
    vendorAToken = await login(vendorAEmail);
    await registerUser(vendorBEmail, "VendorB");
    vendorBToken = await login(vendorBEmail);
    await registerUser(buyerEmail, "Buyer");
    buyerToken = await login(buyerEmail);
  });

  afterAll(async () => {
    if (prisma) await purgeFixtures(prisma).catch(() => undefined);
    if (app) await app.close();
  });

  it("lets a signed-in customer apply, starting PENDING", async () => {
    const resA = await http()
      .post("/v1/vendors/apply")
      .set(auth(vendorAToken))
      .send({ storeName: `Vendor A Books ${suffix}` })
      .expect(201);

    expect(resA.body.status).toBe("PENDING");
    expect(resA.body.slug).toBe(`vendor-a-books-${suffix}`);
    vendorAId = resA.body.id;

    const resB = await http()
      .post("/v1/vendors/apply")
      .set(auth(vendorBToken))
      .send({ storeName: `Vendor B Books ${suffix}` })
      .expect(201);
    vendorBId = resB.body.id;
  });

  it("refuses a second application from the same user", async () => {
    await http()
      .post("/v1/vendors/apply")
      .set(auth(vendorAToken))
      .send({ storeName: "Duplicate" })
      .expect(409);
  });

  it("does not grant product access while the application is PENDING", async () => {
    // The VENDOR role hasn't been granted yet, so the guard rejects first.
    await http().get("/v1/vendor/products").set(auth(vendorAToken)).expect(403);
  });

  it("keeps vendor administration away from non-admins", async () => {
    await http().get("/v1/admin/vendors").set(auth(vendorAToken)).expect(403);
    await http().get("/v1/admin/vendors").expect(401);
  });

  it("lets an admin approve vendors and set a commission rate", async () => {
    await http()
      .patch(`/v1/admin/vendors/${vendorAId}/status`)
      .set(auth(adminToken))
      .send({ status: "APPROVED", commissionPct: 10 })
      .expect(200);

    await http()
      .patch(`/v1/admin/vendors/${vendorBId}/status`)
      .set(auth(adminToken))
      .send({ status: "APPROVED", commissionPct: 25 })
      .expect(200);

    // Approval grants the VENDOR role, so a fresh token now carries it.
    vendorAToken = await login(vendorAEmail);
    vendorBToken = await login(vendorBEmail);

    const me = await http().get("/v1/vendors/me").set(auth(vendorAToken)).expect(200);
    expect(me.body.status).toBe("APPROVED");
  });

  it("refuses an illegal vendor status transition", async () => {
    // APPROVED may only go to SUSPENDED.
    await http()
      .patch(`/v1/admin/vendors/${vendorAId}/status`)
      .set(auth(adminToken))
      .send({ status: "REJECTED" })
      .expect(409);

    await http()
      .patch(`/v1/admin/vendors/${vendorAId}/status`)
      .set(auth(adminToken))
      .send({ status: "APPROVED" })
      .expect(409);
  });

  it("creates products owned by the calling vendor", async () => {
    const resA = await http()
      .post("/v1/vendor/products")
      .set(auth(vendorAToken))
      .send({
        title: `Vendor A Product ${suffix}`,
        description: "Sold by vendor A.",
        type: "DIGITAL",
        priceCents: 10000,
      })
      .expect(201);
    expect(resA.body.status).toBe("DRAFT");
    vendorAProductId = resA.body.id;

    const resB = await http()
      .post("/v1/vendor/products")
      .set(auth(vendorBToken))
      .send({
        title: `Vendor B Product ${suffix}`,
        description: "Sold by vendor B.",
        type: "DIGITAL",
        priceCents: 20000,
      })
      .expect(201);
    vendorBProductId = resB.body.id;

    const owned = await prisma.product.findUniqueOrThrow({ where: { id: vendorAProductId } });
    expect(owned.vendorId).toBe(vendorAId);
  });

  it("ignores a vendorId supplied in the request body", async () => {
    // `forbidNonWhitelisted` rejects the unknown field outright, so a vendor
    // cannot attribute a product to someone else even by trying.
    await http()
      .post("/v1/vendor/products")
      .set(auth(vendorAToken))
      .send({
        title: `Spoofed ${suffix}`,
        description: "Attempts to set vendorId directly.",
        type: "DIGITAL",
        priceCents: 100,
        vendorId: vendorBId,
      })
      .expect(400);
  });

  it("lists only the calling vendor's own products", async () => {
    const listA = await http().get("/v1/vendor/products").set(auth(vendorAToken)).expect(200);
    const idsA = listA.body.data.map((p: { id: string }) => p.id);
    expect(idsA).toContain(vendorAProductId);
    expect(idsA).not.toContain(vendorBProductId);
  });

  it("does not let one vendor read, edit or delete another vendor's product", async () => {
    await http().get(`/v1/vendor/products/${vendorBProductId}`).set(auth(vendorAToken)).expect(404);

    await http()
      .patch(`/v1/vendor/products/${vendorBProductId}`)
      .set(auth(vendorAToken))
      .send({ priceCents: 1 })
      .expect(404);

    await http().delete(`/v1/vendor/products/${vendorBProductId}`).set(auth(vendorAToken)).expect(404);

    // Vendor B's product is untouched.
    const untouched = await prisma.product.findUniqueOrThrow({ where: { id: vendorBProductId } });
    expect(untouched.priceCents).toBe(20000);
    expect(untouched.deletedAt).toBeNull();
  });

  it("still allows a vendor to edit their own product", async () => {
    await http()
      .patch(`/v1/vendor/products/${vendorAProductId}`)
      .set(auth(vendorAToken))
      .send({ status: "PUBLISHED" })
      .expect(200);

    const published = await prisma.product.findUniqueOrThrow({ where: { id: vendorAProductId } });
    expect(published.status).toBe("PUBLISHED");
  });

  it("snapshots the commission rate onto order lines at checkout", async () => {
    await http()
      .post("/v1/cart/items")
      .set(auth(buyerToken))
      .send({ productId: vendorAProductId, quantity: 2 })
      .expect(201);

    const order = await http().post("/v1/orders").set(auth(buyerToken)).send({}).expect(201);

    const item = await prisma.orderItem.findFirstOrThrow({
      where: { orderId: order.body.id, productId: vendorAProductId },
    });
    expect(item.vendorId).toBe(vendorAId);
    expect(Number(item.commissionPct)).toBe(10);
    // 10% of (10000 * 2)
    expect(item.commissionCents).toBe(2000);
  });

  it("reports earnings net of commission, excluding unsettled orders", async () => {
    const beforePaid = await http().get("/v1/vendor/earnings").set(auth(vendorAToken)).expect(200);

    // The order is still PENDING, so it is listed but not counted.
    expect(beforePaid.body.lines.length).toBeGreaterThan(0);
    expect(beforePaid.body.totals.netCents).toBe(0);
    expect(beforePaid.body.totals.excludedLineCount).toBeGreaterThan(0);

    const orders = await http().get("/v1/orders").set(auth(buyerToken)).expect(200);
    const orderNumber = orders.body[0].orderNumber;
    await http()
      .patch(`/v1/admin/orders/${orderNumber}/status`)
      .set(auth(adminToken))
      .send({ status: "PAID" })
      .expect(200);

    const afterPaid = await http().get("/v1/vendor/earnings").set(auth(vendorAToken)).expect(200);
    expect(afterPaid.body.totals.grossCents).toBe(20000);
    expect(afterPaid.body.totals.commissionCents).toBe(2000);
    expect(afterPaid.body.totals.netCents).toBe(18000);
  });

  it("does not leak another vendor's earnings", async () => {
    const bEarnings = await http().get("/v1/vendor/earnings").set(auth(vendorBToken)).expect(200);
    expect(bEarnings.body.totals.netCents).toBe(0);
    expect(bEarnings.body.lines).toHaveLength(0);
  });

  it("keeps a past order's commission when the vendor's rate later changes", async () => {
    await http()
      .patch(`/v1/admin/vendors/${vendorAId}/status`)
      .set(auth(adminToken))
      .send({ status: "SUSPENDED", commissionPct: 90 })
      .expect(200);

    const item = await prisma.orderItem.findFirstOrThrow({ where: { vendorId: vendorAId } });
    // Still the rate that applied when the order was placed.
    expect(Number(item.commissionPct)).toBe(10);
    expect(item.commissionCents).toBe(2000);
  });

  it("blocks a suspended vendor from managing products", async () => {
    // The role was revoked on suspension, so the guard rejects.
    await http().get("/v1/vendor/products").set(auth(vendorAToken)).expect(403);
  });
});
