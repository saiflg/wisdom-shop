import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Client as PgClient } from "pg";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { ControlPrismaService } from "../src/control-db/control-prisma.service";

const FIXTURE_PREFIX = "e2e-studvis-";

/**
 * What one child can see about the other children, through the real API.
 *
 * Two leaks shipped and were fixed on the same day, and both were the same
 * shape: row scoping written as "GUARDIAN and not SCHOOL_ADMIN", which a pupil
 * matches neither half of, so they fell through to the branch returning
 * everybody.
 *
 *   GET /students     — every child's name and email, and every linked
 *                       guardian's name and email
 *   GET /classes/:id  — every enrolment, and since GET /classes lists the ids,
 *                       the same roll one class at a time
 *
 * The unit tests pin the rules. These pin the routes: a real school, real
 * accounts, real sessions issued by the real login, asserting what a pupil
 * actually receives over HTTP. A rule can be correct while nothing calls it —
 * that is exactly how the second leak survived the first fix.
 */
describe("What one pupil can see about another (e2e)", () => {
  let app: INestApplication;
  let controlPrisma: ControlPrismaService;

  let adminToken: string;
  let sadeToken: string;
  let tundeToken: string;
  let guardianToken: string;

  let sadeProfileId: string;
  let tundeProfileId: string;
  let sadeClassId: string;
  let tundeClassId: string;

  const platformEmail = `${FIXTURE_PREFIX}platform-${Date.now()}@wisdomcampus.example`;
  const password = "Sup3rSecret!Pass";
  const school = { slug: `${FIXTURE_PREFIX}${Date.now()}`, adminEmail: `${FIXTURE_PREFIX}admin@example.com` };

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function login(email: string) {
    const res = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ schoolSlug: school.slug, email, password })
      .expect(200);
    return res.body.accessToken as string;
  }

  async function purgeFixtures() {
    const schools = await controlPrisma.school.findMany({ where: { slug: { startsWith: FIXTURE_PREFIX } } });
    for (const s of schools) {
      const admin = new PgClient({ connectionString: process.env.POSTGRES_ADMIN_URL });
      await admin.connect();
      await admin.query(`DROP DATABASE IF EXISTS "${s.databaseName}" WITH (FORCE)`).catch(() => undefined);
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

    await request(app.getHttpServer())
      .post("/v1/platform/schools")
      .set(auth(platformLogin.body.accessToken))
      .send({
        name: school.slug,
        slug: school.slug,
        adminEmail: school.adminEmail,
        adminPassword: password,
        adminFirstName: "Admin",
        adminLastName: "One",
      })
      .expect(201);

    adminToken = await login(school.adminEmail);

    // Two classes, so "another class" is a real place and not a hypothetical.
    const classA = await request(app.getHttpServer())
      .post("/v1/classes")
      .set(auth(adminToken))
      .send({ name: "Grade 5A", academicYear: "2026-2027" })
      .expect(201);
    sadeClassId = classA.body.id;

    const classB = await request(app.getHttpServer())
      .post("/v1/classes")
      .set(auth(adminToken))
      .send({ name: "Grade 6B", academicYear: "2026-2027" })
      .expect(201);
    tundeClassId = classB.body.id;

    const sadeEmail = `${FIXTURE_PREFIX}sade-${Date.now()}@example.com`;
    const sade = await request(app.getHttpServer())
      .post("/v1/students")
      .set(auth(adminToken))
      .send({ firstName: "Sade", lastName: "Learner", email: sadeEmail, password })
      .expect(201);
    sadeProfileId = sade.body.id;
    sadeToken = await login(sadeEmail);

    const tundeEmail = `${FIXTURE_PREFIX}tunde-${Date.now()}@example.com`;
    const tunde = await request(app.getHttpServer())
      .post("/v1/students")
      .set(auth(adminToken))
      .send({ firstName: "Tunde", lastName: "Other", email: tundeEmail, password })
      .expect(201);
    tundeProfileId = tunde.body.id;
    tundeToken = await login(tundeEmail);

    for (const [studentProfileId, classId] of [
      [sadeProfileId, sadeClassId],
      [tundeProfileId, tundeClassId],
    ] as const) {
      await request(app.getHttpServer())
        .post("/v1/enrollments")
        .set(auth(adminToken))
        .send({ studentProfileId, classId })
        .expect(201);
    }

    const guardianEmail = `${FIXTURE_PREFIX}guardian-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post("/v1/guardians")
      .set(auth(adminToken))
      .send({
        studentProfileId: sadeProfileId,
        relationship: "Mother",
        firstName: "Bola",
        lastName: "Parent",
        email: guardianEmail,
        password,
      })
      .expect(201);
    guardianToken = await login(guardianEmail);

    // A second family, so "another family's contact details" is a real thing
    // in this fixture and not a phrase. Without it the only guardian in the
    // school is Sade's own mother, and asserting her name is absent from
    // Sade's own record would be asserting the wrong thing.
    await request(app.getHttpServer())
      .post("/v1/guardians")
      .set(auth(adminToken))
      .send({
        studentProfileId: tundeProfileId,
        relationship: "Father",
        firstName: "Ngozi",
        lastName: "Elsewhere",
        email: `${FIXTURE_PREFIX}guardian2-${Date.now()}@example.com`,
        password,
      })
      .expect(201);
  }, 180000);

  afterAll(async () => {
    if (controlPrisma) await purgeFixtures().catch(() => undefined);
    if (app) await app.close();
  }, 180000);

  describe("GET /students", () => {
    it("gives a pupil themselves and nobody else", async () => {
      const res = await request(app.getHttpServer()).get("/v1/students").set(auth(sadeToken)).expect(200);

      const ids = res.body.map((s: { id: string }) => s.id);
      expect(ids).toEqual([sadeProfileId]);
      expect(ids).not.toContain(tundeProfileId);
    });

    it("does not hand a pupil another family's contact details", async () => {
      // What the leak actually exposed: not just names, but every linked
      // guardian's email address, for every child in the school.
      const res = await request(app.getHttpServer()).get("/v1/students").set(auth(sadeToken)).expect(200);

      const text = JSON.stringify(res.body);
      expect(text).not.toContain("Tunde");
      expect(text).not.toContain("Ngozi");

      // Her own mother DOES appear, on her own record, and should: a child's
      // own guardian is not "another family". An earlier version of this test
      // asserted otherwise and failed, which was the test being wrong rather
      // than the route.
      expect(text).toContain("Bola");
    });

    it("gives a guardian their own child", async () => {
      const res = await request(app.getHttpServer()).get("/v1/students").set(auth(guardianToken)).expect(200);

      expect(res.body.map((s: { id: string }) => s.id)).toEqual([sadeProfileId]);
    });

    it("still gives staff the whole register", async () => {
      // The fix must not have cost the school its own roll.
      const res = await request(app.getHttpServer()).get("/v1/students").set(auth(adminToken)).expect(200);

      const ids = res.body.map((s: { id: string }) => s.id);
      expect(ids).toContain(sadeProfileId);
      expect(ids).toContain(tundeProfileId);
    });
  });

  describe("GET /students/:id", () => {
    it("lets a pupil read their own record", async () => {
      await request(app.getHttpServer())
        .get(`/v1/students/${sadeProfileId}`)
        .set(auth(sadeToken))
        .expect(200);
    });

    it("404s when a pupil asks for another pupil", async () => {
      // 404 and not 403: "that child exists but is not yours" is itself a
      // fact about another family.
      await request(app.getHttpServer())
        .get(`/v1/students/${tundeProfileId}`)
        .set(auth(sadeToken))
        .expect(404);
    });

    it("404s when a guardian asks for a child who is not theirs", async () => {
      await request(app.getHttpServer())
        .get(`/v1/students/${tundeProfileId}`)
        .set(auth(guardianToken))
        .expect(404);
    });
  });

  describe("GET /classes/:id", () => {
    it("shows a pupil the classmates they sit with", async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/classes/${sadeClassId}`)
        .set(auth(sadeToken))
        .expect(200);

      expect(Array.isArray(res.body.enrollments)).toBe(true);
    });

    it("withholds another class's roster from a pupil", async () => {
      /*
       * The second leak. GET /classes is open and lists every class id, so
       * without this a pupil could walk each one and rebuild the whole roll.
       */
      const res = await request(app.getHttpServer())
        .get(`/v1/classes/${tundeClassId}`)
        .set(auth(sadeToken))
        .expect(200);

      expect(res.body.enrollments).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain("Tunde");
      // The class itself is still named — a timetable has to say where to go.
      expect(res.body.name).toBe("Grade 6B");
      // A count, not an empty list: an empty roster would claim the class has
      // no pupils, which is false.
      expect(res.body.studentCount).toBe(1);
    });

    it("withholds the roster from a guardian, even for their own child's class", async () => {
      // A parent is entitled to their own child, not to a list of the other
      // children in the room. photo-visibility.ts draws the same line.
      const res = await request(app.getHttpServer())
        .get(`/v1/classes/${sadeClassId}`)
        .set(auth(guardianToken))
        .expect(200);

      expect(res.body.enrollments).toBeUndefined();
      expect(res.body.studentCount).toBe(1);
    });

    it("still gives staff the register", async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/classes/${sadeClassId}`)
        .set(auth(adminToken))
        .expect(200);

      expect(res.body.enrollments).toHaveLength(1);
    });
  });

  describe("the roll cannot be rebuilt from the open class list", () => {
    it("walks every class as a pupil and never sees another child", async () => {
      /*
       * The attack itself, run end to end: list the classes, fetch each one,
       * and check that nothing about another pupil comes back. This is the
       * assertion that would have caught the second leak while the first fix
       * was being celebrated.
       */
      const classes = await request(app.getHttpServer()).get("/v1/classes").set(auth(sadeToken)).expect(200);

      expect(classes.body.length).toBeGreaterThan(1);

      for (const klass of classes.body as Array<{ id: string }>) {
        const res = await request(app.getHttpServer())
          .get(`/v1/classes/${klass.id}`)
          .set(auth(tundeToken))
          .expect(200);

        const text = JSON.stringify(res.body);
        expect(text).not.toContain("Sade");
        expect(text).not.toContain(sadeProfileId);
      }
    });
  });
});
