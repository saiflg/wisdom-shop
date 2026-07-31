import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";

const FIXTURE_PREFIX = "analytics-fixture-";

async function purgeFixtures(prisma: PrismaService): Promise<void> {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: FIXTURE_PREFIX } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  if (userIds.length > 0) {
    // Items cascade from orders, but statusHistory/payments do not.
    const orders = await prisma.order.findMany({
      where: { userId: { in: userIds } },
      select: { id: true },
    });
    const orderIds = orders.map((o) => o.id);
    if (orderIds.length > 0) {
      await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    }
  }

  const staleProducts = await prisma.product.findMany({
    where: { slug: { startsWith: FIXTURE_PREFIX } },
    select: { id: true },
  });
  if (staleProducts.length > 0) {
    const ids = staleProducts.map((p) => p.id);
    await prisma.orderItem.deleteMany({ where: { productId: { in: ids } } });
    await prisma.cartItem.deleteMany({ where: { productId: { in: ids } } });
    await prisma.product.deleteMany({ where: { id: { in: ids } } });
  }

  await prisma.user.deleteMany({ where: { email: { startsWith: FIXTURE_PREFIX } } });
}

interface Summary {
  revenue: {
    currencies: string[];
    settledGrossCents: number;
    settledOrderCount: number;
    averageOrderValueCents: number;
    windowDays: number;
    windowGrossCents: number;
    windowOrderCount: number;
  };
  orders: { pending: number; refunded: number; byStatus: Record<string, number> };
  catalog: { publishedProducts: number };
  customers: { total: number };
  vendors: { awaitingApproval: number };
  licenses: { active: number };
}

describe("Admin analytics (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = Date.now();
  const adminEmail = `${FIXTURE_PREFIX}admin-${suffix}@wisdomshop.example`;
  const buyerEmail = `${FIXTURE_PREFIX}buyer-${suffix}@wisdomshop.example`;
  const password = "Sup3rSecret!Pass";

  let adminToken: string;
  let buyerToken: string;
  let buyerId: string;
  let hotProductId: string;
  let coolProductId: string;

  /**
   * Figures taken *before* this suite's orders exist. The database is shared
   * with the other suites and the seed, so every revenue assertion is a delta
   * against this baseline rather than an absolute — asserting absolutes would
   * make the suite depend on what ran before it.
   */
  let baseline: Summary;

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const http = () => request(app.getHttpServer());

  const getSummary = async (query = ""): Promise<Summary> => {
    const res = await http().get(`/v1/admin/analytics/summary${query}`).set(auth(adminToken)).expect(200);
    return res.body as Summary;
  };

  /** Creates an order with one line, at a chosen status and age. */
  async function makeOrder(opts: {
    label: string;
    status: "PENDING" | "PAID" | "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED" | "REFUNDED";
    totalCents: number;
    productId: string;
    quantity: number;
    daysAgo?: number;
  }) {
    const createdAt = new Date(Date.now() - (opts.daysAgo ?? 0) * 86_400_000);
    return prisma.order.create({
      data: {
        orderNumber: `${FIXTURE_PREFIX}${opts.label}-${suffix}`,
        userId: buyerId,
        status: opts.status,
        subtotalCents: opts.totalCents,
        totalCents: opts.totalCents,
        createdAt,
        items: {
          create: {
            productId: opts.productId,
            titleSnapshot: opts.label,
            unitPriceCents: Math.round(opts.totalCents / opts.quantity),
            quantity: opts.quantity,
          },
        },
      },
    });
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    await purgeFixtures(prisma);

    const adminReg = await http()
      .post("/v1/auth/register")
      .send({ email: adminEmail, password, firstName: "An", lastName: "Alyst" });
    const role = await prisma.role.upsert({ where: { name: "ADMIN" }, update: {}, create: { name: "ADMIN" } });
    await prisma.userRole.create({ data: { userId: adminReg.body.user.id, roleId: role.id } });
    const adminLogin = await http().post("/v1/auth/login").send({ email: adminEmail, password });
    adminToken = adminLogin.body.accessToken;

    // Taken before the buyer, the products and the orders exist, so each of
    // those is visible as a delta below.
    baseline = await getSummary();

    const buyerReg = await http()
      .post("/v1/auth/register")
      .send({ email: buyerEmail, password, firstName: "Bu", lastName: "Yer" });
    buyerId = buyerReg.body.user.id;
    buyerToken = buyerReg.body.accessToken;

    const hot = await prisma.product.create({
      data: {
        title: `Analytics Hot Seller ${suffix}`,
        slug: `${FIXTURE_PREFIX}hot-${suffix}`,
        description: "Sells well.",
        type: "DIGITAL",
        status: "PUBLISHED",
        priceCents: 2500,
      },
    });
    hotProductId = hot.id;

    const cool = await prisma.product.create({
      data: {
        title: `Analytics Slow Seller ${suffix}`,
        slug: `${FIXTURE_PREFIX}cool-${suffix}`,
        description: "Sells less.",
        type: "DIGITAL",
        status: "PUBLISHED",
        priceCents: 5000,
      },
    });
    coolProductId = cool.id;

    // Settled, recent: counts everywhere.
    await makeOrder({ label: "paid", status: "PAID", totalCents: 10_000, productId: hotProductId, quantity: 3 });
    await makeOrder({
      label: "delivered",
      status: "DELIVERED",
      totalCents: 5_000,
      productId: coolProductId,
      quantity: 1,
    });
    // Settled but older than the default 30-day window: all-time only.
    await makeOrder({
      label: "old",
      status: "PAID",
      totalCents: 2_000,
      productId: hotProductId,
      quantity: 1,
      daysAgo: 60,
    });
    // Money that is NOT ours: never revenue, whatever the amounts say.
    await makeOrder({
      label: "pending",
      status: "PENDING",
      totalCents: 999_000,
      productId: hotProductId,
      quantity: 50,
    });
    await makeOrder({
      label: "refunded",
      status: "REFUNDED",
      totalCents: 777_000,
      productId: hotProductId,
      quantity: 40,
    });
    await makeOrder({
      label: "cancelled",
      status: "CANCELLED",
      totalCents: 666_000,
      productId: hotProductId,
      quantity: 30,
    });
  });

  afterAll(async () => {
    if (prisma) await purgeFixtures(prisma).catch(() => undefined);
    if (app) await app.close();
  });

  it("keeps analytics away from unauthenticated and ordinary users", async () => {
    await http().get("/v1/admin/analytics/summary").expect(401);
    await http().get("/v1/admin/analytics/summary").set(auth(buyerToken)).expect(403);
    await http().get("/v1/admin/analytics/top-products").set(auth(buyerToken)).expect(403);
  });

  it("counts only settled orders as revenue", async () => {
    const now = await getSummary();

    // 10,000 + 5,000 + 2,000. The 999k pending, 777k refunded and 666k
    // cancelled orders must contribute nothing — if any leaked in, this
    // number would be off by an amount far larger than the real total.
    expect(now.revenue.settledGrossCents - baseline.revenue.settledGrossCents).toBe(17_000);
    expect(now.revenue.settledOrderCount - baseline.revenue.settledOrderCount).toBe(3);
  });

  it("restricts the window figures to the requested period", async () => {
    const now = await getSummary();
    expect(now.revenue.windowDays).toBe(30);
    // The 60-day-old paid order is settled but outside the window.
    expect(now.revenue.windowGrossCents - baseline.revenue.windowGrossCents).toBe(15_000);
    expect(now.revenue.windowOrderCount - baseline.revenue.windowOrderCount).toBe(2);

    const wide = await getSummary("?days=90");
    expect(wide.revenue.windowDays).toBe(90);
    expect(wide.revenue.windowGrossCents - baseline.revenue.windowGrossCents).toBe(17_000);
    expect(wide.revenue.windowOrderCount - baseline.revenue.windowOrderCount).toBe(3);
  });

  it("reports the currencies the settled total is actually made of", async () => {
    const now = await getSummary();
    // The fixture orders default to USD, so the total is genuinely one
    // currency and the caller can safely format it as such.
    expect(now.revenue.currencies).toContain("USD");
    expect(new Set(now.revenue.currencies).size).toBe(now.revenue.currencies.length);
  });

  it("reports an average that matches the settled totals it published", async () => {
    const now = await getSummary();
    expect(now.revenue.averageOrderValueCents).toBe(
      Math.round(now.revenue.settledGrossCents / now.revenue.settledOrderCount),
    );
  });

  it("counts unsettled orders where they belong, not in revenue", async () => {
    const now = await getSummary();
    expect(now.orders.pending - baseline.orders.pending).toBe(1);
    expect(now.orders.refunded - baseline.orders.refunded).toBe(1);
    expect((now.orders.byStatus.CANCELLED ?? 0) - (baseline.orders.byStatus.CANCELLED ?? 0)).toBe(1);
    expect((now.orders.byStatus.PAID ?? 0) - (baseline.orders.byStatus.PAID ?? 0)).toBe(2);
  });

  it("counts published products and registered users", async () => {
    const now = await getSummary();
    expect(now.catalog.publishedProducts - baseline.catalog.publishedProducts).toBe(2);
    // Only the buyer registered after the baseline was taken.
    expect(now.customers.total - baseline.customers.total).toBe(1);
  });

  it("ranks best sellers by settled quantity only", async () => {
    const res = await http()
      .get("/v1/admin/analytics/top-products?limit=50")
      .set(auth(adminToken))
      .expect(200);

    const rows = res.body as Array<{ id: string; unitsSold: number; slug: string }>;
    const hot = rows.find((r) => r.id === hotProductId);
    const cool = rows.find((r) => r.id === coolProductId);

    expect(hot).toBeDefined();
    expect(cool).toBeDefined();
    // 3 from the paid order + 1 from the old paid order. The 50 pending, 40
    // refunded and 30 cancelled units are not sales.
    expect(hot?.unitsSold).toBe(4);
    expect(cool?.unitsSold).toBe(1);
    expect(rows.indexOf(hot!)).toBeLessThan(rows.indexOf(cool!));
  });

  it("honours the limit and refuses an absurd one", async () => {
    const res = await http()
      .get("/v1/admin/analytics/top-products?limit=1")
      .set(auth(adminToken))
      .expect(200);
    expect(res.body).toHaveLength(1);

    // An unbounded limit is a free full-table scan for any staff account.
    await http().get("/v1/admin/analytics/top-products?limit=5000").set(auth(adminToken)).expect(400);
    await http().get("/v1/admin/analytics/summary?days=0").set(auth(adminToken)).expect(400);
  });
});
