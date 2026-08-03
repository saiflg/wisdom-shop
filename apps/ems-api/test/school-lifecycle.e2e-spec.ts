import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Client as PgClient } from "pg";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { ControlPrismaService } from "../src/control-db/control-prisma.service";

const FIXTURE_PREFIX = "e2e-life-";

describe("School lifecycle (e2e)", () => {
  let app: INestApplication;
  let controlPrisma: ControlPrismaService;
  let platformToken: string;
  let schoolToken: string;
  let schoolId: string;

  const platformEmail = `${FIXTURE_PREFIX}platform-${Date.now()}@wisdomcampus.example`;
  const password = "Sup3rSecret!Pass";
  const school = { slug: `${FIXTURE_PREFIX}${Date.now()}`, adminEmail: `${FIXTURE_PREFIX}admin@example.com` };

  async function purgeFixtures() {
    const schools = await controlPrisma.school.findMany({ where: { slug: { startsWith: FIXTURE_PREFIX } } });
    for (const s of schools) {
      const admin = new PgClient({ connectionString: process.env.POSTGRES_ADMIN_URL });
      await admin.connect();
      await admin.query(`DROP DATABASE IF EXISTS "${s.databaseName}" WITH (FORCE)`).catch(() => undefined);
      await admin.end();
    }
    await controlPrisma.schoolLifecycleEvent.deleteMany({
      where: { school: { slug: { startsWith: FIXTURE_PREFIX } } },
    });
    await controlPrisma.provisioningAttempt.deleteMany({ where: { school: { slug: { startsWith: FIXTURE_PREFIX } } } });
    await controlPrisma.school.deleteMany({ where: { slug: { startsWith: FIXTURE_PREFIX } } });
    await controlPrisma.platformUser.deleteMany({ where: { email: { startsWith: FIXTURE_PREFIX } } });
  }

  /** The school admin's own token doing an ordinary tenant-scoped read. */
  const asSchoolUser = () =>
    request(app.getHttpServer()).get("/v1/classes").set("Authorization", `Bearer ${schoolToken}`);

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
      .set("Authorization", `Bearer ${platformToken}`)
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

  it("locks the school out immediately on suspension, without waiting out the tenant cache", async () => {
    // Warm the tenant cache first — this is the whole point of the test. The
    // school row is now cached as ACTIVE for SCHOOL_CACHE_TTL_MS, so if
    // suspension didn't invalidate it the next call would still succeed.
    await asSchoolUser().expect(200);

    await request(app.getHttpServer())
      .patch(`/v1/platform/schools/${schoolId}/suspend`)
      .set("Authorization", `Bearer ${platformToken}`)
      .send({ reason: "Non-payment: invoice 4021 overdue" })
      .expect(200);

    // Same token, no delay.
    await asSchoolUser().expect(403);
  });

  it("refuses a fresh login to a suspended school too", async () => {
    await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ schoolSlug: school.slug, email: school.adminEmail, password })
      .expect(401);
  });

  it("records who suspended it and why", async () => {
    const detail = await request(app.getHttpServer())
      .get(`/v1/platform/schools/${schoolId}`)
      .set("Authorization", `Bearer ${platformToken}`)
      .expect(200);

    expect(detail.body.status).toBe("SUSPENDED");
    const [event] = detail.body.lifecycleEvents;
    expect(event).toMatchObject({
      fromStatus: "ACTIVE",
      toStatus: "SUSPENDED",
      reason: "Non-payment: invoice 4021 overdue",
      actorEmail: platformEmail,
    });
  });

  it("rejects suspending an already-suspended school", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/platform/schools/${schoolId}/suspend`)
      .set("Authorization", `Bearer ${platformToken}`)
      .send({ reason: "duplicate" })
      .expect(409);
    expect(res.body.message).toContain("already suspended");
  });

  it("requires a reason", async () => {
    await request(app.getHttpServer())
      .patch(`/v1/platform/schools/${schoolId}/reactivate`)
      .set("Authorization", `Bearer ${platformToken}`)
      .send({})
      .expect(400);
  });

  it("restores access on reactivation, again without a wait", async () => {
    await request(app.getHttpServer())
      .patch(`/v1/platform/schools/${schoolId}/reactivate`)
      .set("Authorization", `Bearer ${platformToken}`)
      .send({ reason: "Payment received" })
      .expect(200);

    const login = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ schoolSlug: school.slug, email: school.adminEmail, password })
      .expect(200);
    schoolToken = login.body.accessToken;

    await asSchoolUser().expect(200);
  });

  it("keeps both lifecycle events, newest first", async () => {
    const detail = await request(app.getHttpServer())
      .get(`/v1/platform/schools/${schoolId}`)
      .set("Authorization", `Bearer ${platformToken}`)
      .expect(200);

    expect(detail.body.lifecycleEvents).toHaveLength(2);
    expect(detail.body.lifecycleEvents[0].toStatus).toBe("ACTIVE");
    expect(detail.body.lifecycleEvents[1].toStatus).toBe("SUSPENDED");
  });

  it("refuses lifecycle changes from a school user's token", async () => {
    // A school admin must never be able to un-suspend their own school.
    await request(app.getHttpServer())
      .patch(`/v1/platform/schools/${schoolId}/suspend`)
      .set("Authorization", `Bearer ${schoolToken}`)
      .send({ reason: "should not work" })
      .expect(401);
  });
});
