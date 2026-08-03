import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Client as PgClient } from "pg";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { ControlPrismaService } from "../src/control-db/control-prisma.service";

const FIXTURE_PREFIX = "e2e-cycle-";

describe("Billing cycle (e2e)", () => {
  let app: INestApplication;
  let controlPrisma: ControlPrismaService;
  let platformToken: string;
  let schoolId: string;
  let planId: string;

  const platformEmail = `${FIXTURE_PREFIX}platform-${Date.now()}@wisdomcampus.example`;
  const password = "Sup3rSecret!Pass";
  const school = { slug: `${FIXTURE_PREFIX}${Date.now()}`, adminEmail: `${FIXTURE_PREFIX}admin@example.com` };
  const planCode = `${FIXTURE_PREFIX}plan-${Date.now()}`;

  const auth = () => ({ Authorization: `Bearer ${platformToken}` });
  const runCycle = () => request(app.getHttpServer()).post("/v1/platform/billing/cycle/run").set(auth());

  /** Drags the subscription's period end into the past so it is due. */
  async function makeDue(daysAgo = 1) {
    const end = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    await controlPrisma.subscription.update({
      where: { schoolId },
      data: { currentPeriodStart: new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000), currentPeriodEnd: end },
    });
    return end;
  }

  async function invoiceCount() {
    return controlPrisma.invoice.count({ where: { schoolId } });
  }

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

    const login = await request(app.getHttpServer())
      .post("/v1/platform/auth/login")
      .send({ email: platformEmail, password })
      .expect(200);
    platformToken = login.body.accessToken;

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

    const plan = await request(app.getHttpServer())
      .post("/v1/platform/billing/plans")
      .set(auth())
      .send({ code: planCode, name: "Cycle Plan", priceCents: 1000000, currency: "NGN", interval: "MONTHLY" })
      .expect(201);
    planId = plan.body.id;
    // See schemes-of-work.e2e-spec.ts for why these hooks need 120s.
  }, 120000);

  afterAll(async () => {
    if (controlPrisma) await purgeFixtures().catch(() => undefined);
    if (app) await app.close();
  }, 120000);

  it("does nothing for a subscription that is not yet due", async () => {
    await request(app.getHttpServer())
      .post(`/v1/platform/billing/schools/${schoolId}/subscription`)
      .set(auth())
      .send({ planId })
      .expect(201);

    const before = await invoiceCount();
    const res = await runCycle().expect(201);
    expect(res.body.renewed).toBe(0);
    expect(await invoiceCount()).toBe(before);
  });

  it("renews a due subscription and invoices it once", async () => {
    const previousEnd = await makeDue();
    const res = await runCycle().expect(201);

    expect(res.body.renewed).toBe(1);
    expect(res.body.invoicesCreated).toHaveLength(1);
    expect(await invoiceCount()).toBe(1);

    // The new period starts exactly where the old one ended: a late run
    // must not lose billable days.
    const subscription = await controlPrisma.subscription.findUniqueOrThrow({ where: { schoolId } });
    expect(subscription.currentPeriodStart.toISOString()).toBe(previousEnd.toISOString());
    expect(subscription.currentPeriodEnd.getTime()).toBeGreaterThan(previousEnd.getTime());
  });

  it("is a no-op when run again immediately", async () => {
    const before = await invoiceCount();
    const res = await runCycle().expect(201);
    expect(res.body.renewed).toBe(0);
    expect(await invoiceCount()).toBe(before);
  });

  it("never double-bills when the same due period is processed twice", async () => {
    // The core guarantee. Force the subscription back to a due state whose
    // period was already invoiced, then run again — the unique index must
    // reject the second invoice rather than charging the customer twice.
    const invoice = await controlPrisma.invoice.findFirstOrThrow({
      where: { schoolId },
      orderBy: { createdAt: "desc" },
    });
    await controlPrisma.subscription.update({
      where: { schoolId },
      data: { currentPeriodStart: invoice.periodStart, currentPeriodEnd: invoice.periodStart },
    });

    const before = await invoiceCount();
    const res = await runCycle().expect(201);

    expect(res.body.duplicatesSkipped).toBe(1);
    expect(res.body.renewed).toBe(0);
    expect(await invoiceCount()).toBe(before);
  });

  it("never double-bills under concurrent cycle runs", async () => {
    await makeDue(2);
    const before = await invoiceCount();

    // Six cycles at once, exactly like several instances ticking together.
    const responses = await Promise.all(Array.from({ length: 6 }, () => runCycle()));
    for (const res of responses) expect(res.status).toBe(201);

    const created = responses.reduce((sum, res) => sum + res.body.renewed, 0);
    expect(created).toBe(1);
    expect(await invoiceCount()).toBe(before + 1);
  });

  it("activates an expired trial without billing it", async () => {
    await controlPrisma.subscription.update({
      where: { schoolId },
      data: {
        status: "TRIALING",
        trialEndsAt: new Date(Date.now() - 60_000),
        currentPeriodEnd: new Date(Date.now() - 60_000),
      },
    });

    const before = await invoiceCount();
    const res = await runCycle().expect(201);

    expect(res.body.trialsActivated).toBe(1);
    expect(res.body.renewed).toBe(0);
    // A trial converting must not itself produce a charge.
    expect(await invoiceCount()).toBe(before);
    const subscription = await controlPrisma.subscription.findUniqueOrThrow({ where: { schoolId } });
    expect(subscription.status).toBe("ACTIVE");
  });

  it("applies a scheduled cancellation instead of renewing", async () => {
    await makeDue();
    await controlPrisma.subscription.update({ where: { schoolId }, data: { cancelAtPeriodEnd: true } });

    const before = await invoiceCount();
    const res = await runCycle().expect(201);

    expect(res.body.cancelled).toBe(1);
    expect(res.body.renewed).toBe(0);
    expect(await invoiceCount()).toBe(before);
    const subscription = await controlPrisma.subscription.findUniqueOrThrow({ where: { schoolId } });
    expect(subscription.status).toBe("CANCELED");
  });

  it("never bills a cancelled subscription, however overdue", async () => {
    await controlPrisma.subscription.update({
      where: { schoolId },
      data: { currentPeriodEnd: new Date("2020-01-01T00:00:00.000Z"), cancelAtPeriodEnd: false },
    });

    const before = await invoiceCount();
    const res = await runCycle().expect(201);
    expect(res.body.renewed).toBe(0);
    expect(await invoiceCount()).toBe(before);
  });

  it("refuses the manual trigger to a non-platform token", async () => {
    await request(app.getHttpServer()).post("/v1/platform/billing/cycle/run").expect(401);
  });
});
