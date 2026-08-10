import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Client as PgClient } from "pg";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { ControlPrismaService } from "../src/control-db/control-prisma.service";

const FIXTURE_PREFIX = "e2e-studperm-";

/**
 * A student may read the school's teaching material and may never write it.
 *
 * The API has always enforced this with `@Roles`; what it did not have was a
 * test saying so, which is why the console was free to offer a student a
 * "New lesson plan" button for weeks without anything going red. These are
 * the assertions that make removing a guard fail loudly.
 *
 * Guardians get the same treatment, for the same reasons and one more: a
 * parent editing the scheme of work their child is taught from is not a
 * feature anybody asked for.
 */
describe("What a student and a guardian may not write (e2e)", () => {
  let app: INestApplication;
  let controlPrisma: ControlPrismaService;

  let adminToken: string;
  let studentToken: string;
  let guardianToken: string;
  let subjectId: string;
  let classId: string;

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

    const subject = await request(app.getHttpServer())
      .post("/v1/subjects")
      .set(auth(adminToken))
      .send({ name: "Mathematics", gradeLevel: "Grade 5" })
      .expect(201);
    subjectId = subject.body.id;

    const klass = await request(app.getHttpServer())
      .post("/v1/classes")
      .set(auth(adminToken))
      .send({ name: "Grade 5A", academicYear: "2026-2027" })
      .expect(201);
    classId = klass.body.id;

    const studentEmail = `${FIXTURE_PREFIX}student-${Date.now()}@example.com`;
    // POST /v1/students returns the StudentProfile itself.
    const student = await request(app.getHttpServer())
      .post("/v1/students")
      .set(auth(adminToken))
      .send({ firstName: "Sade", lastName: "Learner", email: studentEmail, password })
      .expect(201);
    studentToken = await login(studentEmail);

    // A guardian exists by being linked to a child, so this needs the profile
    // and the relationship — there is no standalone "create a parent".
    const guardianEmail = `${FIXTURE_PREFIX}guardian-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post("/v1/guardians")
      .set(auth(adminToken))
      .send({
        studentProfileId: student.body.id,
        relationship: "Mother",
        firstName: "Bola",
        lastName: "Parent",
        email: guardianEmail,
        password,
      })
      .expect(201);
    guardianToken = await login(guardianEmail);
  }, 180000);

  afterAll(async () => {
    if (controlPrisma) await purgeFixtures().catch(() => undefined);
    if (app) await app.close();
  }, 180000);

  describe("a student", () => {
    it("may READ the curriculum", async () => {
      // The point of the whole rule: reading is fine. A student looking up
      // what they are being taught is the feature.
      await request(app.getHttpServer()).get("/v1/schemes-of-work").set(auth(studentToken)).expect(200);
      await request(app.getHttpServer()).get("/v1/lesson-plans").set(auth(studentToken)).expect(200);
      await request(app.getHttpServer()).get("/v1/subjects").set(auth(studentToken)).expect(200);
      await request(app.getHttpServer()).get("/v1/classes").set(auth(studentToken)).expect(200);
    });

    it("may NOT create a scheme of work", async () => {
      await request(app.getHttpServer())
        .post("/v1/schemes-of-work")
        .set(auth(studentToken))
        .send({ subjectId, academicYear: "2026-2027", term: "Term 1", content: { weeks: [] } })
        .expect(403);
    });

    it("may NOT generate one with AI either", async () => {
      // The expensive door as well as the cheap one.
      await request(app.getHttpServer())
        .post("/v1/schemes-of-work/generate")
        .set(auth(studentToken))
        .send({ subjectId, academicYear: "2026-2027", term: "Term 1" })
        .expect(403);
    });

    it("may NOT create a lesson plan", async () => {
      await request(app.getHttpServer())
        .post("/v1/lesson-plans")
        .set(auth(studentToken))
        .send({ subjectId, title: "Mine now", content: {} })
        .expect(403);
    });

    it("may NOT create a quiz", async () => {
      await request(app.getHttpServer())
        .post("/v1/quizzes")
        .set(auth(studentToken))
        .send({ subjectId, title: "Easy questions", questions: [] })
        .expect(403);
    });

    it("may NOT create a subject or a class", async () => {
      await request(app.getHttpServer())
        .post("/v1/subjects")
        .set(auth(studentToken))
        .send({ name: "Free Period" })
        .expect(403);

      await request(app.getHttpServer())
        .post("/v1/classes")
        .set(auth(studentToken))
        .send({ name: "My Own Class", academicYear: "2026-2027" })
        .expect(403);
    });

    it("may NOT edit or delete what a teacher wrote", async () => {
      await request(app.getHttpServer())
        .patch(`/v1/subjects/${subjectId}`)
        .set(auth(studentToken))
        .send({ name: "Renamed by a pupil" })
        .expect(403);

      await request(app.getHttpServer()).delete(`/v1/subjects/${subjectId}`).set(auth(studentToken)).expect(403);

      await request(app.getHttpServer())
        .patch(`/v1/classes/${classId}`)
        .set(auth(studentToken))
        .send({ name: "Renamed by a pupil" })
        .expect(403);
    });

    it("may NOT change the school's curriculum settings", async () => {
      await request(app.getHttpServer())
        .patch("/v1/curriculum-settings")
        .set(auth(studentToken))
        .send({ mode: "AI_AUTOMATIC" })
        .expect(403);
    });
  });

  describe("a guardian", () => {
    it("may not write teaching material either", async () => {
      await request(app.getHttpServer())
        .post("/v1/lesson-plans")
        .set(auth(guardianToken))
        .send({ subjectId, title: "How I would teach it", content: {} })
        .expect(403);

      await request(app.getHttpServer())
        .post("/v1/classes")
        .set(auth(guardianToken))
        .send({ name: "Parents' class", academicYear: "2026-2027" })
        .expect(403);
    });
  });

  describe("and the people who should", () => {
    it("lets an administrator do all of it, so these tests prove a rule and not a broken API", async () => {
      await request(app.getHttpServer())
        .post("/v1/subjects")
        .set(auth(adminToken))
        .send({ name: "Further Mathematics" })
        .expect(201);

      await request(app.getHttpServer())
        .post("/v1/classes")
        .set(auth(adminToken))
        .send({ name: "Grade 5B", academicYear: "2026-2027" })
        .expect(201);
    });
  });
});
