import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Client as PgClient } from "pg";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { ControlPrismaService } from "../src/control-db/control-prisma.service";

const FIXTURE_PREFIX = "e2e-msg-";

describe("Messaging (e2e)", () => {
  let app: INestApplication;
  let controlPrisma: ControlPrismaService;
  let adminToken: string;
  let guardianAToken: string;
  let classId: string;
  let studentA: string;
  let studentB: string;

  const platformEmail = `${FIXTURE_PREFIX}platform-${Date.now()}@wisdomcampus.example`;
  const password = "Sup3rSecret!Pass";
  const school = { slug: `${FIXTURE_PREFIX}${Date.now()}`, adminEmail: `${FIXTURE_PREFIX}admin@example.com` };
  const guardianAEmail = `${FIXTURE_PREFIX}guardian-a@example.com`;
  const guardianBEmail = `${FIXTURE_PREFIX}guardian-b@example.com`;
  const TODAY = "2026-08-04";

  const asAdmin = () => ({ Authorization: `Bearer ${adminToken}` });

  async function login(email: string) {
    const res = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ schoolSlug: school.slug, email, password })
      .expect(200);
    return res.body.accessToken as string;
  }

  async function outbox() {
    const res = await request(app.getHttpServer()).get("/v1/messaging/outbox").set(asAdmin()).expect(200);
    return res.body as {
      id: string;
      event: string;
      channel: string;
      status: string;
      statusReason: string | null;
      recipientAddress: string;
      recipientName: string;
      subject: string | null;
      body: string;
      studentProfileId: string;
    }[];
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
      .send({ name: "Grade 6A", academicYear: "2026-2027" })
      .expect(201);
    classId = klass.body.id;

    const a = await request(app.getHttpServer())
      .post("/v1/students")
      .set(asAdmin())
      .send({ firstName: "Ada", lastName: "One" })
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
    // Explicit, like every suite that provisions a school.
  }, 180000);

  afterAll(async () => {
    if (controlPrisma) await purgeFixtures().catch(() => undefined);
    if (app) await app.close();
  }, 180000);

  it("seeds usable default templates at provisioning", async () => {
    const res = await request(app.getHttpServer()).get("/v1/messaging/templates").set(asAdmin()).expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(6);
    const absentEmail = res.body.find(
      (t: { event: string; channel: string }) => t.event === "ATTENDANCE_ABSENT" && t.channel === "EMAIL",
    );
    expect(absentEmail.body).toContain("{{studentName}}");
    expect(absentEmail.enabled).toBe(true);
  });

  it("notifies a guardian when their child is marked absent", async () => {
    await request(app.getHttpServer())
      .post("/v1/attendance/registers")
      .set(asAdmin())
      .send({ classId, date: TODAY, marks: [{ studentProfileId: studentA, status: "ABSENT" }] })
      .expect(201);

    const messages = await outbox();
    const emails = messages.filter((m) => m.event === "ATTENDANCE_ABSENT" && m.channel === "EMAIL");
    expect(emails).toHaveLength(1);
    expect(emails[0]?.recipientAddress).toBe(guardianAEmail);
    // The rendered body must actually name the child and the school.
    expect(emails[0]?.body).toContain("Ada One");
    expect(emails[0]?.subject).toContain("Ada One");
  });

  it("never tells a family about another family's child", async () => {
    // The invariant. Bob's guardian must appear nowhere in Ada's messages.
    const messages = await outbox();
    const aboutAda = messages.filter((m) => m.studentProfileId === studentA);
    expect(aboutAda.length).toBeGreaterThan(0);
    for (const message of aboutAda) {
      expect(message.recipientAddress).not.toBe(guardianBEmail);
      expect(message.body).not.toContain("Bob Two");
    }
  });

  it("does not notify twice when the register is saved again", async () => {
    // Teachers re-save registers all morning as latecomers arrive.
    const before = (await outbox()).filter((m) => m.event === "ATTENDANCE_ABSENT").length;

    await request(app.getHttpServer())
      .post("/v1/attendance/registers")
      .set(asAdmin())
      .send({ classId, date: TODAY, marks: [{ studentProfileId: studentA, status: "ABSENT" }] })
      .expect(201);

    const after = (await outbox()).filter((m) => m.event === "ATTENDANCE_ABSENT").length;
    expect(after).toBe(before);
  });

  it("records SKIPPED rather than FAILED when no gateway is configured", async () => {
    // Nothing went wrong — there is simply nowhere to send. A school should
    // not be chasing phantom errors.
    const messages = await outbox();
    const email = messages.find((m) => m.event === "ATTENDANCE_ABSENT" && m.channel === "EMAIL");
    expect(email?.status).toBe("SKIPPED");
    expect(email?.statusReason).toMatch(/no email gateway/i);
  });

  it("skips SMS with a clear reason when the guardian has no phone number", async () => {
    const messages = await outbox();
    const sms = messages.find((m) => m.event === "ATTENDANCE_ABSENT" && m.channel === "SMS");
    expect(sms?.status).toBe("SKIPPED");
    expect(sms?.statusReason).toMatch(/no phone number/i);
  });

  it("refuses a template using a placeholder its event cannot supply", async () => {
    const templates = await request(app.getHttpServer())
      .get("/v1/messaging/templates")
      .set(asAdmin())
      .expect(200);
    const absent = templates.body.find(
      (t: { event: string; channel: string }) => t.event === "ATTENDANCE_ABSENT" && t.channel === "EMAIL",
    );

    await request(app.getHttpServer())
      .patch(`/v1/messaging/templates/${absent.id}`)
      .set(asAdmin())
      .send({ body: "Your invoice {{invoiceNumber}} is due" })
      .expect(400);
  });

  it("never lets a guardian read the outbox", async () => {
    // It spans every family in the school.
    await request(app.getHttpServer())
      .get("/v1/messaging/outbox")
      .set("Authorization", `Bearer ${guardianAToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get("/v1/messaging/templates")
      .set("Authorization", `Bearer ${guardianAToken}`)
      .expect(403);
  });

  it("notifies when results are published, once per republish", async () => {
    const subject = await request(app.getHttpServer())
      .post("/v1/subjects")
      .set(asAdmin())
      .send({ name: "Civics" })
      .expect(201);

    const assessment = await request(app.getHttpServer())
      .post("/v1/grading/assessments")
      .set(asAdmin())
      .send({
        subjectId: subject.body.id,
        classId,
        name: "Term Test",
        academicYear: "2026-2027",
        term: "Term 1",
        maxScoreHundredths: 10000,
        weightPercent: 100,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/v1/grading/assessments/${assessment.body.id}/marks`)
      .set(asAdmin())
      .send({
        marks: [
          { studentProfileId: studentA, scoreHundredths: 8000, status: "RECORDED" },
          { studentProfileId: studentB, scoreHundredths: 6000, status: "RECORDED" },
        ],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post("/v1/grading/publish")
      .set(asAdmin())
      .send({ classId, academicYear: "2026-2027", term: "Term 1" })
      .expect(201);

    const first = (await outbox()).filter((m) => m.event === "RESULTS_PUBLISHED" && m.channel === "EMAIL");
    // One per family, not one per school.
    expect(first).toHaveLength(2);

    await request(app.getHttpServer())
      .post("/v1/grading/unpublish")
      .set(asAdmin())
      .send({ classId, academicYear: "2026-2027", term: "Term 1" })
      .expect(201);
    await request(app.getHttpServer())
      .post("/v1/grading/publish")
      .set(asAdmin())
      .send({ classId, academicYear: "2026-2027", term: "Term 1" })
      .expect(201);

    const second = (await outbox()).filter((m) => m.event === "RESULTS_PUBLISHED" && m.channel === "EMAIL");
    expect(second).toHaveLength(2);
  });

  it("keeps each family's results message to their own child", async () => {
    const messages = (await outbox()).filter((m) => m.event === "RESULTS_PUBLISHED" && m.channel === "EMAIL");
    const toGrace = messages.find((m) => m.recipientAddress === guardianAEmail);
    const toGary = messages.find((m) => m.recipientAddress === guardianBEmail);

    expect(toGrace?.body).toContain("Ada One");
    expect(toGrace?.body).not.toContain("Bob Two");
    expect(toGary?.body).toContain("Bob Two");
    expect(toGary?.body).not.toContain("Ada One");
  });

  it("does not notify when a student is marked present", async () => {
    await request(app.getHttpServer())
      .post("/v1/attendance/registers")
      .set(asAdmin())
      .send({ classId, date: "2026-08-05", marks: [{ studentProfileId: studentB, status: "PRESENT" }] })
      .expect(201);

    const forBob = (await outbox()).filter(
      (m) => m.event === "ATTENDANCE_ABSENT" && m.studentProfileId === studentB,
    );
    expect(forBob).toHaveLength(0);
  });
});
