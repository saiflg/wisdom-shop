import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import * as argon2 from "argon2";
import { Client as PgClient } from "pg";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { ControlPrismaService } from "../src/control-db/control-prisma.service";

/**
 * The test that matters most for this whole architecture: proves the
 * AsyncLocalStorage-based tenant resolution (see tenancy/tenant-context.ts)
 * never lets one school see another's data, including under concurrent
 * requests — the one failure mode a sequential test structurally cannot
 * catch, since context-bleed only shows up when two in-flight requests
 * interleave.
 */
const FIXTURE_PREFIX = "e2e-iso-";

describe("Tenant isolation (e2e)", () => {
  let app: INestApplication;
  let controlPrisma: ControlPrismaService;
  let platformAccessToken: string;

  const platformEmail = `${FIXTURE_PREFIX}platform-${Date.now()}@wisdomcampus.example`;
  const platformPassword = "Sup3rSecret!Pass";

  const schoolA = { slug: `${FIXTURE_PREFIX}a-${Date.now()}`, adminEmail: `${FIXTURE_PREFIX}a-admin@example.com` };
  const schoolB = { slug: `${FIXTURE_PREFIX}b-${Date.now()}`, adminEmail: `${FIXTURE_PREFIX}b-admin@example.com` };
  const adminPassword = "Sup3rSecret!Pass";

  let tokenA: string;
  let tokenB: string;
  let studentIdA: string;
  let studentIdB: string;

  async function purgeFixtures() {
    const schools = await controlPrisma.school.findMany({ where: { slug: { startsWith: FIXTURE_PREFIX } } });
    for (const school of schools) {
      const admin = new PgClient({ connectionString: process.env.POSTGRES_ADMIN_URL });
      await admin.connect();
      await admin
        .query(`DROP DATABASE IF EXISTS "${school.databaseName}" WITH (FORCE)`)
        .catch(() => undefined);
      await admin.end();
    }
    await controlPrisma.provisioningAttempt.deleteMany({
      where: { school: { slug: { startsWith: FIXTURE_PREFIX } } },
    });
    await controlPrisma.school.deleteMany({ where: { slug: { startsWith: FIXTURE_PREFIX } } });
    await controlPrisma.platformUser.deleteMany({ where: { email: { startsWith: FIXTURE_PREFIX } } });
  }

  async function provisionSchool(fixture: { slug: string; adminEmail: string }) {
    const res = await request(app.getHttpServer())
      .post("/v1/platform/schools")
      .set("Authorization", `Bearer ${platformAccessToken}`)
      .send({
        name: fixture.slug,
        slug: fixture.slug,
        adminEmail: fixture.adminEmail,
        adminPassword,
        adminFirstName: "Admin",
        adminLastName: fixture.slug,
      })
      .expect(201);
    expect(res.body.school.status).toBe("ACTIVE");

    const loginRes = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ schoolSlug: fixture.slug, email: fixture.adminEmail, password: adminPassword })
      .expect(200);
    return loginRes.body.accessToken as string;
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    // Bound once so the concurrent requests below don't race supertest's
    // implicit per-request listen/teardown against each other — same fix
    // as the shop's own refresh-race.e2e-spec.ts, and the actual cause of
    // the ECONNRESET seen here before this was added (confirmed by firing
    // the identical request pattern via real background curl processes
    // against the already-listening dev server, which never failed).
    const server = app.getHttpServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));

    controlPrisma = app.get(ControlPrismaService);

    await purgeFixtures();

    await controlPrisma.platformUser.create({
      data: {
        email: platformEmail,
        passwordHash: await argon2.hash(platformPassword),
        firstName: "E2E",
        lastName: "Platform",
        roles: ["PLATFORM_ADMIN"],
      },
    });
    const platformLogin = await request(app.getHttpServer())
      .post("/v1/platform/auth/login")
      .send({ email: platformEmail, password: platformPassword })
      .expect(200);
    platformAccessToken = platformLogin.body.accessToken;

    tokenA = await provisionSchool(schoolA);
    tokenB = await provisionSchool(schoolB);

    const studentA = await request(app.getHttpServer())
      .post("/v1/students")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ firstName: "Alpha", lastName: "Student" })
      .expect(201);
    studentIdA = studentA.body.id;

    const studentB = await request(app.getHttpServer())
      .post("/v1/students")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ firstName: "Beta", lastName: "Student" })
      .expect(201);
    studentIdB = studentB.body.id;
  });

  afterAll(async () => {
    if (controlPrisma) await purgeFixtures().catch(() => undefined);
    if (app) await app.close();
  });

  it("never lists another school's students", async () => {
    const listA = await request(app.getHttpServer())
      .get("/v1/students")
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);
    expect(listA.body.map((s: { id: string }) => s.id)).toContain(studentIdA);
    expect(listA.body.map((s: { id: string }) => s.id)).not.toContain(studentIdB);

    const listB = await request(app.getHttpServer())
      .get("/v1/students")
      .set("Authorization", `Bearer ${tokenB}`)
      .expect(200);
    expect(listB.body.map((s: { id: string }) => s.id)).toContain(studentIdB);
    expect(listB.body.map((s: { id: string }) => s.id)).not.toContain(studentIdA);
  });

  it("returns 404 (not 403) fetching another school's student by id — existence isn't leaked", async () => {
    await request(app.getHttpServer())
      .get(`/v1/students/${studentIdB}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/v1/students/${studentIdA}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .expect(404);
  });

  it("keeps each school's data correct under concurrent, interleaved requests", async () => {
    // Alternating A/B requests fired together — a sequential test can't
    // surface an AsyncLocalStorage context bleed, since that only shows up
    // when two in-flight requests' contexts could be confused with each
    // other. 20 rounds, 40 requests, deliberately interleaved rather than
    // batched by school.
    const rounds = 20;
    const requests: Promise<{ token: "A" | "B"; ids: string[] }>[] = [];

    for (let i = 0; i < rounds; i++) {
      requests.push(
        request(app.getHttpServer())
          .get("/v1/students")
          .set("Authorization", `Bearer ${tokenA}`)
          .then((res) => ({ token: "A" as const, ids: res.body.map((s: { id: string }) => s.id) })),
      );
      requests.push(
        request(app.getHttpServer())
          .get("/v1/students")
          .set("Authorization", `Bearer ${tokenB}`)
          .then((res) => ({ token: "B" as const, ids: res.body.map((s: { id: string }) => s.id) })),
      );
    }

    const results = await Promise.all(requests);

    for (const result of results) {
      if (result.token === "A") {
        expect(result.ids).toContain(studentIdA);
        expect(result.ids).not.toContain(studentIdB);
      } else {
        expect(result.ids).toContain(studentIdB);
        expect(result.ids).not.toContain(studentIdA);
      }
    }
  });
});
