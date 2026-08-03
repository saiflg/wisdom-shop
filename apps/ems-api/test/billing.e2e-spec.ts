import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Client as PgClient } from "pg";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { ControlPrismaService } from "../src/control-db/control-prisma.service";

const FIXTURE_PREFIX = "e2e-bill-";

describe("Billing (e2e)", () => {
  let app: INestApplication;
  let controlPrisma: ControlPrismaService;
  let platformToken: string;
  let schoolToken: string;
  let schoolId: string;
  let planId: string;

  const platformEmail = `${FIXTURE_PREFIX}platform-${Date.now()}@wisdomcampus.example`;
  const password = "Sup3rSecret!Pass";
  const school = { slug: `${FIXTURE_PREFIX}${Date.now()}`, adminEmail: `${FIXTURE_PREFIX}admin@example.com` };
  const planCode = `${FIXTURE_PREFIX}growth-${Date.now()}`;

  const auth = () => ({ Authorization: `Bearer ${platformToken}` });

  async function purgeFixtures() {
    const schools = await controlPrisma.school.findMany({ where: { slug: { startsWith: FIXTURE_PREFIX } } });
    for (const s of schools) {
      const admin = new PgClient({ connectionString: process.env.POSTGRES_ADMIN_URL });
      await admin.connect();
      await admin.query(`DROP DATABASE IF EXISTS "${s.databaseName}" WITH (FORCE)`).catch(() => undefined);
      await admin.end();
    }
    await controlPrisma.invoiceLine.deleteMany({
      where: { invoice: { school: { slug: { startsWith: FIXTURE_PREFIX } } } },
    });
    await controlPrisma.invoice.deleteMany({ where: { school: { slug: { startsWith: FIXTURE_PREFIX } } } });
    await controlPrisma.subscription.deleteMany({ where: { school: { slug: { startsWith: FIXTURE_PREFIX } } } });
    await controlPrisma.subscriptionPlan.deleteMany({ where: { code: { startsWith: FIXTURE_PREFIX } } });
    await controlPrisma.schoolLifecycleEvent.deleteMany({
      where: { school: { slug: { startsWith: FIXTURE_PREFIX } } },
    });
    await controlPrisma.provisioningAttempt.deleteMany({ where: { school: { slug: { startsWith: FIXTURE_PREFIX } } } });
    await controlPrisma.school.deleteMany({ where: { slug: { startsWith: FIXTURE_PREFIX } } });
    await controlPrisma.platformUser.deleteMany({ where: { email: { startsWith: FIXTURE_PREFIX } } });
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    await new Promise<void>((resolve) => app.getHttpServer().listen(0, resolve));

    controlPrisma = app.get(ControlPrismaService);
    await purgeFixtures();

    const argon2 = await import("argon2");
    await controlPrisma.platformUser.create({
      data: {
        email: platformEmail,
        passwordHash: await argon2.hash(password),
        firstName: "E2E",
        lastName: "Platform",
        roles: ["PLATFORM_ADMIN"],
      },
    });

    const platformLogin = await request(app.getHttpServer())
      .post("/v1/platform/auth/login")
      .send({ email: platformEmail, password })
      .expect(200);
    platformToken = platformLogin.body.accessToken;

    const created = await request(app.getHttpServer())
      .post("/v1/platform/schools")
      .set(auth())
      .send({
        name: school.slug,
        slug: school.slug,
        adminEmail: school.adminEmail,
        adminPassword: password,
        adminFirstName: "Admin",
        adminLastName: school.slug,
      })
      .expect(201);
    schoolId = created.body.school.id;

    const schoolLogin = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ schoolSlug: school.slug, email: school.adminEmail, password })
      .expect(200);
    schoolToken = schoolLogin.body.accessToken;
    // See schemes-of-work.e2e-spec.ts for why these hooks need 120s.
  }, 120000);

  afterAll(async () => {
    if (controlPrisma) await purgeFixtures().catch(() => undefined);
    if (app) await app.close();
  }, 120000);

  it("refuses billing to a school user's token", async () => {
    await request(app.getHttpServer())
      .get("/v1/platform/billing/plans")
      .set("Authorization", `Bearer ${schoolToken}`)
      .expect(401);
  });

  it("creates a plan with an integer price", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/platform/billing/plans")
      .set(auth())
      .send({ code: planCode, name: "Growth", priceCents: 4500000, currency: "ngn", interval: "MONTHLY" })
      .expect(201);
    planId = res.body.id;
    expect(res.body.priceCents).toBe(4500000);
    expect(res.body.currency).toBe("NGN");
  });

  it("rejects a fractional price outright", async () => {
    await request(app.getHttpServer())
      .post("/v1/platform/billing/plans")
      .set(auth())
      .send({ code: `${planCode}-bad`, name: "Bad", priceCents: 4500.5, currency: "NGN", interval: "MONTHLY" })
      .expect(400);
  });

  it("subscribes a school and snapshots the price", async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/platform/billing/schools/${schoolId}/subscription`)
      .set(auth())
      .send({ planId })
      .expect(201);
    expect(res.body.status).toBe("ACTIVE");
    expect(res.body.priceCents).toBe(4500000);
    expect(new Date(res.body.currentPeriodEnd).getTime()).toBeGreaterThan(
      new Date(res.body.currentPeriodStart).getTime(),
    );
  });

  it("does not reprice an existing subscription when the plan price changes", async () => {
    // The invariant that protects a customer from a catalogue edit.
    await request(app.getHttpServer())
      .patch(`/v1/platform/billing/plans/${planId}`)
      .set(auth())
      .send({ priceCents: 9900000 })
      .expect(200);

    const subscription = await request(app.getHttpServer())
      .get(`/v1/platform/billing/schools/${schoolId}/subscription`)
      .set(auth())
      .expect(200);
    expect(subscription.body.priceCents).toBe(4500000);
  });

  it("generates an invoice whose total equals the sum of its lines", async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/platform/billing/schools/${schoolId}/invoices`)
      .set(auth())
      .send({
        lines: [
          { description: "Growth plan", quantity: 1, unitPriceCents: 4500000 },
          { description: "Extra seats", quantity: 12, unitPriceCents: 25000 },
        ],
      })
      .expect(201);

    expect(res.body.status).toBe("DRAFT");
    expect(res.body.number).toMatch(/^INV-\d{6,}$/);
    const summed = res.body.lines.reduce((sum: number, line: { amountCents: number }) => sum + line.amountCents, 0);
    expect(res.body.totalCents).toBe(summed);
    expect(res.body.totalCents).toBe(4800000);
  });

  it("gives every concurrently generated invoice a distinct number", async () => {
    // The counter is incremented inside the same transaction as the insert.
    // Generating the number outside it (count() + 1) is the classic way to
    // hand two simultaneous requests the same invoice number.
    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        request(app.getHttpServer())
          .post(`/v1/platform/billing/schools/${schoolId}/invoices`)
          .set(auth())
          .send({ lines: [{ description: "Concurrent", quantity: 1, unitPriceCents: 1000 }] }),
      ),
    );

    for (const res of responses) expect(res.status).toBe(201);
    const numbers = responses.map((res) => res.body.number);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("walks an invoice from draft to paid and then refuses to rewrite it", async () => {
    const created = await request(app.getHttpServer())
      .post(`/v1/platform/billing/schools/${schoolId}/invoices`)
      .set(auth())
      .send({ lines: [{ description: "Term fee", quantity: 1, unitPriceCents: 500000 }] })
      .expect(201);
    const number = created.body.number;

    await request(app.getHttpServer()).patch(`/v1/platform/billing/invoices/${number}/issue`).set(auth()).expect(200);
    const paid = await request(app.getHttpServer())
      .patch(`/v1/platform/billing/invoices/${number}/pay`)
      .set(auth())
      .expect(200);
    expect(paid.body.paidAt).not.toBeNull();

    // A settled invoice is immutable.
    const refused = await request(app.getHttpServer())
      .patch(`/v1/platform/billing/invoices/${number}/void`)
      .set(auth())
      .expect(409);
    expect(refused.body.message).toContain("credit note");
  });

  it("reports collected and outstanding separately", async () => {
    const res = await request(app.getHttpServer()).get("/v1/platform/billing/revenue").set(auth()).expect(200);
    const collected = res.body.collected.find((row: { currency: string }) => row.currency === "NGN");
    expect(collected.amountCents).toBeGreaterThanOrEqual(500000);
    expect(Array.isArray(res.body.outstanding)).toBe(true);
    expect(res.body.subscriptions.some((row: { status: string }) => row.status === "ACTIVE")).toBe(true);
  });

  it("refuses a second subscription for the same school", async () => {
    await request(app.getHttpServer())
      .post(`/v1/platform/billing/schools/${schoolId}/subscription`)
      .set(auth())
      .send({ planId })
      .expect(409);
  });

  it("treats a cancelled subscription as terminal", async () => {
    await request(app.getHttpServer())
      .patch(`/v1/platform/billing/schools/${schoolId}/subscription/cancel`)
      .set(auth())
      .expect(200);

    const res = await request(app.getHttpServer())
      .patch(`/v1/platform/billing/schools/${schoolId}/subscription/activate`)
      .set(auth())
      .expect(409);
    expect(res.body.message).toContain("cancelled");
  });

  it("leaves the school itself active — billing state never suspends on its own", async () => {
    // Cutting a customer off stays an explicit operator decision.
    const detail = await request(app.getHttpServer())
      .get(`/v1/platform/schools/${schoolId}`)
      .set(auth())
      .expect(200);
    expect(detail.body.status).toBe("ACTIVE");
  });
});
