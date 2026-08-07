import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Client as PgClient } from "pg";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { ControlPrismaService } from "../src/control-db/control-prisma.service";

const FIXTURE_PREFIX = "e2e-tt-";

describe("Timetable (e2e)", () => {
  let app: INestApplication;
  let controlPrisma: ControlPrismaService;
  let adminToken: string;
  let guardianToken: string;
  let classA: string;
  let classB: string;
  let subjectId: string;
  let teacherId: string;
  let periodOne: string;
  let periodTwo: string;

  const platformEmail = `${FIXTURE_PREFIX}platform-${Date.now()}@wisdomcampus.example`;
  const password = "Sup3rSecret!Pass";
  const school = { slug: `${FIXTURE_PREFIX}${Date.now()}`, adminEmail: `${FIXTURE_PREFIX}admin@example.com` };
  const guardianEmail = `${FIXTURE_PREFIX}guardian@example.com`;

  const asAdmin = () => ({ Authorization: `Bearer ${adminToken}` });

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

    await request(app.getHttpServer())
      .post("/v1/platform/schools")
      .set("Authorization", `Bearer ${platformLogin.body.accessToken}`)
      .send({
        name: school.slug,
        slug: school.slug,
        adminEmail: school.adminEmail,
        adminPassword: password,
        adminFirstName: "Admin",
        adminLastName: school.slug,
      })
      .expect(201);

    adminToken = await login(school.adminEmail);

    const a = await request(app.getHttpServer())
      .post("/v1/classes")
      .set(asAdmin())
      .send({ name: "Grade 7A", academicYear: "2026-2027" })
      .expect(201);
    classA = a.body.id;

    const b = await request(app.getHttpServer())
      .post("/v1/classes")
      .set(asAdmin())
      .send({ name: "Grade 7B", academicYear: "2026-2027" })
      .expect(201);
    classB = b.body.id;

    const subject = await request(app.getHttpServer())
      .post("/v1/subjects")
      .set(asAdmin())
      .send({ name: "Mathematics" })
      .expect(201);
    subjectId = subject.body.id;

    const teacher = await request(app.getHttpServer())
      .post("/v1/teachers")
      .set(asAdmin())
      .send({
        firstName: "Ade",
        lastName: "Teacher",
        email: `${FIXTURE_PREFIX}teacher@example.com`,
        password,
      })
      .expect(201);
    teacherId = teacher.body.user?.id ?? teacher.body.userId ?? teacher.body.id;

    const student = await request(app.getHttpServer())
      .post("/v1/students")
      .set(asAdmin())
      .send({ firstName: "Ada", lastName: "One" })
      .expect(201);

    await request(app.getHttpServer())
      .post("/v1/enrollments")
      .set(asAdmin())
      .send({ studentProfileId: student.body.id, classId: classA })
      .expect(201);

    await request(app.getHttpServer())
      .post("/v1/guardians")
      .set(asAdmin())
      .send({
        studentProfileId: student.body.id,
        firstName: "Grace",
        lastName: "One",
        email: guardianEmail,
        password,
        relationship: "Mother",
      })
      .expect(201);

    guardianToken = await login(guardianEmail);
    // Explicit, like every suite that provisions a school.
  }, 180000);

  afterAll(async () => {
    if (controlPrisma) await purgeFixtures().catch(() => undefined);
    if (app) await app.close();
  }, 180000);

  it("sets up a period structure", async () => {
    const res = await request(app.getHttpServer())
      .put("/v1/timetable/periods")
      .set(asAdmin())
      .send({
        periods: [
          { label: "Period 1", startMinute: 510, endMinute: 550 },
          { label: "Period 2", startMinute: 550, endMinute: 590 },
          { label: "Break", startMinute: 590, endMinute: 610, isTeaching: false },
        ],
      })
      .expect(200);

    expect(res.body).toHaveLength(3);
    periodOne = res.body[0].id;
    periodTwo = res.body[1].id;
  });

  it("refuses overlapping periods", async () => {
    // Two periods sharing a minute makes "which lesson is this class in now"
    // unanswerable.
    const res = await request(app.getHttpServer())
      .put("/v1/timetable/periods")
      .set(asAdmin())
      .send({
        periods: [
          { label: "Period 1", startMinute: 510, endMinute: 570 },
          { label: "Period 2", startMinute: 550, endMinute: 610 },
        ],
      })
      .expect(400);
    expect(res.body.message).toMatch(/overlap/i);
  });

  it("schedules a lesson", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/timetable/entries")
      .set(asAdmin())
      .send({ classId: classA, subjectId, teacherUserId: teacherId, weekday: "MONDAY", periodId: periodOne })
      .expect(201);
    expect(res.body.subject.name).toBe("Mathematics");
  });

  it("refuses to put a class in two lessons at once", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/timetable/entries")
      .set(asAdmin())
      .send({ classId: classA, subjectId, weekday: "MONDAY", periodId: periodOne })
      .expect(409);
    expect(res.body.message).toMatch(/already has/i);
  });

  it("refuses to put a teacher in two rooms at once", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/timetable/entries")
      .set(asAdmin())
      .send({ classId: classB, subjectId, teacherUserId: teacherId, weekday: "MONDAY", periodId: periodOne })
      .expect(409);
    expect(res.body.message).toMatch(/already taking/i);
    // The message names what is in the way, so a scheduler can act on it.
    expect(res.body.message).toContain("Mathematics");
  });

  it("allows the same teacher in a different period", async () => {
    await request(app.getHttpServer())
      .post("/v1/timetable/entries")
      .set(asAdmin())
      .send({ classId: classB, subjectId, teacherUserId: teacherId, weekday: "MONDAY", periodId: periodTwo })
      .expect(201);
  });

  it("allows two unstaffed lessons in the same slot", async () => {
    // A half-planned timetable is the normal mid-term state.
    await request(app.getHttpServer())
      .post("/v1/timetable/entries")
      .set(asAdmin())
      .send({ classId: classA, subjectId, weekday: "TUESDAY", periodId: periodOne })
      .expect(201);

    await request(app.getHttpServer())
      .post("/v1/timetable/entries")
      .set(asAdmin())
      .send({ classId: classB, subjectId, weekday: "TUESDAY", periodId: periodOne })
      .expect(201);
  });

  it("refuses a lesson in a non-teaching period", async () => {
    const periods = await request(app.getHttpServer()).get("/v1/timetable/periods").set(asAdmin()).expect(200);
    const breakPeriod = periods.body.find((p: { isTeaching: boolean }) => !p.isTeaching);

    const res = await request(app.getHttpServer())
      .post("/v1/timetable/entries")
      .set(asAdmin())
      .send({ classId: classA, subjectId, weekday: "MONDAY", periodId: breakPeriod.id })
      .expect(400);
    expect(res.body.message).toMatch(/not a teaching period/i);
  });

  it("lets a lesson be saved in place without clashing with itself", async () => {
    const week = await request(app.getHttpServer())
      .get(`/v1/timetable/classes/${classA}`)
      .set(asAdmin())
      .expect(200);
    const monday = week.body.find((e: { weekday: string }) => e.weekday === "MONDAY");

    await request(app.getHttpServer())
      .put(`/v1/timetable/entries/${monday.id}`)
      .set(asAdmin())
      .send({
        classId: classA,
        subjectId,
        teacherUserId: teacherId,
        weekday: "MONDAY",
        periodId: periodOne,
        room: "Lab 2",
      })
      .expect(200);
  });

  it("shows a teacher their week", async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/timetable/teachers/${teacherId}`)
      .set(asAdmin())
      .expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });

  it("lets a guardian read their child's class timetable", async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/timetable/classes/${classA}`)
      .set("Authorization", `Bearer ${guardianToken}`)
      .expect(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("404s a guardian asking for a class their child is not in", async () => {
    await request(app.getHttpServer())
      .get(`/v1/timetable/classes/${classB}`)
      .set("Authorization", `Bearer ${guardianToken}`)
      .expect(404);
  });

  it("hides the teacher staffing view from families", async () => {
    await request(app.getHttpServer())
      .get(`/v1/timetable/teachers/${teacherId}`)
      .set("Authorization", `Bearer ${guardianToken}`)
      .expect(404);
  });

  it("refuses timetable edits by a guardian", async () => {
    await request(app.getHttpServer())
      .post("/v1/timetable/entries")
      .set("Authorization", `Bearer ${guardianToken}`)
      .send({ classId: classA, subjectId, weekday: "FRIDAY", periodId: periodOne })
      .expect(403);
  });

  it("keeps existing lessons when the period structure is edited", async () => {
    // Renaming a period must not quietly wipe the week scheduled against it.
    const before = await request(app.getHttpServer())
      .get(`/v1/timetable/classes/${classA}`)
      .set(asAdmin())
      .expect(200);

    await request(app.getHttpServer())
      .put("/v1/timetable/periods")
      .set(asAdmin())
      .send({
        periods: [
          { id: periodOne, label: "First Period", startMinute: 510, endMinute: 550 },
          { id: periodTwo, label: "Period 2", startMinute: 550, endMinute: 590 },
        ],
      })
      .expect(200);

    const after = await request(app.getHttpServer())
      .get(`/v1/timetable/classes/${classA}`)
      .set(asAdmin())
      .expect(200);

    const survivors = after.body.filter((e: { periodId: string }) => e.periodId === periodOne);
    expect(survivors.length).toBeGreaterThan(0);
    expect(after.body.length).toBeLessThanOrEqual(before.body.length);
  });
});
