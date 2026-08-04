import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createHmac } from "node:crypto";
import { Client as PgClient } from "pg";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { ControlPrismaService } from "../src/control-db/control-prisma.service";

const FIXTURE_PREFIX = "e2e-onboard-";
const SECRET = process.env.EDU_SETUP_SIGNING_SECRET as string;

/**
 * Independent reimplementation of the shop's createHandoffToken (never
 * imported — the two services share only the secret, not code). A test that
 * imported the shop's own signer could pass even if this service's verifier
 * silently drifted from what the shop actually produces.
 */
function mintToken(payload: { k: string; u: string; p: string; o: string }, ttlSeconds: number, secret = SECRET): string {
  const full = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const encoded = Buffer.from(JSON.stringify(full), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const signature = createHmac("sha256", secret)
    .update(encoded)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${encoded}.${signature}`;
}

describe("Onboarding from a shop license (e2e)", () => {
  let app: INestApplication;
  let controlPrisma: ControlPrismaService;

  async function purgeFixtures() {
    const schools = await controlPrisma.school.findMany({ where: { slug: { startsWith: FIXTURE_PREFIX } } });
    for (const school of schools) {
      const admin = new PgClient({ connectionString: process.env.POSTGRES_ADMIN_URL });
      await admin.connect();
      await admin.query(`DROP DATABASE IF EXISTS "${school.databaseName}" WITH (FORCE)`).catch(() => undefined);
      await admin.end();
    }
    await controlPrisma.school.deleteMany({ where: { slug: { startsWith: FIXTURE_PREFIX } } });
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    controlPrisma = app.get(ControlPrismaService);
    await purgeFixtures();
    // Explicit, like every other suite that provisions a school. The default
    // 60s was silently marginal: provisioning gets slower as a full run
    // progresses and more tenant databases accumulate on the same Postgres,
    // so this suite passed alone and failed at the hook in the full run —
    // which reads like a code fault and isn't one.
  }, 180000);

  afterAll(async () => {
    if (controlPrisma) await purgeFixtures().catch(() => undefined);
    if (app) await app.close();
  }, 180000);

  it("provisions a school from a valid handoff token and logs the new admin straight in", async () => {
    const licenseKey = `${FIXTURE_PREFIX}license-${Date.now()}`;
    const token = mintToken({ k: licenseKey, u: "shop-user-1", p: "prod-school-setup", o: "order-1" }, 300);
    const slug = `${FIXTURE_PREFIX}${Date.now()}`;

    const res = await request(app.getHttpServer())
      .post("/v1/onboarding/from-license")
      .send({
        token,
        schoolName: "Onboarded School",
        schoolSlug: slug,
        adminEmail: `${FIXTURE_PREFIX}admin@example.com`,
        adminPassword: "Sup3rSecret!Pass",
        adminFirstName: "New",
        adminLastName: "Admin",
      })
      .expect(200);

    expect(res.body.alreadyOnboarded).toBe(false);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.roles).toContain("SCHOOL_ADMIN");
    expect(res.body.user.schoolSlug).toBe(slug);

    const school = await controlPrisma.school.findUniqueOrThrow({ where: { slug } });
    expect(school.status).toBe("ACTIVE");
    expect(school.licenseKey).toBe(licenseKey);
    // Unlike every other suite, this one provisions inside the test body
    // rather than in a hook, so it needs its own timeout — the config's
    // 60s default is sized for ordinary API calls, and a school costs a
    // CREATE DATABASE plus every tenant migration.
  }, 180000);

  it("finds the existing school on a repeat call with the same license, rather than erroring or re-provisioning", async () => {
    const timestamp = Date.now();
    const licenseKey = `${FIXTURE_PREFIX}license-repeat-${timestamp}`;
    // Short on purpose: the second request below needs a DIFFERENT slug
    // that still fits the 32-char limit alongside it.
    const slug = `${FIXTURE_PREFIX}ra-${timestamp}`;
    const payload = { k: licenseKey, u: "shop-user-2", p: "prod-school-setup", o: "order-2" };

    const first = await request(app.getHttpServer())
      .post("/v1/onboarding/from-license")
      .send({
        token: mintToken(payload, 300),
        schoolName: "Repeat School",
        schoolSlug: slug,
        adminEmail: `${FIXTURE_PREFIX}repeat-admin@example.com`,
        adminPassword: "Sup3rSecret!Pass",
        adminFirstName: "Repeat",
        adminLastName: "Admin",
      })
      .expect(200);
    expect(first.body.alreadyOnboarded).toBe(false);

    const schoolCountBefore = await controlPrisma.school.count({ where: { licenseKey } });

    // The shop mints a fresh token per click, so a second (different) token
    // for the SAME license is the realistic repeat case, not a token replay.
    const second = await request(app.getHttpServer())
      .post("/v1/onboarding/from-license")
      .send({
        token: mintToken(payload, 300),
        schoolName: "Repeat School Again",
        schoolSlug: `${FIXTURE_PREFIX}rb-${timestamp}`,
        adminEmail: `${FIXTURE_PREFIX}repeat-admin-2@example.com`,
        adminPassword: "Sup3rSecret!Pass",
        adminFirstName: "Repeat",
        adminLastName: "Admin",
      })
      .expect(200);

    expect(second.body.alreadyOnboarded).toBe(true);
    expect(second.body.schoolSlug).toBe(slug);

    const schoolCountAfter = await controlPrisma.school.count({ where: { licenseKey } });
    expect(schoolCountAfter).toBe(schoolCountBefore);
    // Provisions in the test body too — see the note above.
  }, 180000);

  it("rejects a token signed with the wrong secret", async () => {
    const token = mintToken(
      { k: `${FIXTURE_PREFIX}wrong-secret`, u: "u", p: "p", o: "o" },
      300,
      "some_other_secret_at_least_32_chars___",
    );
    await request(app.getHttpServer())
      .post("/v1/onboarding/from-license")
      .send({
        token,
        schoolName: "Should Not Exist",
        schoolSlug: `${FIXTURE_PREFIX}wrong-secret`,
        adminEmail: `${FIXTURE_PREFIX}wrong@example.com`,
        adminPassword: "Sup3rSecret!Pass",
        adminFirstName: "A",
        adminLastName: "B",
      })
      .expect(400);
  });

  it("rejects an expired token", async () => {
    const token = mintToken({ k: `${FIXTURE_PREFIX}expired`, u: "u", p: "p", o: "o" }, -1);
    await request(app.getHttpServer())
      .post("/v1/onboarding/from-license")
      .send({
        token,
        schoolName: "Should Not Exist",
        schoolSlug: `${FIXTURE_PREFIX}expired`,
        adminEmail: `${FIXTURE_PREFIX}expired@example.com`,
        adminPassword: "Sup3rSecret!Pass",
        adminFirstName: "A",
        adminLastName: "B",
      })
      .expect(400);
  });
});
