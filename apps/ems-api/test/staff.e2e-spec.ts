import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Client as PgClient } from "pg";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { ControlPrismaService } from "../src/control-db/control-prisma.service";

const FIXTURE_PREFIX = "e2e-staff-";
const ACCOUNT_NUMBER = "0123456789";

describe("Staff records and bank details (e2e)", () => {
  let app: INestApplication;
  let controlPrisma: ControlPrismaService;
  let adminToken: string;
  let teacherToken: string;
  let teacherId: string;

  const platformEmail = `${FIXTURE_PREFIX}platform-${Date.now()}@wisdomcampus.example`;
  const password = "Sup3rSecret!Pass";
  const school = { slug: `${FIXTURE_PREFIX}${Date.now()}`, adminEmail: `${FIXTURE_PREFIX}admin@example.com` };
  const teacherEmail = `${FIXTURE_PREFIX}teacher@example.com`;

  const asAdmin = () => ({ Authorization: `Bearer ${adminToken}` });

  /**
   * Teachers need a login, so unlike students they cannot be created from a
   * name alone — every one gets a unique address.
   */
  async function createTeacher(firstName: string, lastName: string) {
    const res = await request(app.getHttpServer())
      .post("/v1/teachers")
      .set(asAdmin())
      .send({
        firstName,
        lastName,
        email: `${FIXTURE_PREFIX}${firstName.toLowerCase()}-${Date.now()}@example.com`,
        password,
      })
      .expect(201);
    return res.body.id as string;
  }

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

    const teacher = await request(app.getHttpServer())
      .post("/v1/teachers")
      .set(asAdmin())
      .send({ firstName: "Ade", lastName: "Balogun", email: teacherEmail, password })
      .expect(201);
    teacherId = teacher.body.id;

    teacherToken = await login(teacherEmail);
  }, 180000);

  afterAll(async () => {
    if (controlPrisma) await purgeFixtures().catch(() => undefined);
    if (app) await app.close();
  }, 180000);

  it("stores an employment record with bank details", async () => {
    const res = await request(app.getHttpServer())
      .put(`/v1/staff/${teacherId}`)
      .set(asAdmin())
      .send({
        staffNumber: "STF-001",
        jobTitle: "Head of Mathematics",
        employmentType: "FULL_TIME",
        startDate: "2026-09-01",
        bankName: "First Bank",
        bankCode: "011",
        accountName: "Ade Balogun",
        accountNumber: ACCOUNT_NUMBER,
      })
      .expect(200);

    expect(res.body.staffNumber).toBe("STF-001");
    expect(res.body.bank.accountNumberMasked).toBe("••••6789");
    expect(res.body.bank.hasAccountNumber).toBe(true);
  });

  it("NEVER returns the full account number from an ordinary read", async () => {
    // The invariant this module exists for. Checked against the whole
    // serialised response, not one field, because a leak is a leak wherever
    // it appears.
    const one = await request(app.getHttpServer()).get(`/v1/staff/${teacherId}`).set(asAdmin()).expect(200);
    expect(JSON.stringify(one.body)).not.toContain(ACCOUNT_NUMBER);

    const list = await request(app.getHttpServer()).get("/v1/staff").set(asAdmin()).expect(200);
    expect(JSON.stringify(list.body)).not.toContain(ACCOUNT_NUMBER);
  });

  it("never leaks the stored ciphertext either", async () => {
    // Returning the encrypted blob would be a slower leak, not a safe one.
    const res = await request(app.getHttpServer()).get(`/v1/staff/${teacherId}`).set(asAdmin()).expect(200);
    expect(JSON.stringify(res.body)).not.toContain("accountNumberEncrypted");
  });

  it("stores the account number encrypted in the database, not in plain text", async () => {
    // Checked against the actual column rather than the API response.
    // Anything else would only prove the API hides it, not that a database
    // dump or a stray query would.
    const record = await controlPrisma.school.findFirstOrThrow({ where: { slug: school.slug } });
    const tenant = new PgClient({
      connectionString: (process.env.POSTGRES_ADMIN_URL as string).replace(/\/[^/]*$/, `/${record.databaseName}`),
    });
    await tenant.connect();
    try {
      const { rows } = await tenant.query<{ accountNumberEncrypted: string | null }>(
        'SELECT "accountNumberEncrypted" FROM staff_profiles WHERE "accountNumberEncrypted" IS NOT NULL',
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.accountNumberEncrypted).not.toContain(ACCOUNT_NUMBER);
        // AES-256-GCM output, not the plaintext with a wrapper around it.
        expect(row.accountNumberEncrypted).not.toBe(ACCOUNT_NUMBER);
      }
    } finally {
      await tenant.end();
    }
  });

  it("hides staff records from a teacher entirely", async () => {
    // A teacher has no business reading colleagues' employment records.
    await request(app.getHttpServer())
      .get("/v1/staff")
      .set("Authorization", `Bearer ${teacherToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(`/v1/staff/${teacherId}`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .expect(403);
  });

  it("refuses a teacher reading even their own full account number", async () => {
    await request(app.getHttpServer())
      .post(`/v1/staff/${teacherId}/account-number`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ reason: "curiosity" })
      .expect(403);
  });

  it("reveals the full number to an administrator who gives a reason", async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/staff/${teacherId}/account-number`)
      .set(asAdmin())
      .send({ reason: "Preparing the October payroll run" })
      .expect(201);

    expect(res.body.accountNumber).toBe(ACCOUNT_NUMBER);
    expect(res.body.accountName).toBe("Ade Balogun");
  });

  it("refuses to reveal without a reason", async () => {
    // The log has to say why, not merely that.
    await request(app.getHttpServer())
      .post(`/v1/staff/${teacherId}/account-number`)
      .set(asAdmin())
      .send({})
      .expect(400);
  });

  it("records every reveal, attributed and explained", async () => {
    const res = await request(app.getHttpServer()).get("/v1/staff/access-log").set(asAdmin()).expect(200);

    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toMatchObject({
      staffName: "Ade Balogun",
      reason: "Preparing the October payroll run",
    });
    expect(res.body[0].actorName).toContain("Admin");
    // The log records that a number was read, never the number itself.
    expect(JSON.stringify(res.body)).not.toContain(ACCOUNT_NUMBER);
  });

  it("requires the account name whenever a number is supplied", async () => {
    const other = await createTeacher("Bola", "Nwosu");

    await request(app.getHttpServer())
      .put(`/v1/staff/${other}`)
      .set(asAdmin())
      .send({ accountNumber: "9876543210" })
      .expect(400);
  });

  it("refuses an account number that is not digits", async () => {
    await request(app.getHttpServer())
      .put(`/v1/staff/${teacherId}`)
      .set(asAdmin())
      .send({ accountName: "Ade Balogun", accountNumber: "01234O6789" })
      .expect(400);
  });

  it("refuses a duplicate staff number", async () => {
    const other = await createTeacher("Chidi", "Okafor");

    await request(app.getHttpServer())
      .put(`/v1/staff/${other}`)
      .set(asAdmin())
      .send({ staffNumber: "STF-001" })
      .expect(409);
  });

  it("allows many staff with no staff number at all", async () => {
    // NULLs are distinct, so an unnumbered roster is not a conflict.
    const a = await createTeacher("Ngozi", "Eze");
    const b = await createTeacher("Tunde", "Adeyemi");

    await request(app.getHttpServer()).put(`/v1/staff/${a}`).set(asAdmin()).send({ jobTitle: "Librarian" }).expect(200);
    await request(app.getHttpServer()).put(`/v1/staff/${b}`).set(asAdmin()).send({ jobTitle: "Bursar" }).expect(200);
  });

  it("leaves the account number alone when the field is omitted", async () => {
    // Editing a job title must not silently wipe someone's bank details.
    await request(app.getHttpServer())
      .put(`/v1/staff/${teacherId}`)
      .set(asAdmin())
      .send({ staffNumber: "STF-001", jobTitle: "Deputy Head", accountName: "Ade Balogun" })
      .expect(200);

    const res = await request(app.getHttpServer())
      .post(`/v1/staff/${teacherId}/account-number`)
      .set(asAdmin())
      .send({ reason: "confirming it survived an unrelated edit" })
      .expect(201);
    expect(res.body.accountNumber).toBe(ACCOUNT_NUMBER);
  });

  it("clears the account number when an empty string is sent", async () => {
    // Distinct from omitting it — there has to be a way to remove details.
    await request(app.getHttpServer())
      .put(`/v1/staff/${teacherId}`)
      .set(asAdmin())
      .send({ accountNumber: "" })
      .expect(200);

    const res = await request(app.getHttpServer()).get(`/v1/staff/${teacherId}`).set(asAdmin()).expect(200);
    expect(res.body.bank.hasAccountNumber).toBe(false);
    expect(res.body.bank.accountNumberMasked).toBeNull();

    await request(app.getHttpServer())
      .post(`/v1/staff/${teacherId}/account-number`)
      .set(asAdmin())
      .send({ reason: "should find nothing" })
      .expect(404);
  });
});
