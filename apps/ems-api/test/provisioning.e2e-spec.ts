import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import * as argon2 from "argon2";
import { Client as PgClient } from "pg";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { ControlPrismaService } from "../src/control-db/control-prisma.service";

const FIXTURE_PREFIX = "e2e-prov-";

describe("School provisioning (e2e)", () => {
  let app: INestApplication;
  let controlPrisma: ControlPrismaService;
  let platformAccessToken: string;

  const platformEmail = `${FIXTURE_PREFIX}platform-${Date.now()}@wisdomcampus.example`;
  const platformPassword = "Sup3rSecret!Pass";
  const slug = `${FIXTURE_PREFIX}${Date.now()}`;
  const schoolAdminEmail = `${FIXTURE_PREFIX}admin-${Date.now()}@example.com`;
  const schoolAdminPassword = "Sup3rSecret!Pass";

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

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
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

    const loginRes = await request(app.getHttpServer())
      .post("/v1/platform/auth/login")
      .send({ email: platformEmail, password: platformPassword })
      .expect(200);
    platformAccessToken = loginRes.body.accessToken;
  });

  afterAll(async () => {
    if (controlPrisma) await purgeFixtures().catch(() => undefined);
    if (app) await app.close();
  });

  it("provisions a school end to end: database, migrations, seeded admin", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/platform/schools")
      .set("Authorization", `Bearer ${platformAccessToken}`)
      .send({
        name: "E2E Test School",
        slug,
        adminEmail: schoolAdminEmail,
        adminPassword: schoolAdminPassword,
        adminFirstName: "E2E",
        adminLastName: "Admin",
      })
      .expect(201);

    expect(res.body.school.status).toBe("ACTIVE");

    const school = await controlPrisma.school.findUniqueOrThrow({ where: { slug } });
    expect(school.databaseName).toBe(`wisdom_ems_school_${slug.replace(/-/g, "_")}`);

    // The physical database actually has the tenant schema's tables.
    const tenantDb = new PgClient({
      connectionString: `postgresql://wisdom:wisdom@postgres:5432/${school.databaseName}?schema=public`,
    });
    await tenantDb.connect();
    try {
      const usersTable = await tenantDb.query("SELECT to_regclass('public.users') AS table_name");
      expect(usersTable.rows[0].table_name).toBe("users");
    } finally {
      await tenantDb.end();
    }

    const loginRes = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ schoolSlug: slug, email: schoolAdminEmail, password: schoolAdminPassword })
      .expect(200);
    expect(loginRes.body.user.roles).toContain("SCHOOL_ADMIN");
    expect(loginRes.body.user.schoolSlug).toBe(slug);
  });

  it("refuses to provision a second school with the same slug, and creates no orphan row", async () => {
    const before = await controlPrisma.school.count({ where: { slug } });

    await request(app.getHttpServer())
      .post("/v1/platform/schools")
      .set("Authorization", `Bearer ${platformAccessToken}`)
      .send({
        name: "Duplicate",
        slug,
        adminEmail: `${FIXTURE_PREFIX}other-${Date.now()}@example.com`,
        adminPassword: "Sup3rSecret!Pass",
        adminFirstName: "Other",
        adminLastName: "Admin",
      })
      .expect(409);

    const after = await controlPrisma.school.count({ where: { slug } });
    expect(after).toBe(before);
  });

  it("refuses a slug that isn't a valid database identifier", async () => {
    await request(app.getHttpServer())
      .post("/v1/platform/schools")
      .set("Authorization", `Bearer ${platformAccessToken}`)
      .send({
        name: "Bad Slug",
        slug: "Not Valid!",
        adminEmail: `${FIXTURE_PREFIX}bad-${Date.now()}@example.com`,
        adminPassword: "Sup3rSecret!Pass",
        adminFirstName: "Bad",
        adminLastName: "Admin",
      })
      .expect(400);
  });

  it("refuses school provisioning without a platform token", async () => {
    await request(app.getHttpServer())
      .post("/v1/platform/schools")
      .send({ name: "No Auth", slug: `${FIXTURE_PREFIX}noauth` })
      .expect(401);
  });
});
