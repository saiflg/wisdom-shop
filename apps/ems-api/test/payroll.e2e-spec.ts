import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Client as PgClient } from "pg";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { ControlPrismaService } from "../src/control-db/control-prisma.service";

const FIXTURE_PREFIX = "e2e-pay-";
const ACCOUNT_NUMBER = "0123456789";

describe("Payroll (e2e)", () => {
  let app: INestApplication;
  let controlPrisma: ControlPrismaService;

  let adminToken: string;
  let teacherToken: string;
  let teacherId: string;
  let runId: string;

  const platformEmail = `${FIXTURE_PREFIX}platform-${Date.now()}@wisdomcampus.example`;
  const password = "Sup3rSecret!Pass";
  const school = { slug: `${FIXTURE_PREFIX}${Date.now()}`, adminEmail: `${FIXTURE_PREFIX}admin@example.com` };
  const teacherEmail = `${FIXTURE_PREFIX}teacher@example.com`;

  const asAdmin = () => ({ Authorization: `Bearer ${adminToken}` });

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

  const setSalary = (components: unknown[]) =>
    request(app.getHttpServer())
      .put(`/v1/payroll/staff/${teacherId}/components`)
      .set(asAdmin())
      .send({ components });

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

    const teacher = await request(app.getHttpServer())
      .post("/v1/teachers")
      .set(asAdmin())
      .send({ firstName: "Ade", lastName: "Balogun", email: teacherEmail, password })
      .expect(201);
    teacherId = teacher.body.id;

    await request(app.getHttpServer())
      .put(`/v1/staff/${teacherId}`)
      .set(asAdmin())
      .send({
        staffNumber: "STF-001",
        jobTitle: "Head of Mathematics",
        bankName: "First Bank",
        bankCode: "011",
        accountName: "Ade Balogun",
        accountNumber: ACCOUNT_NUMBER,
      })
      .expect(200);

    teacherToken = await login(teacherEmail);
  }, 180000);

  afterAll(async () => {
    if (controlPrisma) await purgeFixtures().catch(() => undefined);
    if (app) await app.close();
  }, 180000);

  it("stores a salary and previews what it comes to", async () => {
    const res = await setSalary([
      { label: "Basic", kind: "EARNING", basis: "FIXED", amount: 200_000, isBasic: true },
      { label: "Housing", kind: "EARNING", basis: "FIXED", amount: 50_000 },
      { label: "Pension", kind: "DEDUCTION", basis: "PERCENT_OF_BASIC", amount: 800 },
    ]).expect(200);

    expect(res.body.preview.grossCents).toBe(250_000);
    // 8% of basic (200,000), not of gross.
    expect(res.body.preview.deductionsCents).toBe(16_000);
    expect(res.body.preview.netCents).toBe(234_000);
  });

  it("refuses two components both claiming to be basic", async () => {
    await setSalary([
      { label: "Basic", kind: "EARNING", basis: "FIXED", amount: 200_000, isBasic: true },
      { label: "Consolidated", kind: "EARNING", basis: "FIXED", amount: 100_000, isBasic: true },
    ]).expect(400);
  });

  it("refuses a basic that is a percentage of itself", async () => {
    await setSalary([
      { label: "Basic", kind: "EARNING", basis: "PERCENT_OF_BASIC", amount: 5000, isBasic: true },
    ]).expect(400);
  });

  it("replaces a salary wholesale rather than accumulating lines", async () => {
    await setSalary([{ label: "Basic", kind: "EARNING", basis: "FIXED", amount: 100_000, isBasic: true }]).expect(200);

    const res = await setSalary([
      { label: "Basic", kind: "EARNING", basis: "FIXED", amount: 200_000, isBasic: true },
      { label: "Housing", kind: "EARNING", basis: "FIXED", amount: 50_000 },
      { label: "Pension", kind: "DEDUCTION", basis: "PERCENT_OF_BASIC", amount: 800 },
    ]).expect(200);

    expect(res.body.components).toHaveLength(3);
  });

  it("opens a month and drafts a payslip for everyone with a salary", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/payroll/runs")
      .set(asAdmin())
      .send({ year: 2027, month: 3 })
      .expect(201);

    runId = res.body.id;
    expect(res.body.status).toBe("DRAFT");
    expect(res.body.period).toBe("March 2027");
    expect(res.body.payslips).toHaveLength(1);
    expect(res.body.payslips[0].netCents).toBe(234_000);
    expect(res.body.summary).toEqual({
      staffCount: 1,
      grossCents: 250_000,
      deductionsCents: 16_000,
      netCents: 234_000,
    });
  });

  // The one that matters most.
  it("refuses to run the same month twice", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/payroll/runs")
      .set(asAdmin())
      .send({ year: 2027, month: 3 })
      .expect(409);

    expect(res.body.message).toMatch(/already been run/i);

    // And there is still exactly one March.
    const runs = await request(app.getHttpServer()).get("/v1/payroll/runs").set(asAdmin()).expect(200);
    expect(runs.body.filter((r: { period: string }) => r.period === "March 2027")).toHaveLength(1);
  });

  it("tracks salary changes while still a draft", async () => {
    await setSalary([
      { label: "Basic", kind: "EARNING", basis: "FIXED", amount: 300_000, isBasic: true },
    ]).expect(200);

    const refreshed = await request(app.getHttpServer())
      .post(`/v1/payroll/runs/${runId}/refresh`)
      .set(asAdmin())
      .expect(201);

    expect(refreshed.body.payslips[0].netCents).toBe(300_000);
  });

  it("freezes payslips once approved, so a later pay rise cannot rewrite the month", async () => {
    const approved = await request(app.getHttpServer())
      .patch(`/v1/payroll/runs/${runId}/approve`)
      .set(asAdmin())
      .expect(200);

    expect(approved.body.status).toBe("APPROVED");
    expect(approved.body.approvedByName).toBe("Admin " + school.slug);
    expect(approved.body.payslips[0].netCents).toBe(300_000);

    // A rise in April.
    await setSalary([
      { label: "Basic", kind: "EARNING", basis: "FIXED", amount: 900_000, isBasic: true },
    ]).expect(200);

    const after = await request(app.getHttpServer()).get(`/v1/payroll/runs/${runId}`).set(asAdmin()).expect(200);
    expect(after.body.payslips[0].netCents).toBe(300_000);

    // And a refresh is refused outright rather than silently doing nothing.
    await request(app.getHttpServer()).post(`/v1/payroll/runs/${runId}/refresh`).set(asAdmin()).expect(400);
  });

  it("keeps the payslip's own copy of the salary lines", async () => {
    const res = await request(app.getHttpServer()).get(`/v1/payroll/runs/${runId}`).set(asAdmin()).expect(200);
    const payslip = await request(app.getHttpServer())
      .get(`/v1/payroll/payslips/${res.body.payslips[0].id}`)
      .set(asAdmin())
      .expect(200);

    expect(payslip.body.lines).toEqual([{ label: "Basic", kind: "EARNING", amountCents: 300_000 }]);
    expect(payslip.body.period).toBe("March 2027");
    // A payslip gets printed and left on desks.
    expect(payslip.body.accountNumberMasked).toBe("••••6789");
    expect(JSON.stringify(payslip.body)).not.toContain(ACCOUNT_NUMBER);
  });

  it("produces a bank file, and logs every account number it discloses", async () => {
    const before = await request(app.getHttpServer()).get("/v1/staff/access-log").set(asAdmin()).expect(200);

    const res = await request(app.getHttpServer())
      .post(`/v1/payroll/runs/${runId}/transfer-file`)
      .set(asAdmin())
      .expect(201);

    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.text).toContain("Ade Balogun");
    // The full number appears here and nowhere else, quoted so a leading
    // zero survives the spreadsheet somebody will open it in.
    expect(res.text).toContain(`"${ACCOUNT_NUMBER}"`);
    expect(res.text).toContain("3000.00");
    expect(res.headers["x-payroll-paid-count"]).toBe("1");
    expect(res.headers["x-payroll-missing-count"]).toBe("0");

    const after = await request(app.getHttpServer()).get("/v1/staff/access-log").set(asAdmin()).expect(200);
    expect(after.body.length).toBe(before.body.length + 1);
    expect(after.body[0].reason).toMatch(/payroll run March 2027/);
    expect(after.body[0].staffName).toBe("Ade Balogun");
  });

  it("reports staff who have no account on file rather than dropping them", async () => {
    const other = await request(app.getHttpServer())
      .post("/v1/teachers")
      .set(asAdmin())
      .send({
        firstName: "Chidi",
        lastName: "Okeke",
        email: `${FIXTURE_PREFIX}nobank@example.com`,
        password,
      })
      .expect(201);

    // Employed, but nobody has recorded a bank account for them yet — which
    // is precisely the case this test exists for.
    await request(app.getHttpServer())
      .put(`/v1/staff/${other.body.id}`)
      .set(asAdmin())
      .send({ staffNumber: "STF-002", jobTitle: "Teacher" })
      .expect(200);

    await request(app.getHttpServer())
      .put(`/v1/payroll/staff/${other.body.id}/components`)
      .set(asAdmin())
      .send({ components: [{ label: "Basic", kind: "EARNING", basis: "FIXED", amount: 100_000, isBasic: true }] })
      .expect(200);

    const run = await request(app.getHttpServer())
      .post("/v1/payroll/runs")
      .set(asAdmin())
      .send({ year: 2027, month: 4 })
      .expect(201);
    await request(app.getHttpServer()).patch(`/v1/payroll/runs/${run.body.id}/approve`).set(asAdmin()).expect(200);

    const file = await request(app.getHttpServer())
      .post(`/v1/payroll/runs/${run.body.id}/transfer-file`)
      .set(asAdmin())
      .expect(201);

    // Somebody not being paid is exactly what a silent filter would hide.
    expect(file.headers["x-payroll-missing-count"]).toBe("1");
    expect(file.text).not.toContain("Chidi Okeke");
  });

  it("will not produce a bank file for an unapproved run", async () => {
    const draft = await request(app.getHttpServer())
      .post("/v1/payroll/runs")
      .set(asAdmin())
      .send({ year: 2027, month: 5 })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/v1/payroll/runs/${draft.body.id}/transfer-file`)
      .set(asAdmin())
      .expect(400);
  });

  it("records payment only after approval, and never performs it", async () => {
    const draft = await request(app.getHttpServer())
      .post("/v1/payroll/runs")
      .set(asAdmin())
      .send({ year: 2027, month: 6 })
      .expect(201);

    await request(app.getHttpServer()).patch(`/v1/payroll/runs/${draft.body.id}/paid`).set(asAdmin()).expect(400);

    await request(app.getHttpServer()).patch(`/v1/payroll/runs/${draft.body.id}/approve`).set(asAdmin()).expect(200);
    const paid = await request(app.getHttpServer())
      .patch(`/v1/payroll/runs/${draft.body.id}/paid`)
      .set(asAdmin())
      .expect(200);

    expect(paid.body.status).toBe("PAID");
    expect(paid.body.paidAt).not.toBeNull();
    expect(paid.body.paidByName).toBeTruthy();
  });

  it("renders a payslip PDF with the account number masked", async () => {
    const run = await request(app.getHttpServer()).get(`/v1/payroll/runs/${runId}`).set(asAdmin()).expect(200);

    const res = await request(app.getHttpServer())
      .get(`/v1/payroll/payslips/${run.body.payslips[0].id}/pdf`)
      .set(asAdmin())
      .responseType("blob")
      .expect(200);

    expect(res.headers["content-type"]).toContain("application/pdf");
    const pdf = res.body as Buffer;
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(800);
    expect(pdf.toString("latin1")).not.toContain(ACCOUNT_NUMBER);
  });

  it("keeps payroll away from teachers entirely", async () => {
    const asTeacher = { Authorization: `Bearer ${teacherToken}` };

    // Not even their own salary: a payroll list is a list of salaries.
    await request(app.getHttpServer()).get("/v1/payroll/runs").set(asTeacher).expect(403);
    await request(app.getHttpServer())
      .get(`/v1/payroll/staff/${teacherId}/components`)
      .set(asTeacher)
      .expect(403);
    await request(app.getHttpServer())
      .post("/v1/payroll/runs")
      .set(asTeacher)
      .send({ year: 2028, month: 1 })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/v1/payroll/runs/${runId}/transfer-file`)
      .set(asTeacher)
      .expect(403);
  });

  it("explains that a salary needs an employment record first", async () => {
    const fresh = await request(app.getHttpServer())
      .post("/v1/teachers")
      .set(asAdmin())
      .send({
        firstName: "Ngozi",
        lastName: "Eze",
        email: `${FIXTURE_PREFIX}norecord@example.com`,
        password,
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .put(`/v1/payroll/staff/${fresh.body.id}/components`)
      .set(asAdmin())
      .send({ components: [{ label: "Basic", kind: "EARNING", basis: "FIXED", amount: 1, isBasic: true }] })
      .expect(404);

    // Naming the person and the fix beats a bare "not found".
    expect(res.body.message).toMatch(/Ngozi Eze/);
    expect(res.body.message).toMatch(/employment record/i);
  });

  it("rejects a month outside 1-12", async () => {
    await request(app.getHttpServer())
      .post("/v1/payroll/runs")
      .set(asAdmin())
      .send({ year: 2027, month: 13 })
      .expect(400);
  });
});
