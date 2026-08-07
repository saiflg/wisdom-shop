import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Client as PgClient } from "pg";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { ControlPrismaService } from "../src/control-db/control-prisma.service";

const FIXTURE_PREFIX = "e2e-pdf-";
const YEAR = "2026-2027";
const TERM = "Term 1";

/** Every PDF starts with this; anything else is not a PDF. */
const PDF_MAGIC = "%PDF-";

describe("PDF documents (e2e)", () => {
  let app: INestApplication;
  let controlPrisma: ControlPrismaService;
  let adminToken: string;
  let guardianAToken: string;
  let guardianBToken: string;
  let classId: string;
  let studentA: string;
  let studentB: string;
  let invoiceA: string;

  const platformEmail = `${FIXTURE_PREFIX}platform-${Date.now()}@wisdomcampus.example`;
  const password = "Sup3rSecret!Pass";
  const school = { slug: `${FIXTURE_PREFIX}${Date.now()}`, adminEmail: `${FIXTURE_PREFIX}admin@example.com` };
  const guardianAEmail = `${FIXTURE_PREFIX}guardian-a@example.com`;
  const guardianBEmail = `${FIXTURE_PREFIX}guardian-b@example.com`;

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
      .send({ name: "Grade 8A", academicYear: YEAR })
      .expect(201);
    classId = klass.body.id;

    const subject = await request(app.getHttpServer())
      .post("/v1/subjects")
      .set(asAdmin())
      .send({ name: "Mathematics" })
      .expect(201);

    const a = await request(app.getHttpServer())
      .post("/v1/students")
      .set(asAdmin())
      .send({ firstName: "Ada", lastName: "One", studentCode: "PDF-001" })
      .expect(201);
    studentA = a.body.id;

    const b = await request(app.getHttpServer())
      .post("/v1/students")
      .set(asAdmin())
      .send({ firstName: "Bola", lastName: "Two", studentCode: "PDF-002" })
      .expect(201);
    studentB = b.body.id;

    for (const studentProfileId of [studentA, studentB]) {
      await request(app.getHttpServer())
        .post("/v1/enrollments")
        .set(asAdmin())
        .send({ studentProfileId, classId })
        .expect(201);
    }

    for (const [studentProfileId, email, first] of [
      [studentA, guardianAEmail, "Grace"],
      [studentB, guardianBEmail, "Gary"],
    ] as const) {
      await request(app.getHttpServer())
        .post("/v1/guardians")
        .set(asAdmin())
        .send({ studentProfileId, firstName: first, lastName: "Parent", email, password, relationship: "Parent" })
        .expect(201);
    }

    guardianAToken = await login(guardianAEmail);
    guardianBToken = await login(guardianBEmail);

    // A published result, so there is a report card to print.
    const assessment = await request(app.getHttpServer())
      .post("/v1/grading/assessments")
      .set(asAdmin())
      .send({
        subjectId: subject.body.id,
        classId,
        name: "Exam",
        academicYear: YEAR,
        term: TERM,
        maxScoreHundredths: 10000,
        weightPercent: 100,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/v1/grading/assessments/${assessment.body.id}/marks`)
      .set(asAdmin())
      .send({
        marks: [
          { studentProfileId: studentA, scoreHundredths: 7700, status: "RECORDED" },
          { studentProfileId: studentB, scoreHundredths: 5500, status: "RECORDED" },
        ],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post("/v1/grading/publish")
      .set(asAdmin())
      .send({ classId, academicYear: YEAR, term: TERM })
      .expect(201);

    // A fee invoice, so there is an invoice to print.
    const structure = await request(app.getHttpServer())
      .post("/v1/fees/structures")
      .set(asAdmin())
      .send({
        name: "Term 1 Fees",
        academicYear: YEAR,
        term: TERM,
        classId,
        items: [{ label: "Tuition", amountCents: 4500055 }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/v1/fees/structures/${structure.body.id}/invoices`)
      .set(asAdmin())
      .send({})
      .expect(201);

    // The route answers { invoices, ... }, not a bare array.
    const listed = await request(app.getHttpServer()).get("/v1/fees/invoices").set(asAdmin()).expect(200);
    invoiceA = listed.body.invoices.find(
      (invoice: { studentProfileId: string }) => invoice.studentProfileId === studentA,
    ).id;
  }, 180000);

  afterAll(async () => {
    if (controlPrisma) await purgeFixtures().catch(() => undefined);
    if (app) await app.close();
  }, 180000);

  const asPdf = (path: string, token: string) =>
    request(app.getHttpServer()).get(path).set("Authorization", `Bearer ${token}`).responseType("blob");

  it("prints a report card as a real PDF", async () => {
    const res = await asPdf(
      `/v1/pdf/report-cards/${studentA}?academicYear=${YEAR}&term=${encodeURIComponent(TERM)}`,
      adminToken,
    ).expect(200);

    expect(res.headers["content-type"]).toContain("application/pdf");
    const body = res.body as Buffer;
    expect(body.subarray(0, 5).toString()).toBe(PDF_MAGIC);
    expect(body.length).toBeGreaterThan(500);
  });

  it("lets a guardian print their own child's report card", async () => {
    const res = await asPdf(
      `/v1/pdf/report-cards/${studentA}?academicYear=${YEAR}&term=${encodeURIComponent(TERM)}`,
      guardianAToken,
    ).expect(200);
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe(PDF_MAGIC);
  });

  it("NEVER lets a guardian print another family's report card", async () => {
    // The scoping is the grading service's, not a second copy — this proves
    // the PDF route inherits it rather than bypassing it.
    await asPdf(
      `/v1/pdf/report-cards/${studentB}?academicYear=${YEAR}&term=${encodeURIComponent(TERM)}`,
      guardianAToken,
    ).expect(404);

    await asPdf(
      `/v1/pdf/report-cards/${studentA}?academicYear=${YEAR}&term=${encodeURIComponent(TERM)}`,
      guardianBToken,
    ).expect(404);
  });

  it("NEVER lets a guardian print another family's invoice", async () => {
    await asPdf(`/v1/pdf/invoices/${invoiceA}`, guardianBToken).expect(404);
  });

  it("lets a guardian print their own child's invoice", async () => {
    const res = await asPdf(`/v1/pdf/invoices/${invoiceA}`, guardianAToken).expect(200);
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe(PDF_MAGIC);
  });

  it("prints a class list for staff", async () => {
    const res = await asPdf(`/v1/pdf/classes/${classId}/list`, adminToken).expect(200);
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe(PDF_MAGIC);
  });

  it("hides the class list from a family — it is every child's name", async () => {
    await asPdf(`/v1/pdf/classes/${classId}/list`, guardianAToken).expect(404);
  });

  it("prints a class timetable", async () => {
    const res = await asPdf(`/v1/pdf/classes/${classId}/timetable`, adminToken).expect(200);
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe(PDF_MAGIC);
  });

  it("produces a bigger file for a longer list, so rows are actually reaching the page", async () => {
    // A weak but real check that content scales with data: a document that
    // silently dropped every row would not grow.
    const before = await asPdf(`/v1/pdf/classes/${classId}/list`, adminToken).expect(200);

    for (let i = 0; i < 40; i += 1) {
      const student = await request(app.getHttpServer())
        .post("/v1/students")
        .set(asAdmin())
        .send({ firstName: `Bulk${i}`, lastName: "Student", studentCode: `PDF-BULK-${i}` })
        .expect(201);
      await request(app.getHttpServer())
        .post("/v1/enrollments")
        .set(asAdmin())
        .send({ studentProfileId: student.body.id, classId })
        .expect(201);
    }

    const after = await asPdf(`/v1/pdf/classes/${classId}/list`, adminToken).expect(200);
    expect((after.body as Buffer).length).toBeGreaterThan((before.body as Buffer).length);
  }, 120000);

  it("404s a report card that was never published", async () => {
    await asPdf(
      `/v1/pdf/report-cards/${studentA}?academicYear=${YEAR}&term=Term%209`,
      guardianAToken,
    ).expect(404);
  });

  it("404s an unknown class and an unknown invoice", async () => {
    await asPdf("/v1/pdf/classes/does-not-exist/list", adminToken).expect(404);
    await asPdf("/v1/pdf/invoices/does-not-exist", adminToken).expect(404);
  });

  it("refuses anonymous access to every document", async () => {
    for (const path of [
      `/v1/pdf/report-cards/${studentA}?academicYear=${YEAR}&term=${encodeURIComponent(TERM)}`,
      `/v1/pdf/classes/${classId}/list`,
      `/v1/pdf/classes/${classId}/timetable`,
      `/v1/pdf/invoices/${invoiceA}`,
    ]) {
      await request(app.getHttpServer()).get(path).expect(401);
    }
  });
});
