import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Client as PgClient } from "pg";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { ControlPrismaService } from "../src/control-db/control-prisma.service";

const FIXTURE_PREFIX = "e2e-hw-";

describe("Homework (e2e)", () => {
  let app: INestApplication;
  let controlPrisma: ControlPrismaService;

  let adminToken: string;
  let studentAToken: string;
  let studentBToken: string;
  let guardianAToken: string;
  let guardianBToken: string;

  let classId: string;
  let subjectId: string;
  let assessmentId: string;
  let studentAProfileId: string;
  let assignmentId: string;

  const platformEmail = `${FIXTURE_PREFIX}platform-${Date.now()}@wisdomcampus.example`;
  const password = "Sup3rSecret!Pass";
  const school = { slug: `${FIXTURE_PREFIX}${Date.now()}`, adminEmail: `${FIXTURE_PREFIX}admin@example.com` };
  const studentAEmail = `${FIXTURE_PREFIX}student-a@example.com`;
  const studentBEmail = `${FIXTURE_PREFIX}student-b@example.com`;
  const guardianAEmail = `${FIXTURE_PREFIX}guardian-a@example.com`;
  const guardianBEmail = `${FIXTURE_PREFIX}guardian-b@example.com`;

  const asAdmin = () => ({ Authorization: `Bearer ${adminToken}` });
  const asStudentA = () => ({ Authorization: `Bearer ${studentAToken}` });
  const asStudentB = () => ({ Authorization: `Bearer ${studentBToken}` });

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

  const login = async (email: string) => {
    const res = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ schoolSlug: school.slug, email, password })
      .expect(200);
    return res.body.accessToken as string;
  };

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

    const subject = await request(app.getHttpServer())
      .post("/v1/subjects")
      .set(asAdmin())
      .send({ name: "Mathematics" })
      .expect(201);
    subjectId = subject.body.id;

    const assessment = await request(app.getHttpServer())
      .post("/v1/grading/assessments")
      .set(asAdmin())
      .send({
        classId,
        subjectId,
        name: "Homework total",
        academicYear: "2026-2027",
        term: "Term 1",
        maxScoreHundredths: 2000,
        weightPercent: 100,
      })
      .expect(201);
    assessmentId = assessment.body.id;

    // Two students in two families, so cross-student scoping has something
    // real to leak if it is wrong.
    const a = await request(app.getHttpServer())
      .post("/v1/students")
      .set(asAdmin())
      .send({ firstName: "Ada", lastName: "One", email: studentAEmail, password })
      .expect(201);
    studentAProfileId = a.body.id;

    const b = await request(app.getHttpServer())
      .post("/v1/students")
      .set(asAdmin())
      .send({ firstName: "Bob", lastName: "Two", email: studentBEmail, password })
      .expect(201);

    for (const studentProfileId of [a.body.id, b.body.id]) {
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
        studentProfileId: a.body.id,
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
        studentProfileId: b.body.id,
        firstName: "Gary",
        lastName: "Two",
        email: guardianBEmail,
        password,
        relationship: "Father",
      })
      .expect(201);

    studentAToken = await login(studentAEmail);
    studentBToken = await login(studentBEmail);
    guardianAToken = await login(guardianAEmail);
    guardianBToken = await login(guardianBEmail);
  }, 180000);

  afterAll(async () => {
    if (controlPrisma) await purgeFixtures().catch(() => undefined);
    if (app) await app.close();
  }, 180000);

  it("sets a piece of work as a draft first", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/homework")
      .set(asAdmin())
      .send({
        classId,
        subjectId,
        title: "Fractions worksheet",
        instructions: "Questions 1 to 12 on page 43.",
        dueAt: "2099-01-01T23:59:00.000Z",
        maxScoreHundredths: 1000,
        assessmentId,
      })
      .expect(201);

    assignmentId = res.body.id;
    expect(res.body.status).toBe("DRAFT");
  });

  it("hides a draft from students entirely", async () => {
    const list = await request(app.getHttpServer()).get("/v1/homework").set(asStudentA()).expect(200);
    expect(list.body).toEqual([]);

    // Not merely absent from the list — unreachable by id too.
    await request(app.getHttpServer()).get(`/v1/homework/${assignmentId}`).set(asStudentA()).expect(404);

    await request(app.getHttpServer())
      .post(`/v1/homework/${assignmentId}/submit`)
      .set(asStudentA())
      .send({ content: "sneaking in early" })
      .expect(404);
  });

  it("refuses to link work to another class's assessment", async () => {
    const otherClass = await request(app.getHttpServer())
      .post("/v1/classes")
      .set(asAdmin())
      .send({ name: "Grade 6B", academicYear: "2026-2027" })
      .expect(201);

    // Otherwise a released mark lands in a gradebook nobody was looking at.
    await request(app.getHttpServer())
      .post("/v1/homework")
      .set(asAdmin())
      .send({
        classId: otherClass.body.id,
        subjectId,
        title: "Wrong class",
        instructions: "x",
        assessmentId,
      })
      .expect(400);
  });

  it("shows the work to the class once it is set", async () => {
    await request(app.getHttpServer())
      .patch(`/v1/homework/${assignmentId}`)
      .set(asAdmin())
      .send({ status: "SET" })
      .expect(200);

    const list = await request(app.getHttpServer()).get("/v1/homework").set(asStudentA()).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].title).toBe("Fractions worksheet");
  });

  it("accepts a student's own work and records it as on time", async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/homework/${assignmentId}/submit`)
      .set(asStudentA())
      .send({ content: "My answers: 1a, 2c, 3b" })
      .expect(201);

    expect(res.body.status).toBe("SUBMITTED");
    expect(res.body.isLate).toBe(false);
  });

  it("replaces work handed in again rather than storing two copies", async () => {
    await request(app.getHttpServer())
      .post(`/v1/homework/${assignmentId}/submit`)
      .set(asStudentA())
      .send({ content: "Corrected answers" })
      .expect(201);

    const detail = await request(app.getHttpServer())
      .get(`/v1/homework/${assignmentId}`)
      .set(asAdmin())
      .expect(200);

    const mine = detail.body.submissions.filter(
      (s: { studentProfileId: string }) => s.studentProfileId === studentAProfileId,
    );
    expect(mine).toHaveLength(1);
    expect(mine[0].content).toBe("Corrected answers");
  });

  it("never lets a student see another student's work", async () => {
    const detail = await request(app.getHttpServer())
      .get(`/v1/homework/${assignmentId}`)
      .set(asStudentB())
      .expect(200);

    // Bob can see the assignment — it is his class — but not Ada's answers.
    expect(detail.body.submissions).toEqual([]);
    expect(JSON.stringify(detail.body)).not.toContain("Corrected answers");
  });

  it("shows a teacher who has handed in and who has not", async () => {
    const detail = await request(app.getHttpServer())
      .get(`/v1/homework/${assignmentId}`)
      .set(asAdmin())
      .expect(200);

    expect(detail.body.progress).toMatchObject({ expected: 2, submitted: 1, outstanding: 1, marked: 0 });
  });

  it("holds a mark back from the student until it is released", async () => {
    const detail = await request(app.getHttpServer())
      .get(`/v1/homework/${assignmentId}`)
      .set(asAdmin())
      .expect(200);
    const submissionId = detail.body.submissions[0].id;

    await request(app.getHttpServer())
      .patch(`/v1/homework/submissions/${submissionId}/mark`)
      .set(asAdmin())
      .send({ scoreHundredths: 800, feedback: "Good work, check question 7." })
      .expect(200);

    const asStudent = await request(app.getHttpServer())
      .get(`/v1/homework/${assignmentId}`)
      .set(asStudentA())
      .expect(200);

    // A teacher marking a class over an evening should not be releasing marks
    // one at a time as they go.
    expect(asStudent.body.submissions[0].status).toBe("MARKED");
    expect(asStudent.body.submissions[0].scoreHundredths).toBeUndefined();
    expect(JSON.stringify(asStudent.body)).not.toContain("check question 7");
  });

  it("refuses a mark higher than the work is out of", async () => {
    const detail = await request(app.getHttpServer())
      .get(`/v1/homework/${assignmentId}`)
      .set(asAdmin())
      .expect(200);

    const res = await request(app.getHttpServer())
      .patch(`/v1/homework/submissions/${detail.body.submissions[0].id}/mark`)
      .set(asAdmin())
      .send({ scoreHundredths: 5000 })
      .expect(400);
    expect(res.body.message).toMatch(/more than the 10/);
  });

  it("releases the mark, and scales it into the linked assessment", async () => {
    const released = await request(app.getHttpServer())
      .post(`/v1/homework/${assignmentId}/release`)
      .set(asAdmin())
      .expect(201);
    expect(released.body.released).toBe(1);

    const asStudent = await request(app.getHttpServer())
      .get(`/v1/homework/${assignmentId}`)
      .set(asStudentA())
      .expect(200);
    expect(asStudent.body.submissions[0].scoreHundredths).toBe(800);
    expect(asStudent.body.submissions[0].feedback).toMatch(/check question 7/);

    // 8/10 on the homework is 16/20 in a gradebook out of 20, not 8.
    const marks = await request(app.getHttpServer())
      .get("/v1/data/results/export?format=csv")
      .set(asAdmin())
      .expect(200);
    const line = marks.text.split("\n").find((l) => l.includes("Homework total"));
    expect(line).toContain("16");
  });

  it("lets a guardian see their own child's mark and no one else's", async () => {
    const mine = await request(app.getHttpServer())
      .get(`/v1/homework/${assignmentId}`)
      .set("Authorization", `Bearer ${guardianAToken}`)
      .expect(200);
    expect(mine.body.submissions[0].scoreHundredths).toBe(800);

    const theirs = await request(app.getHttpServer())
      .get(`/v1/homework/${assignmentId}`)
      .set("Authorization", `Bearer ${guardianBToken}`)
      .expect(200);
    expect(theirs.body.submissions).toEqual([]);
    expect(JSON.stringify(theirs.body)).not.toContain("Corrected answers");
  });

  it("refuses to change work that has been marked", async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/homework/${assignmentId}/submit`)
      .set(asStudentA())
      .send({ content: "Actually, let me change my answers" })
      .expect(403);
    expect(res.body.message).toMatch(/already been marked/i);
  });

  it("flags late work rather than refusing it", async () => {
    const late = await request(app.getHttpServer())
      .post("/v1/homework")
      .set(asAdmin())
      .send({
        classId,
        subjectId,
        title: "Overdue reading",
        instructions: "Chapter 4.",
        dueAt: "2020-01-01T00:00:00.000Z",
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/v1/homework/${late.body.id}`)
      .set(asAdmin())
      .send({ status: "SET" })
      .expect(200);

    const res = await request(app.getHttpServer())
      .post(`/v1/homework/${late.body.id}/submit`)
      .set(asStudentA())
      .send({ content: "Sorry it's late" })
      .expect(201);

    // Accepted and flagged — a teacher decides what late is worth, and
    // refusing it would lose the work.
    expect(res.body.isLate).toBe(true);
  });

  it("refuses work once the assignment is closed", async () => {
    const closed = await request(app.getHttpServer())
      .post("/v1/homework")
      .set(asAdmin())
      .send({ classId, subjectId, title: "Finished", instructions: "x" })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/v1/homework/${closed.body.id}`)
      .set(asAdmin())
      .send({ status: "CLOSED" })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/v1/homework/${closed.body.id}/submit`)
      .set(asStudentA())
      .send({ content: "too late" })
      .expect(403);
  });

  it("keeps setting and marking away from students and guardians", async () => {
    await request(app.getHttpServer())
      .post("/v1/homework")
      .set(asStudentA())
      .send({ classId, subjectId, title: "Mine", instructions: "x" })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/v1/homework/${assignmentId}`)
      .set(asStudentA())
      .send({ status: "CLOSED" })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/v1/homework/${assignmentId}/release`)
      .set("Authorization", `Bearer ${guardianAToken}`)
      .expect(403);
  });

  it("will not let a guardian hand work in on a child's behalf", async () => {
    // The submission is the child's own record of their own work.
    await request(app.getHttpServer())
      .post(`/v1/homework/${assignmentId}/submit`)
      .set("Authorization", `Bearer ${guardianAToken}`)
      .send({ content: "I did my child's homework" })
      .expect(403);
  });
});
