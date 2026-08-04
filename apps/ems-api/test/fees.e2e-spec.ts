import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Client as PgClient } from "pg";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { ControlPrismaService } from "../src/control-db/control-prisma.service";

const FIXTURE_PREFIX = "e2e-fees-";

describe("Fees (e2e)", () => {
  let app: INestApplication;
  let controlPrisma: ControlPrismaService;
  let adminToken: string;
  let teacherToken: string;
  let guardianAToken: string;
  let guardianBToken: string;
  let classId: string;
  let studentA: string;
  let studentB: string;
  let structureId: string;

  const platformEmail = `${FIXTURE_PREFIX}platform-${Date.now()}@wisdomcampus.example`;
  const password = "Sup3rSecret!Pass";
  const school = { slug: `${FIXTURE_PREFIX}${Date.now()}`, adminEmail: `${FIXTURE_PREFIX}admin@example.com` };
  const teacherEmail = `${FIXTURE_PREFIX}teacher@example.com`;
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
      .send({ name: "Grade 6A", academicYear: "2026-2027" })
      .expect(201);
    classId = klass.body.id;

    await request(app.getHttpServer())
      .post("/v1/teachers")
      .set(asAdmin())
      .send({ firstName: "Tunde", lastName: "Teacher", email: teacherEmail, password })
      .expect(201);

    // Two students in two unrelated families, so a scoping mistake has
    // something real to leak.
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

    teacherToken = await login(teacherEmail);
    guardianAToken = await login(guardianAEmail);
    guardianBToken = await login(guardianBEmail);
    // 180s for the same reason as the attendance suite: this fixture builds a
    // school, a class, a teacher, two students, two enrollments, two
    // guardians and four argon2 logins.
  }, 180000);

  afterAll(async () => {
    if (controlPrisma) await purgeFixtures().catch(() => undefined);
    if (app) await app.close();
  }, 180000);

  it("seeds finance settings at provisioning rather than lazily", async () => {
    const res = await request(app.getHttpServer()).get("/v1/fees/settings").set(asAdmin()).expect(200);
    expect(res.body.currency).toBe("NGN");
    expect(res.body.invoiceCounter).toBe(0);
  });

  it("creates a fee structure priced in minor units", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/fees/structures")
      .set(asAdmin())
      .send({
        name: "Term 1 Fees",
        academicYear: "2026-2027",
        term: "Term 1",
        classId,
        items: [
          { label: "Tuition", amountCents: 25000000 },
          { label: "Books", amountCents: 750050 },
        ],
      })
      .expect(201);

    structureId = res.body.id;
    expect(res.body.items).toHaveLength(2);
  });

  it("refuses a fractional amount rather than rounding it", async () => {
    await request(app.getHttpServer())
      .post("/v1/fees/structures")
      .set(asAdmin())
      .send({
        name: "Bad Fees",
        academicYear: "2026-2027",
        term: "Term 1",
        items: [{ label: "Tuition", amountCents: 25000.5 }],
      })
      .expect(400);
  });

  it("raises one invoice per enrolled student", async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/fees/structures/${structureId}/invoices`)
      .set(asAdmin())
      .send({ dueDate: "2026-11-30" })
      .expect(201);

    expect(res.body).toMatchObject({ eligibleStudents: 2, invoicesCreated: 2, duplicatesSkipped: 0 });
  });

  it("never double-charges a family when generation is run twice", async () => {
    // The guard is the unique index, not a pre-flight check — a second run
    // must be a no-op rather than a second bill.
    const res = await request(app.getHttpServer())
      .post(`/v1/fees/structures/${structureId}/invoices`)
      .set(asAdmin())
      .send({})
      .expect(201);

    expect(res.body).toMatchObject({ eligibleStudents: 2, invoicesCreated: 0, duplicatesSkipped: 2 });

    const list = await request(app.getHttpServer()).get("/v1/fees/invoices").set(asAdmin()).expect(200);
    expect(list.body.invoices).toHaveLength(2);
  });

  it("invoices sum to their lines and carry sequential numbers", async () => {
    const list = await request(app.getHttpServer()).get("/v1/fees/invoices").set(asAdmin()).expect(200);
    for (const invoice of list.body.invoices) {
      const lineSum = invoice.lines.reduce((sum: number, line: { amountCents: number }) => sum + line.amountCents, 0);
      expect(lineSum).toBe(invoice.totalCents);
      expect(invoice.totalCents).toBe(25750050);
      expect(invoice.invoiceNumber).toMatch(/^FEE-\d{6}$/);
      expect(invoice.status).toBe("ISSUED");
      expect(invoice.balanceCents).toBe(25750050);
    }
    expect(list.body.summary).toMatchObject({ invoiced: 51500100, collected: 0, outstanding: 51500100 });
  });

  it("records a part payment and moves the invoice to PARTIALLY_PAID", async () => {
    const list = await request(app.getHttpServer())
      .get(`/v1/fees/invoices?studentProfileId=${studentA}`)
      .set(asAdmin())
      .expect(200);
    const invoiceId = list.body.invoices[0].id;

    const res = await request(app.getHttpServer())
      .post(`/v1/fees/invoices/${invoiceId}/payments`)
      .set(asAdmin())
      .send({ amountCents: 10000000, method: "BANK_TRANSFER", reference: "TRF-001" })
      .expect(201);

    expect(res.body.status).toBe("PARTIALLY_PAID");
    expect(res.body.paidCents).toBe(10000000);
    expect(res.body.balanceCents).toBe(15750050);
    // Attributed to a person, not just an id.
    expect(res.body.payments[0].recordedByName).toContain("Admin");
  });

  it("refuses a replayed payment reference", async () => {
    // A gateway webhook that fires twice, or a double-clicked form, must not
    // credit a family twice. The unique index refuses it and nothing is
    // written — the balance below proves the transaction rolled back.
    const list = await request(app.getHttpServer())
      .get(`/v1/fees/invoices?studentProfileId=${studentA}`)
      .set(asAdmin())
      .expect(200);
    const invoice = list.body.invoices[0];

    await request(app.getHttpServer())
      .post(`/v1/fees/invoices/${invoice.id}/payments`)
      .set(asAdmin())
      .send({ amountCents: 10000000, method: "BANK_TRANSFER", reference: "TRF-001" })
      .expect(409);

    const after = await request(app.getHttpServer())
      .get(`/v1/fees/invoices/${invoice.id}`)
      .set(asAdmin())
      .expect(200);
    expect(after.body.paidCents).toBe(10000000);
    expect(after.body.payments).toHaveLength(1);
  });

  it("refuses a payment larger than the outstanding balance", async () => {
    const list = await request(app.getHttpServer())
      .get(`/v1/fees/invoices?studentProfileId=${studentA}`)
      .set(asAdmin())
      .expect(200);
    const invoice = list.body.invoices[0];

    await request(app.getHttpServer())
      .post(`/v1/fees/invoices/${invoice.id}/payments`)
      .set(asAdmin())
      .send({ amountCents: 99000000, method: "CASH" })
      .expect(400);
  });

  it("settles an invoice exactly, with two cash payments carrying no reference", async () => {
    // Both payments have a null reference. Postgres treats those as
    // distinct, which is why cash is not accidentally constrained to one
    // payment per invoice.
    const list = await request(app.getHttpServer())
      .get(`/v1/fees/invoices?studentProfileId=${studentA}`)
      .set(asAdmin())
      .expect(200);
    const invoice = list.body.invoices[0];

    await request(app.getHttpServer())
      .post(`/v1/fees/invoices/${invoice.id}/payments`)
      .set(asAdmin())
      .send({ amountCents: 15000000, method: "CASH" })
      .expect(201);

    const final = await request(app.getHttpServer())
      .post(`/v1/fees/invoices/${invoice.id}/payments`)
      .set(asAdmin())
      .send({ amountCents: 750050, method: "CASH" })
      .expect(201);

    expect(final.body.status).toBe("PAID");
    expect(final.body.balanceCents).toBe(0);
    expect(final.body.payments).toHaveLength(3);
  });

  it("refuses any further payment once settled", async () => {
    const list = await request(app.getHttpServer())
      .get(`/v1/fees/invoices?studentProfileId=${studentA}`)
      .set(asAdmin())
      .expect(200);
    await request(app.getHttpServer())
      .post(`/v1/fees/invoices/${list.body.invoices[0].id}/payments`)
      .set(asAdmin())
      .send({ amountCents: 1, method: "CASH" })
      .expect(400);
  });

  it("never lets a guardian see another family's invoice", async () => {
    const mine = await request(app.getHttpServer())
      .get("/v1/fees/invoices")
      .set("Authorization", `Bearer ${guardianAToken}`)
      .expect(200);

    expect(mine.body.invoices).toHaveLength(1);
    expect(mine.body.invoices[0].studentProfileId).toBe(studentA);

    const theirs = await request(app.getHttpServer())
      .get("/v1/fees/invoices")
      .set("Authorization", `Bearer ${guardianBToken}`)
      .expect(200);
    expect(theirs.body.invoices[0].studentProfileId).toBe(studentB);
  });

  it("cannot be widened by passing someone else's student id as a filter", async () => {
    // The filter narrows; it must never widen. A guardian asking for the
    // other family's student gets an empty list, not their invoices.
    const res = await request(app.getHttpServer())
      .get(`/v1/fees/invoices?studentProfileId=${studentB}`)
      .set("Authorization", `Bearer ${guardianAToken}`)
      .expect(200);
    expect(res.body.invoices).toHaveLength(0);
  });

  it("404s a guardian fetching another family's invoice directly", async () => {
    const theirs = await request(app.getHttpServer())
      .get("/v1/fees/invoices")
      .set("Authorization", `Bearer ${guardianBToken}`)
      .expect(200);
    const otherInvoiceId = theirs.body.invoices[0].id;

    // 404 not 403 — "it exists but isn't yours" is itself a leak.
    await request(app.getHttpServer())
      .get(`/v1/fees/invoices/${otherInvoiceId}`)
      .set("Authorization", `Bearer ${guardianAToken}`)
      .expect(404);
  });

  it("refuses finance operations by a teacher", async () => {
    const list = await request(app.getHttpServer()).get("/v1/fees/invoices").set(asAdmin()).expect(200);
    const invoiceId = list.body.invoices[0].id;

    await request(app.getHttpServer()).get("/v1/fees/settings").set("Authorization", `Bearer ${teacherToken}`).expect(403);
    await request(app.getHttpServer())
      .post(`/v1/fees/invoices/${invoiceId}/payments`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ amountCents: 1000, method: "CASH" })
      .expect(403);
    await request(app.getHttpServer())
      .get("/v1/fees/structures")
      .set("Authorization", `Bearer ${teacherToken}`)
      .expect(403);
  });

  it("refuses a guardian recording their own payment", async () => {
    const mine = await request(app.getHttpServer())
      .get("/v1/fees/invoices")
      .set("Authorization", `Bearer ${guardianAToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/v1/fees/invoices/${mine.body.invoices[0].id}/payments`)
      .set("Authorization", `Bearer ${guardianAToken}`)
      .send({ amountCents: 5000, method: "CASH" })
      .expect(403);
  });

  it("raises an ad-hoc invoice alongside the structure invoice for the same student", async () => {
    // The null feeStructureId is load-bearing: distinct NULLs mean the
    // unique index does not treat this as a duplicate of the term invoice.
    const res = await request(app.getHttpServer())
      .post("/v1/fees/invoices")
      .set(asAdmin())
      .send({
        studentProfileId: studentA,
        academicYear: "2026-2027",
        term: "Term 1",
        lines: [{ label: "Replacement textbook", amountCents: 350000 }],
      })
      .expect(201);

    expect(res.body.totalCents).toBe(350000);
    expect(res.body.feeStructureId).toBeNull();

    const list = await request(app.getHttpServer())
      .get(`/v1/fees/invoices?studentProfileId=${studentA}`)
      .set(asAdmin())
      .expect(200);
    expect(list.body.invoices).toHaveLength(2);
  });

  it("voids an unpaid invoice and excludes it from the summary", async () => {
    const before = await request(app.getHttpServer()).get("/v1/fees/summary").set(asAdmin()).expect(200);

    const list = await request(app.getHttpServer())
      .get(`/v1/fees/invoices?studentProfileId=${studentA}`)
      .set(asAdmin())
      .expect(200);
    const adHoc = list.body.invoices.find((i: { feeStructureId: string | null }) => i.feeStructureId === null);

    const voided = await request(app.getHttpServer())
      .post(`/v1/fees/invoices/${adHoc.id}/void`)
      .set(asAdmin())
      .send({ reason: "Book was returned" })
      .expect(201);
    expect(voided.body.status).toBe("VOID");

    const after = await request(app.getHttpServer()).get("/v1/fees/summary").set(asAdmin()).expect(200);
    expect(after.body.invoiced).toBe(before.body.invoiced - 350000);
  });

  it("refuses to void an invoice that has payments against it", async () => {
    const list = await request(app.getHttpServer())
      .get(`/v1/fees/invoices?studentProfileId=${studentA}`)
      .set(asAdmin())
      .expect(200);
    const paid = list.body.invoices.find((i: { status: string }) => i.status === "PAID");

    await request(app.getHttpServer())
      .post(`/v1/fees/invoices/${paid.id}/void`)
      .set(asAdmin())
      .send({ reason: "changed my mind" })
      .expect(409);
  });

  it("locks the currency once invoices exist", async () => {
    // Every stored amount is in the current currency's minor units, so
    // switching would silently reinterpret the whole ledger.
    await request(app.getHttpServer())
      .patch("/v1/fees/settings")
      .set(asAdmin())
      .send({ currency: "USD" })
      .expect(409);
  });

  it("reports collected and outstanding separately", async () => {
    const res = await request(app.getHttpServer()).get("/v1/fees/summary").set(asAdmin()).expect(200);
    // Student A settled in full; student B has not paid anything.
    expect(res.body.collected).toBe(25750050);
    expect(res.body.outstanding).toBe(25750050);
    expect(res.body.currency).toBe("NGN");
  });
});
