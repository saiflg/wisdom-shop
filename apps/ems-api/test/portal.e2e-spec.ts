import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Client as PgClient } from "pg";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { ControlPrismaService } from "../src/control-db/control-prisma.service";

const FIXTURE_PREFIX = "e2e-portal-";

describe("Student and parent portal (e2e)", () => {
  let app: INestApplication;
  let controlPrisma: ControlPrismaService;

  let adminToken: string;
  let studentAToken: string;
  let guardianAToken: string;
  let guardianBToken: string;

  let classId: string;
  let subjectId: string;
  let studentAProfileId: string;
  let studentBProfileId: string;
  let siblingProfileId: string;
  let assignmentId: string;

  const platformEmail = `${FIXTURE_PREFIX}platform-${Date.now()}@wisdomcampus.example`;
  const password = "Sup3rSecret!Pass";
  const school = { slug: `${FIXTURE_PREFIX}${Date.now()}`, adminEmail: `${FIXTURE_PREFIX}admin@example.com` };
  const studentAEmail = `${FIXTURE_PREFIX}student-a@example.com`;
  const guardianAEmail = `${FIXTURE_PREFIX}guardian-a@example.com`;
  const guardianBEmail = `${FIXTURE_PREFIX}guardian-b@example.com`;

  const asAdmin = () => ({ Authorization: `Bearer ${adminToken}` });
  const asStudentA = () => ({ Authorization: `Bearer ${studentAToken}` });
  const asGuardianA = () => ({ Authorization: `Bearer ${guardianAToken}` });
  const asGuardianB = () => ({ Authorization: `Bearer ${guardianBToken}` });

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

    // Family A has two children; family B has one. Two families is what makes
    // a leak visible.
    const a = await request(app.getHttpServer())
      .post("/v1/students")
      .set(asAdmin())
      .send({ firstName: "Ada", lastName: "One", email: studentAEmail, password, studentCode: "P-001" })
      .expect(201);
    studentAProfileId = a.body.id;

    const sibling = await request(app.getHttpServer())
      .post("/v1/students")
      .set(asAdmin())
      .send({ firstName: "Sam", lastName: "One", studentCode: "P-002" })
      .expect(201);
    siblingProfileId = sibling.body.id;

    const b = await request(app.getHttpServer())
      .post("/v1/students")
      .set(asAdmin())
      .send({ firstName: "Bob", lastName: "Two", studentCode: "P-003" })
      .expect(201);
    studentBProfileId = b.body.id;

    for (const studentProfileId of [a.body.id, sibling.body.id, b.body.id]) {
      await request(app.getHttpServer())
        .post("/v1/enrollments")
        .set(asAdmin())
        .send({ studentProfileId, classId })
        .expect(201);
    }

    for (const [studentProfileId, email, firstName] of [
      [a.body.id, guardianAEmail, "Grace"],
      [b.body.id, guardianBEmail, "Gary"],
    ] as const) {
      await request(app.getHttpServer())
        .post("/v1/guardians")
        .set(asAdmin())
        .send({ studentProfileId, firstName, lastName: "Parent", email, password, relationship: "Parent" })
        .expect(201);
    }

    // Grace is also Sam's parent — the multi-child case.
    await request(app.getHttpServer())
      .post("/v1/guardians")
      .set(asAdmin())
      .send({
        studentProfileId: sibling.body.id,
        firstName: "Grace",
        lastName: "Parent",
        email: guardianAEmail,
        password,
        relationship: "Parent",
      })
      .expect(201);

    studentAToken = await login(studentAEmail);
    guardianAToken = await login(guardianAEmail);
    guardianBToken = await login(guardianBEmail);

    // Some homework, marked but deliberately not released.
    const assignment = await request(app.getHttpServer())
      .post("/v1/homework")
      .set(asAdmin())
      .send({
        classId,
        subjectId,
        title: "Fractions worksheet",
        instructions: "Questions 1 to 12.",
        maxScoreHundredths: 1000,
      })
      .expect(201);
    assignmentId = assignment.body.id;

    await request(app.getHttpServer())
      .patch(`/v1/homework/${assignmentId}`)
      .set(asAdmin())
      .send({ status: "SET" })
      .expect(200);
  }, 180000);

  afterAll(async () => {
    if (controlPrisma) await purgeFixtures().catch(() => undefined);
    if (app) await app.close();
  }, 180000);

  it("shows a student only themselves", async () => {
    const res = await request(app.getHttpServer())
      .get("/v1/portal/children")
      .set(asStudentA())
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe("Ada One");
    expect(res.body[0].className).toBe("Grade 5A");
  });

  it("shows a guardian each of their own children and nobody else's", async () => {
    const res = await request(app.getHttpServer())
      .get("/v1/portal/children")
      .set(asGuardianA())
      .expect(200);

    expect(res.body.map((c: { name: string }) => c.name).sort()).toEqual(["Ada One", "Sam One"]);
    expect(JSON.stringify(res.body)).not.toContain("Bob Two");
  });

  it("assembles a home page in one request", async () => {
    const res = await request(app.getHttpServer()).get("/v1/portal/home").set(asStudentA()).expect(200);

    expect(res.body.child.name).toBe("Ada One");
    expect(res.body.homework).not.toBeNull();
    expect(res.body.fees).toBeDefined();
    expect(Array.isArray(res.body.today)).toBe(true);
    // A child with no registers taken has no attendance rate — not 0%, which
    // is a lie a parent would reasonably panic about. The attendance module
    // already decided this; the portal just passes it through.
    expect(res.body.attendance.total).toBe(0);
    expect(res.body.attendance.presentRate).toBeNull();
  });

  it("lets a guardian switch between their children", async () => {
    const first = await request(app.getHttpServer())
      .get(`/v1/portal/home?studentProfileId=${studentAProfileId}`)
      .set(asGuardianA())
      .expect(200);
    expect(first.body.child.name).toBe("Ada One");

    const second = await request(app.getHttpServer())
      .get(`/v1/portal/home?studentProfileId=${siblingProfileId}`)
      .set(asGuardianA())
      .expect(200);
    expect(second.body.child.name).toBe("Sam One");
  });

  // The one that matters.
  it("refuses a guardian asking for another family's child", async () => {
    await request(app.getHttpServer())
      .get(`/v1/portal/home?studentProfileId=${studentBProfileId}`)
      .set(asGuardianA())
      .expect(404);

    // And the other way round.
    await request(app.getHttpServer())
      .get(`/v1/portal/home?studentProfileId=${studentAProfileId}`)
      .set(asGuardianB())
      .expect(404);
  });

  it("refuses a student asking for a classmate", async () => {
    await request(app.getHttpServer())
      .get(`/v1/portal/home?studentProfileId=${studentBProfileId}`)
      .set(asStudentA())
      .expect(404);
  });

  it("lists homework that is due, and never a draft", async () => {
    const draft = await request(app.getHttpServer())
      .post("/v1/homework")
      .set(asAdmin())
      .send({ classId, subjectId, title: "Secret plans", instructions: "Not ready" })
      .expect(201);
    void draft;

    const res = await request(app.getHttpServer()).get("/v1/portal/home").set(asStudentA()).expect(200);

    const titles = [
      ...res.body.homework.overdue,
      ...res.body.homework.today,
      ...res.body.homework.upcoming,
      ...res.body.homework.noDeadline,
    ].map((item: { title: string }) => item.title);

    expect(titles).toContain("Fractions worksheet");
    expect(JSON.stringify(res.body)).not.toContain("Secret plans");
  });

  it("never shows a mark that has not been released", async () => {
    await request(app.getHttpServer())
      .post(`/v1/homework/${assignmentId}/submit`)
      .set(asStudentA())
      .send({ content: "My answers" })
      .expect(201);

    const detail = await request(app.getHttpServer())
      .get(`/v1/homework/${assignmentId}`)
      .set(asAdmin())
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/v1/homework/submissions/${detail.body.submissions[0].id}/mark`)
      .set(asAdmin())
      .send({ scoreHundredths: 900, feedback: "Nearly perfect" })
      .expect(200);

    const beforeRelease = await request(app.getHttpServer())
      .get("/v1/portal/home")
      .set(asStudentA())
      .expect(200);

    expect(beforeRelease.body.homework.recentlyMarked).toEqual([]);
    expect(JSON.stringify(beforeRelease.body)).not.toContain("Nearly perfect");

    await request(app.getHttpServer())
      .post(`/v1/homework/${assignmentId}/release`)
      .set(asAdmin())
      .expect(201);

    const afterRelease = await request(app.getHttpServer())
      .get("/v1/portal/home")
      .set(asStudentA())
      .expect(200);

    expect(afterRelease.body.homework.recentlyMarked).toHaveLength(1);
    expect(afterRelease.body.homework.recentlyMarked[0].scoreHundredths).toBe(900);
  });

  it("shows a guardian the same released mark for their own child", async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/portal/home?studentProfileId=${studentAProfileId}`)
      .set(asGuardianA())
      .expect(200);
    expect(res.body.homework.recentlyMarked[0].scoreHundredths).toBe(900);
  });

  it("tells staff plainly that this page is not for them", async () => {
    const res = await request(app.getHttpServer()).get("/v1/portal/home").set(asAdmin()).expect(200);

    // Rather than a broken-looking empty page, or worse, every child in the
    // school.
    expect(res.body.isStaff).toBe(true);
    expect(res.body.children).toEqual([]);
    expect(res.body.child).toBeNull();
  });

  it("counts what a family owes", async () => {
    const structure = await request(app.getHttpServer())
      .post("/v1/fees/structures")
      .set(asAdmin())
      .send({
        name: "Term 1",
        academicYear: "2026-2027",
        term: "Term 1",
        classId,
        items: [{ label: "Tuition", amountCents: 500_000 }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/v1/fees/structures/${structure.body.id}/invoices`)
      .set(asAdmin())
      .send({ dueDate: "2027-01-31" })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/v1/portal/home?studentProfileId=${studentAProfileId}`)
      .set(asGuardianA())
      .expect(200);

    // Straight from the fees module's own summary, so the portal cannot
    // disagree with the invoices page about what is owed.
    expect(res.body.fees.invoiceCount).toBe(1);
    expect(res.body.fees.outstanding).toBe(500_000);
  });
});
