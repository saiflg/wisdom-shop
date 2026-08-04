import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Client as PgClient } from "pg";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { ControlPrismaService } from "../src/control-db/control-prisma.service";

const FIXTURE_PREFIX = "e2e-grade-";

describe("Grading (e2e)", () => {
  let app: INestApplication;
  let controlPrisma: ControlPrismaService;
  let adminToken: string;
  let guardianAToken: string;
  let guardianBToken: string;
  let studentAToken: string;
  let classId: string;
  let subjectId: string;
  let studentA: string;
  let studentB: string;
  let caId: string;
  let examId: string;

  const platformEmail = `${FIXTURE_PREFIX}platform-${Date.now()}@wisdomcampus.example`;
  const password = "Sup3rSecret!Pass";
  const school = { slug: `${FIXTURE_PREFIX}${Date.now()}`, adminEmail: `${FIXTURE_PREFIX}admin@example.com` };
  const studentAEmail = `${FIXTURE_PREFIX}student-a@example.com`;
  const guardianAEmail = `${FIXTURE_PREFIX}guardian-a@example.com`;
  const guardianBEmail = `${FIXTURE_PREFIX}guardian-b@example.com`;
  const YEAR = "2026-2027";
  const TERM = "Term 1";

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
      .send({ name: "Grade 7A", academicYear: YEAR })
      .expect(201);
    classId = klass.body.id;

    const subject = await request(app.getHttpServer())
      .post("/v1/subjects")
      .set(asAdmin())
      .send({ name: "Mathematics" })
      .expect(201);
    subjectId = subject.body.id;

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
    // Explicit from the outset — every suite that provisions a school needs
    // one, as the fees phase found out the hard way.
  }, 180000);

  afterAll(async () => {
    if (controlPrisma) await purgeFixtures().catch(() => undefined);
    if (app) await app.close();
  }, 180000);

  it("seeds a usable default grade scale at provisioning", async () => {
    const res = await request(app.getHttpServer()).get("/v1/grading/scales").set(asAdmin()).expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].isDefault).toBe(true);
    // The seeded bands must themselves tile 0-100, or every publication
    // would fail on a school that never touched its scale.
    const bands = res.body[0].bands;
    expect(bands[0].maxPercent).toBe(100);
    expect(bands[bands.length - 1].minPercent).toBe(0);
  });

  it("refuses a grade scale with a gap", async () => {
    await request(app.getHttpServer())
      .post("/v1/grading/scales")
      .set(asAdmin())
      .send({
        name: "Broken",
        bands: [
          { label: "A", minPercent: 70, maxPercent: 100 },
          { label: "B", minPercent: 61, maxPercent: 69 },
          { label: "F", minPercent: 0, maxPercent: 59 },
        ],
      })
      .expect(400);
  });

  it("creates two weighted assessments", async () => {
    const ca = await request(app.getHttpServer())
      .post("/v1/grading/assessments")
      .set(asAdmin())
      .send({
        subjectId,
        classId,
        name: "Continuous Assessment",
        academicYear: YEAR,
        term: TERM,
        maxScoreHundredths: 2000,
        weightPercent: 40,
      })
      .expect(201);
    caId = ca.body.id;

    const exam = await request(app.getHttpServer())
      .post("/v1/grading/assessments")
      .set(asAdmin())
      .send({
        subjectId,
        classId,
        name: "End of Term Exam",
        academicYear: YEAR,
        term: TERM,
        maxScoreHundredths: 8000,
        weightPercent: 60,
      })
      .expect(201);
    examId = exam.body.id;
  });

  it("refuses a score above the assessment maximum", async () => {
    await request(app.getHttpServer())
      .post(`/v1/grading/assessments/${caId}/marks`)
      .set(asAdmin())
      .send({ marks: [{ studentProfileId: studentA, scoreHundredths: 2500, status: "RECORDED" }] })
      .expect(400);
  });

  it("refuses to mark a student who isn't enrolled", async () => {
    const outsider = await request(app.getHttpServer())
      .post("/v1/students")
      .set(asAdmin())
      .send({ firstName: "Not", lastName: "Enrolled" })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/v1/grading/assessments/${caId}/marks`)
      .set(asAdmin())
      .send({ marks: [{ studentProfileId: outsider.body.id, scoreHundredths: 1000, status: "RECORDED" }] })
      .expect(400);
  });

  it("refuses to publish while marks are missing", async () => {
    // Only one of four marks recorded so far.
    await request(app.getHttpServer())
      .post(`/v1/grading/assessments/${caId}/marks`)
      .set(asAdmin())
      .send({ marks: [{ studentProfileId: studentA, scoreHundredths: 1600, status: "RECORDED" }] })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post("/v1/grading/publish")
      .set(asAdmin())
      .send({ classId, academicYear: YEAR, term: TERM })
      .expect(400);
    expect(res.body.message).toMatch(/missing/i);
  });

  it("records the remaining marks, including an excusal", async () => {
    await request(app.getHttpServer())
      .post(`/v1/grading/assessments/${caId}/marks`)
      .set(asAdmin())
      .send({ marks: [{ studentProfileId: studentB, scoreHundredths: 1000, status: "RECORDED" }] })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/v1/grading/assessments/${examId}/marks`)
      .set(asAdmin())
      .send({
        marks: [
          { studentProfileId: studentA, scoreHundredths: 6000, status: "RECORDED" },
          // Bob missed the exam with a documented reason.
          { studentProfileId: studentB, status: "EXCUSED" },
        ],
      })
      .expect(201);
  });

  it("publishes, and the excused student is judged only on what they sat", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/grading/publish")
      .set(asAdmin())
      .send({ classId, academicYear: YEAR, term: TERM })
      .expect(201);
    expect(res.body.studentsPublished).toBe(2);

    const results = await request(app.getHttpServer())
      .get(`/v1/grading/results?classId=${classId}&academicYear=${YEAR}&term=${TERM}`)
      .set(asAdmin())
      .expect(200);

    const ada = results.body.find((r: { studentProfileId: string }) => r.studentProfileId === studentA);
    const bob = results.body.find((r: { studentProfileId: string }) => r.studentProfileId === studentB);

    // Ada: 16/20 (80%) at 40% + 60/80 (75%) at 60% = 77%
    expect(ada.overallPercentHundredths).toBe(7700);
    expect(ada.subjects[0].gradeLabel).toBe("A");

    // Bob: 10/20 = 50% on the CA only, since the exam was excused and the
    // remaining weight renormalises. Counting the excusal as zero would have
    // given him 20% and a fail.
    expect(bob.overallPercentHundredths).toBe(5000);
    expect(bob.subjects[0].gradeLabel).toBe("C");
  });

  it("refuses to change marks behind published results", async () => {
    await request(app.getHttpServer())
      .post(`/v1/grading/assessments/${caId}/marks`)
      .set(asAdmin())
      .send({ marks: [{ studentProfileId: studentA, scoreHundredths: 2000, status: "RECORDED" }] })
      .expect(409);
  });

  it("does not change an issued report card when the grade scale is retuned", async () => {
    // The invariant that makes a report card a document rather than a view.
    const scales = await request(app.getHttpServer()).get("/v1/grading/scales").set(asAdmin()).expect(200);
    const scaleId = scales.body[0].id;

    await request(app.getHttpServer())
      .put(`/v1/grading/scales/${scaleId}`)
      .set(asAdmin())
      .send({
        name: "Retuned",
        isDefault: true,
        // A now needs 90, so Ada's 77% would be a C if grades were computed
        // on read instead of snapshotted at publication.
        bands: [
          { label: "A", minPercent: 90, maxPercent: 100, remark: "Excellent" },
          { label: "C", minPercent: 50, maxPercent: 89, remark: "Good" },
          { label: "F", minPercent: 0, maxPercent: 49, remark: "Fail" },
        ],
      })
      .expect(200);

    const card = await request(app.getHttpServer())
      .get(`/v1/grading/report-cards/${studentA}?academicYear=${YEAR}&term=${TERM}`)
      .set(asAdmin())
      .expect(200);

    expect(card.body.subjects[0].gradeLabel).toBe("A");
    expect(card.body.overallPercentHundredths).toBe(7700);
  });

  it("lets a guardian read their own child's published report card", async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/grading/report-cards/${studentA}?academicYear=${YEAR}&term=${TERM}`)
      .set("Authorization", `Bearer ${guardianAToken}`)
      .expect(200);
    expect(res.body.subjects[0].gradeLabel).toBe("A");
    expect(res.body.publishedByName).toContain("Admin");
  });

  it("404s a guardian asking for another family's report card", async () => {
    // 404 not 403 — "that child exists but isn't yours" would itself leak.
    await request(app.getHttpServer())
      .get(`/v1/grading/report-cards/${studentB}?academicYear=${YEAR}&term=${TERM}`)
      .set("Authorization", `Bearer ${guardianAToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/v1/grading/report-cards/${studentA}?academicYear=${YEAR}&term=${TERM}`)
      .set("Authorization", `Bearer ${guardianBToken}`)
      .expect(404);
  });

  it("hides the class result list from families", async () => {
    await request(app.getHttpServer())
      .get(`/v1/grading/results?classId=${classId}&academicYear=${YEAR}&term=${TERM}`)
      .set("Authorization", `Bearer ${guardianAToken}`)
      .expect(404);
  });

  it("refuses mark entry and publication by a student", async () => {
    await request(app.getHttpServer())
      .post(`/v1/grading/assessments/${caId}/marks`)
      .set("Authorization", `Bearer ${studentAToken}`)
      .send({ marks: [{ studentProfileId: studentA, scoreHundredths: 2000, status: "RECORDED" }] })
      .expect(403);

    await request(app.getHttpServer())
      .post("/v1/grading/publish")
      .set("Authorization", `Bearer ${studentAToken}`)
      .send({ classId, academicYear: YEAR, term: TERM })
      .expect(403);
  });

  it("hides a draft report card from the family while showing it to staff", async () => {
    await request(app.getHttpServer())
      .post("/v1/grading/unpublish")
      .set(asAdmin())
      .send({ classId, academicYear: YEAR, term: TERM })
      .expect(201);

    // A parent must not read a grade the school has not decided yet.
    await request(app.getHttpServer())
      .get(`/v1/grading/report-cards/${studentA}?academicYear=${YEAR}&term=${TERM}`)
      .set("Authorization", `Bearer ${guardianAToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/v1/grading/report-cards/${studentA}?academicYear=${YEAR}&term=${TERM}`)
      .set(asAdmin())
      .expect(200);
  });

  it("refuses to publish when a subject's weights do not total 100", async () => {
    await request(app.getHttpServer())
      .post("/v1/grading/assessments")
      .set(asAdmin())
      .send({
        subjectId,
        classId,
        name: "Surprise Test",
        academicYear: YEAR,
        term: TERM,
        maxScoreHundredths: 1000,
        weightPercent: 30,
      })
      .expect(201);

    // Now 130%, which would inflate every student in the class invisibly.
    const res = await request(app.getHttpServer())
      .post("/v1/grading/publish")
      .set(asAdmin())
      .send({ classId, academicYear: YEAR, term: TERM })
      .expect(400);
    expect(res.body.message).toMatch(/130%/);
  });
});
