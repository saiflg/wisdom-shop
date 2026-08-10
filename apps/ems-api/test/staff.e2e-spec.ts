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

  describe("registration", () => {
    it("registers a non-teaching staff member with their employment record", async () => {
      const email = `${FIXTURE_PREFIX}bursar-${Date.now()}@example.com`;
      const res = await request(app.getHttpServer())
        .post("/v1/staff")
        .set(asAdmin())
        .send({
          email,
          password,
          firstName: "Halima",
          lastName: "Sani",
          role: "SCHOOL_ADMIN",
          jobTitle: "Bursar",
          employmentType: "FULL_TIME",
          startDate: "2026-09-01",
        })
        .expect(201);

      expect(res.body.jobTitle).toBe("Bursar");
      expect(res.body.roles).toEqual(["SCHOOL_ADMIN"]);
      // Registered with no bank details, which is a state the record must be
      // able to hold rather than a half-filled form.
      expect(res.body.bank.hasAccountNumber).toBe(false);

      // A staff login is only real if it can be used.
      await expect(login(email)).resolves.toEqual(expect.any(String));
    });

    it("never accepts bank details at registration", async () => {
      // Whitelist validation, so a field that looks plausible is still
      // refused rather than quietly dropped.
      await request(app.getHttpServer())
        .post("/v1/staff")
        .set(asAdmin())
        .send({
          email: `${FIXTURE_PREFIX}sneaky-${Date.now()}@example.com`,
          password,
          firstName: "Sneaky",
          lastName: "Field",
          role: "TEACHER",
          accountNumber: ACCOUNT_NUMBER,
        })
        .expect(400);
    });

    it("refuses to mint a student or guardian through the staff door", async () => {
      // Those accounts carry an enrollment or a family behind them. One made
      // here would have a login and none of that.
      for (const role of ["STUDENT", "GUARDIAN", "PLATFORM_ADMIN"]) {
        await request(app.getHttpServer())
          .post("/v1/staff")
          .set(asAdmin())
          .send({
            email: `${FIXTURE_PREFIX}role-${role}-${Date.now()}@example.com`,
            password,
            firstName: "Wrong",
            lastName: "Role",
            role,
          })
          .expect(400);
      }
    });

    it("refuses a weak password, the same as every other login here", async () => {
      await request(app.getHttpServer())
        .post("/v1/staff")
        .set(asAdmin())
        .send({
          email: `${FIXTURE_PREFIX}weak-${Date.now()}@example.com`,
          password: "password",
          firstName: "Weak",
          lastName: "Pass",
          role: "TEACHER",
        })
        .expect(400);
    });

    it("refuses an email that already has a login", async () => {
      await request(app.getHttpServer())
        .post("/v1/staff")
        .set(asAdmin())
        .send({ email: teacherEmail, password, firstName: "Second", lastName: "Ade", role: "TEACHER" })
        .expect(409);
    });

    it("leaves no orphan login behind when the staff number collides", async () => {
      // Both halves are one create. A rejected registration must not leave a
      // login nobody asked for, which would then block the retry as a
      // duplicate email.
      const email = `${FIXTURE_PREFIX}collide-${Date.now()}@example.com`;
      const body = {
        email,
        password,
        firstName: "Collide",
        lastName: "Number",
        role: "TEACHER" as const,
        staffNumber: "STF-DUP",
      };

      await request(app.getHttpServer()).post("/v1/staff").set(asAdmin()).send(body).expect(201);
      await request(app.getHttpServer())
        .post("/v1/staff")
        .set(asAdmin())
        .send({ ...body, email: `${FIXTURE_PREFIX}collide2-${Date.now()}@example.com` })
        .expect(409);

      const list = await request(app.getHttpServer()).get("/v1/staff").set(asAdmin()).expect(200);
      expect(list.body.filter((m: { staffNumber: string | null }) => m.staffNumber === "STF-DUP")).toHaveLength(1);
      expect(list.body.filter((m: { lastName: string }) => m.lastName === "Number")).toHaveLength(1);
    });

    it("does not let a teacher register colleagues", async () => {
      await request(app.getHttpServer())
        .post("/v1/staff")
        .set("Authorization", `Bearer ${teacherToken}`)
        .send({
          email: `${FIXTURE_PREFIX}selfmade-${Date.now()}@example.com`,
          password,
          firstName: "Self",
          lastName: "Made",
          role: "SCHOOL_ADMIN",
        })
        .expect(403);
    });
  });

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
