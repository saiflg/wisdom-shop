import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Client as PgClient } from "pg";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { ControlPrismaService } from "../src/control-db/control-prisma.service";

const FIXTURE_PREFIX = "e2e-att-";

describe("Attendance (e2e)", () => {
  let app: INestApplication;
  let controlPrisma: ControlPrismaService;
  let adminToken: string;
  let guardianAToken: string;
  let guardianBToken: string;
  let studentAToken: string;
  let classId: string;
  let studentA: string;
  let studentB: string;

  const platformEmail = `${FIXTURE_PREFIX}platform-${Date.now()}@wisdomcampus.example`;
  const password = "Sup3rSecret!Pass";
  const school = { slug: `${FIXTURE_PREFIX}${Date.now()}`, adminEmail: `${FIXTURE_PREFIX}admin@example.com` };
  const studentAEmail = `${FIXTURE_PREFIX}student-a@example.com`;
  const guardianAEmail = `${FIXTURE_PREFIX}guardian-a@example.com`;
  const guardianBEmail = `${FIXTURE_PREFIX}guardian-b@example.com`;
  const today = "2026-08-03";

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

    const klass = await request(app.getHttpServer())
      .post("/v1/classes")
      .set(asAdmin())
      .send({ name: "Grade 5A", academicYear: "2026-2027" })
      .expect(201);
    classId = klass.body.id;

    // Two students in two different families, so guardian scoping has
    // something real to leak if it is wrong.
    const a = await request(app.getHttpServer())
      .post("/v1/students")
      .set(asAdmin())
      .send({ firstName: "Ada", lastName: "One", email: studentAEmail, password })
      .expect(201);
    studentA = a.body.id;

    const b = await request(app.getHttpServer())
      .post("/v1/students")
      .set(asAdmin())
      .send({ firstName: "Bob", lastName: "Two" })
      .expect(201);
    studentB = b.body.id;

    for (const studentProfileId of [studentA, studentB]) {
      await request(app.getHttpServer())
        .post("/v1/enrollments")
        .set(asAdmin())
        .send({ studentProfileId, classId })
        .expect(201);
    }

    await request(app.getHttpServer())
      .post("/v1/guardians")
      .set(asAdmin())
      .send({
        studentProfileId: studentA,
        firstName: "Grace",
        lastName: "One",
        email: guardianAEmail,
        password,
        relationship: "Mother",
      })
      .expect(201);

    await request(app.getHttpServer())
      .post("/v1/guardians")
      .set(asAdmin())
      .send({
        studentProfileId: studentB,
        firstName: "Gary",
        lastName: "Two",
        email: guardianBEmail,
        password,
        relationship: "Father",
      })
      .expect(201);

    guardianAToken = await login(guardianAEmail);
    guardianBToken = await login(guardianBEmail);
    studentAToken = await login(studentAEmail);
    // 180s, more than the other suites' 120s: this fixture is the heaviest
    // in the repo — a school, a class, three students, two enrollments, two
    // guardians and four logins, each of which argon2-hashes a password by
    // design. It fits inside 120s when run alone but not alongside the full
    // suite, which is a harness limit rather than anything about the code.
  }, 180000);

  afterAll(async () => {
    if (controlPrisma) await purgeFixtures().catch(() => undefined);
    if (app) await app.close();
  }, 180000);

  let registerId: string;
  let recordAId: string;

  it("takes a register for the whole class", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/attendance/registers")
      .set(asAdmin())
      .send({
        classId,
        date: today,
        marks: [
          { studentProfileId: studentA, status: "PRESENT" },
          { studentProfileId: studentB, status: "ABSENT", note: "No contact from home" },
        ],
      })
      .expect(201);

    registerId = res.body.id;
    expect(res.body.records).toHaveLength(2);
    recordAId = res.body.records.find((r: { studentProfileId: string }) => r.studentProfileId === studentA).id;
  });

  it("refuses to mark a student who isn't enrolled in that class", async () => {
    const outsider = await request(app.getHttpServer())
      .post("/v1/students")
      .set(asAdmin())
      .send({ firstName: "Not", lastName: "Enrolled" })
      .expect(201);

    await request(app.getHttpServer())
      .post("/v1/attendance/registers")
      .set(asAdmin())
      .send({ classId, date: today, marks: [{ studentProfileId: outsider.body.id, status: "PRESENT" }] })
      .expect(400);
  });

  it("reuses the same register for the same class and date rather than creating a second", async () => {
    // The whole-day case: session defaults to "" so the unique constraint
    // actually applies. A nullable session would have allowed a duplicate.
    const res = await request(app.getHttpServer())
      .post("/v1/attendance/registers")
      .set(asAdmin())
      .send({ classId, date: today, marks: [{ studentProfileId: studentA, status: "LATE" }] })
      .expect(201);

    expect(res.body.id).toBe(registerId);
    // The existing PRESENT mark is untouched: changing it is an amendment.
    const mark = res.body.records.find((r: { studentProfileId: string }) => r.studentProfileId === studentA);
    expect(mark.status).toBe("PRESENT");
  });

  it("never lets a guardian see another family's child", async () => {
    // The security invariant this feature turns on.
    const res = await request(app.getHttpServer())
      .get(`/v1/attendance/registers/${registerId}`)
      .set("Authorization", `Bearer ${guardianAToken}`)
      .expect(200);

    const ids = res.body.records.map((r: { studentProfileId: string }) => r.studentProfileId);
    expect(ids).toEqual([studentA]);
    expect(ids).not.toContain(studentB);
    expect(JSON.stringify(res.body)).not.toContain("No contact from home");
  });

  it("404s a guardian asking for a student who isn't theirs", async () => {
    // 404 not 403: "that child exists but isn't yours" would itself leak.
    await request(app.getHttpServer())
      .get(`/v1/attendance/students/${studentB}`)
      .set("Authorization", `Bearer ${guardianAToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/v1/attendance/students/${studentA}`)
      .set("Authorization", `Bearer ${guardianBToken}`)
      .expect(404);
  });

  it("lets a guardian read their own child's summary", async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/attendance/students/${studentA}`)
      .set("Authorization", `Bearer ${guardianAToken}`)
      .expect(200);
    expect(res.body.summary.total).toBe(1);
    expect(res.body.summary.presentRate).toBe(100);
  });

  it("lets a student read only their own attendance", async () => {
    await request(app.getHttpServer())
      .get(`/v1/attendance/students/${studentA}`)
      .set("Authorization", `Bearer ${studentAToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/v1/attendance/students/${studentB}`)
      .set("Authorization", `Bearer ${studentAToken}`)
      .expect(404);
  });

  it("hides the class register list from non-staff", async () => {
    await request(app.getHttpServer())
      .get(`/v1/attendance/classes/${classId}/registers`)
      .set("Authorization", `Bearer ${guardianAToken}`)
      .expect(404);
  });

  it("refuses attendance marking by a student", async () => {
    await request(app.getHttpServer())
      .post("/v1/attendance/registers")
      .set("Authorization", `Bearer ${studentAToken}`)
      .send({ classId, date: today, marks: [{ studentProfileId: studentA, status: "PRESENT" }] })
      .expect(403);
  });

  it("records who amended a mark and why", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/attendance/records/${recordAId}`)
      .set(asAdmin())
      .send({ status: "EXCUSED", reason: "Parent confirmed medical appointment" })
      .expect(200);
    expect(res.body.status).toBe("EXCUSED");

    const register = await request(app.getHttpServer())
      .get(`/v1/attendance/registers/${registerId}`)
      .set(asAdmin())
      .expect(200);

    const record = register.body.records.find((r: { id: string }) => r.id === recordAId);
    expect(record.amendments).toHaveLength(1);
    expect(record.amendments[0]).toMatchObject({
      fromStatus: "PRESENT",
      toStatus: "EXCUSED",
      reason: "Parent confirmed medical appointment",
    });
    // Attributed to a person, not just an id.
    expect(record.amendments[0].actorName).toContain("Admin");
  });

  it("requires a reason for an amendment", async () => {
    await request(app.getHttpServer())
      .patch(`/v1/attendance/records/${recordAId}`)
      .set(asAdmin())
      .send({ status: "PRESENT" })
      .expect(400);
  });

  it("refuses an amendment by a guardian", async () => {
    await request(app.getHttpServer())
      .patch(`/v1/attendance/records/${recordAId}`)
      .set("Authorization", `Bearer ${guardianAToken}`)
      .send({ status: "PRESENT", reason: "should not work" })
      .expect(403);
  });

  it("keeps a separate register for a different session on the same day", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/attendance/registers")
      .set(asAdmin())
      .send({
        classId,
        date: today,
        session: "Afternoon",
        marks: [{ studentProfileId: studentA, status: "PRESENT" }],
      })
      .expect(201);
    expect(res.body.id).not.toBe(registerId);
  });
});
