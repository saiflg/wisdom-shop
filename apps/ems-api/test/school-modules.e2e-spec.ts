import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Client as PgClient } from "pg";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { ControlPrismaService } from "../src/control-db/control-prisma.service";

const FIXTURE_PREFIX = "e2e-modules-";

/**
 * Module entitlements, end to end.
 *
 * The point of this suite is the one thing a unit test cannot show: that a
 * switch in the Super Admin console actually closes a door in the school's
 * API. Everything else here — the audit trail, the core-module refusal — is
 * about that switch being trustworthy once flicked.
 */
describe("School modules (e2e)", () => {
  let app: INestApplication;
  let controlPrisma: ControlPrismaService;
  let platformToken: string;
  let adminToken: string;
  let schoolId: string;

  const platformEmail = `${FIXTURE_PREFIX}platform-${Date.now()}@wisdomcampus.example`;
  const password = "Sup3rSecret!Pass";
  const school = { slug: `${FIXTURE_PREFIX}${Date.now()}`, adminEmail: `${FIXTURE_PREFIX}admin@example.com` };

  const asPlatform = () => ({ Authorization: `Bearer ${platformToken}` });
  const asAdmin = () => ({ Authorization: `Bearer ${adminToken}` });

  async function setModules(modules: { module: string; enabled: boolean }[], reason: string, expected = 200) {
    return request(app.getHttpServer())
      .put(`/v1/platform/schools/${schoolId}/modules`)
      .set(asPlatform())
      .send({ modules, reason })
      .expect(expected);
  }

  async function purgeFixtures() {
    const schools = await controlPrisma.school.findMany({ where: { slug: { startsWith: FIXTURE_PREFIX } } });
    for (const s of schools) {
      const admin = new PgClient({ connectionString: process.env.POSTGRES_ADMIN_URL });
      await admin.connect();
      await admin.query(`DROP DATABASE IF EXISTS "${s.databaseName}" WITH (FORCE)`).catch(() => undefined);
      await admin.end();
    }
    await controlPrisma.schoolModuleChange.deleteMany({
      where: { school: { slug: { startsWith: FIXTURE_PREFIX } } },
    });
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
      .set(asPlatform())
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

    const login = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ schoolSlug: school.slug, email: school.adminEmail, password })
      .expect(200);
    adminToken = login.body.accessToken;
  }, 180000);

  afterAll(async () => {
    if (controlPrisma) await purgeFixtures().catch(() => undefined);
    if (app) await app.close();
  }, 180000);

  describe("the catalog", () => {
    it("lists every module with something an operator can read", async () => {
      const res = await request(app.getHttpServer())
        .get("/v1/platform/schools/modules/catalog")
        .set(asPlatform())
        .expect(200);

      expect(res.body.length).toBeGreaterThan(10);
      expect(res.body.every((m: { label: string; description: string }) => m.label && m.description)).toBe(true);
      expect(res.body.find((m: { key: string }) => m.key === "PAYROLL")).toMatchObject({ core: false });
      expect(res.body.find((m: { key: string }) => m.key === "STUDENTS")).toMatchObject({ core: true });
    });

    it("is not readable without a platform login", async () => {
      await request(app.getHttpServer()).get("/v1/platform/schools/modules/catalog").expect(401);
    });

    it("is not reachable with a *school* admin's token", async () => {
      // A school administrator is an administrator of their school, not of
      // the platform. The two token types are separate on purpose.
      await request(app.getHttpServer())
        .get("/v1/platform/schools/modules/catalog")
        .set(asAdmin())
        .expect(401);
    });
  });

  describe("switching a module off", () => {
    it("starts with attendance available to the school", async () => {
      await request(app.getHttpServer()).get("/v1/attendance/registers/does-not-exist").set(asAdmin()).expect(404);
    });

    it("closes the door on the school's API, not just the menu", async () => {
      // The assertion this whole feature exists for.
      await setModules([{ module: "ATTENDANCE", enabled: false }], "Downgraded to the basic plan");

      const res = await request(app.getHttpServer())
        .get("/v1/attendance/registers/does-not-exist")
        .set(asAdmin())
        .expect(403);

      // Names the module rather than saying "forbidden": the administrator
      // hitting this has done nothing wrong and needs to know what to ask for.
      expect(res.body.message).toContain("Attendance");
    });

    it("takes effect immediately rather than after the cache expires", async () => {
      // Already proved by the test above running straight after the write,
      // but stated on its own because the invalidate call is easy to delete
      // and nothing else would fail if it were.
      await setModules([{ module: "ATTENDANCE", enabled: true }], "Restored");
      await request(app.getHttpServer()).get("/v1/attendance/registers/does-not-exist").set(asAdmin()).expect(404);
    });

    it("leaves every other module alone", async () => {
      // Switched *on* first, deliberately. Payroll is not in the default set,
      // so asserting that it is refused without enabling it first would pass
      // whether or not this feature worked at all — the first version of this
      // test did exactly that.
      await setModules([{ module: "PAYROLL", enabled: true }], "Added payroll for this school");
      await request(app.getHttpServer()).get("/v1/payroll/runs").set(asAdmin()).expect(200);

      await setModules([{ module: "PAYROLL", enabled: false }], "Not purchased");
      await request(app.getHttpServer()).get("/v1/payroll/runs").set(asAdmin()).expect(403);
      // Attendance was restored above and must be unaffected by a payroll change.
      await request(app.getHttpServer()).get("/v1/attendance/registers/does-not-exist").set(asAdmin()).expect(404);
    });

    it("gates the AI drafting route without gating the manual one", async () => {
      // Writing a scheme of work by hand is ordinary academics; only the AI
      // drafting is the paid module. Gating the controller would have taken
      // the manual path with it.
      await setModules([{ module: "AI_CURRICULUM", enabled: false }], "AI not included");

      await request(app.getHttpServer())
        .post("/v1/schemes-of-work/generate")
        .set(asAdmin())
        .send({ subjectId: "whatever", academicYear: "2026/2027", term: "Term 1" })
        .expect(403);

      // The manual list route still answers.
      await request(app.getHttpServer()).get("/v1/schemes-of-work").set(asAdmin()).expect(200);
    });
  });

  describe("core modules", () => {
    it("refuses to switch off something a school cannot run without", async () => {
      const res = await setModules([{ module: "STUDENTS", enabled: false }], "Trying it on", 400);
      expect(res.body.message).toContain("cannot be switched off");
    });

    it("refuses to switch off accessibility, which is never an upsell", async () => {
      await setModules([{ module: "ACCESSIBILITY", enabled: false }], "Trying it on", 400);
    });

    it("still lists them as enabled for the school", async () => {
      const res = await request(app.getHttpServer()).get("/v1/school/modules").set(asAdmin()).expect(200);
      expect(res.body.modules).toEqual(expect.arrayContaining(["STUDENTS", "STAFF", "ACADEMICS", "ACCESSIBILITY"]));
    });
  });

  describe("the record of who changed what", () => {
    it("writes one entry per module changed, with the reason and the operator", async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/platform/schools/${schoolId}`)
        .set(asPlatform())
        .expect(200);

      // Most recent first, so this is the switch-off from the test above,
      // and the switch-on that preceded it is still there underneath.
      const payrollChanges = res.body.moduleChanges.filter((c: { module: string }) => c.module === "PAYROLL");
      expect(payrollChanges[0]).toMatchObject({ enabled: false, reason: "Not purchased" });
      expect(payrollChanges[0].actorEmail).toBe(platformEmail);
      expect(payrollChanges[1]).toMatchObject({ enabled: true, reason: "Added payroll for this school" });
    });

    it("records nothing when a save changes nothing", async () => {
      const before = await request(app.getHttpServer())
        .get(`/v1/platform/schools/${schoolId}`)
        .set(asPlatform())
        .expect(200);

      // PAYROLL is already off; saying so again is not a decision.
      await setModules([{ module: "PAYROLL", enabled: false }], "Confirming, changing nothing");

      const after = await request(app.getHttpServer())
        .get(`/v1/platform/schools/${schoolId}`)
        .set(asPlatform())
        .expect(200);
      expect(after.body.moduleChanges.length).toBe(before.body.moduleChanges.length);
    });

    it("requires a reason", async () => {
      await request(app.getHttpServer())
        .put(`/v1/platform/schools/${schoolId}/modules`)
        .set(asPlatform())
        .send({ modules: [{ module: "PAYROLL", enabled: true }] })
        .expect(400);
    });

    it("refuses a module key it does not recognise", async () => {
      await setModules([{ module: "TELEPORTATION", enabled: true }], "Worth a try", 400);
    });
  });

  describe("what the school itself can see", () => {
    it("tells a signed-in school user which modules they have", async () => {
      const res = await request(app.getHttpServer()).get("/v1/school/modules").set(asAdmin()).expect(200);
      expect(Array.isArray(res.body.modules)).toBe(true);
      expect(res.body.modules).not.toContain("PAYROLL");
    });

    it("is not readable without signing in", async () => {
      await request(app.getHttpServer()).get("/v1/school/modules").expect(401);
    });
  });

  describe("editing the school itself", () => {
    it("renames a school", async () => {
      const res = await request(app.getHttpServer())
        .patch(`/v1/platform/schools/${schoolId}`)
        .set(asPlatform())
        .send({ name: "Renamed Academy" })
        .expect(200);
      expect(res.body.name).toBe("Renamed Academy");
    });

    it("sets and clears a custom domain", async () => {
      const domain = `${FIXTURE_PREFIX}${Date.now()}.example`;
      await request(app.getHttpServer())
        .patch(`/v1/platform/schools/${schoolId}`)
        .set(asPlatform())
        .send({ customDomain: domain })
        .expect(200);

      const cleared = await request(app.getHttpServer())
        .patch(`/v1/platform/schools/${schoolId}`)
        .set(asPlatform())
        .send({ customDomain: "" })
        .expect(200);
      // An empty string clears; without that there is no way to release a
      // domain, and the unique constraint would block it forever.
      expect(cleared.body.customDomain).toBeNull();
    });

    it("refuses a domain another school already claims", async () => {
      const domain = `${FIXTURE_PREFIX}taken-${Date.now()}.example`;
      const other = await controlPrisma.school.create({
        data: {
          name: `${FIXTURE_PREFIX}other`,
          slug: `${FIXTURE_PREFIX}other-${Date.now()}`,
          databaseName: `${FIXTURE_PREFIX}other_db`.replace(/-/g, "_"),
          customDomain: domain,
          status: "ACTIVE",
        },
      });

      const res = await request(app.getHttpServer())
        .patch(`/v1/platform/schools/${schoolId}`)
        .set(asPlatform())
        .send({ customDomain: domain })
        .expect(409);
      expect(res.body.message).toContain("domain");

      await controlPrisma.school.delete({ where: { id: other.id } });
    });

    it("does not offer to change the slug", async () => {
      // It named the database and is what users type at login. Whitelist
      // validation means sending it is a 400, not a silent no-op.
      await request(app.getHttpServer())
        .patch(`/v1/platform/schools/${schoolId}`)
        .set(asPlatform())
        .send({ slug: "something-else" })
        .expect(400);
    });

    it("is not editable by a school administrator", async () => {
      await request(app.getHttpServer())
        .patch(`/v1/platform/schools/${schoolId}`)
        .set(asAdmin())
        .send({ name: "Self Promoted Academy" })
        .expect(401);
    });
  });
});
