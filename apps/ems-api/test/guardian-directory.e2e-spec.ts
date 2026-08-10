import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Client as PgClient } from "pg";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { ControlPrismaService } from "../src/control-db/control-prisma.service";

const FIXTURE_PREFIX = "e2e-guardiandir-";

/**
 * The school's list of families.
 *
 * The things worth proving: staff can read it, families and children cannot,
 * and a parent of several children appears once rather than once per child.
 */
describe("Guardian directory (e2e)", () => {
  let app: INestApplication;
  let controlPrisma: ControlPrismaService;

  let adminToken: string;
  let teacherToken: string;
  let guardianToken: string;
  let studentToken: string;

  const platformEmail = `${FIXTURE_PREFIX}platform-${Date.now()}@wisdomcampus.example`;
  const password = "Sup3rSecret!Pass";
  const school = { slug: `${FIXTURE_PREFIX}${Date.now()}`, adminEmail: `${FIXTURE_PREFIX}admin@example.com` };

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function login(email: string) {
    const res = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ schoolSlug: school.slug, email, password })
      .expect(200);
    return res.body.accessToken as string;
  }

  async function createStudent(firstName: string) {
    // Lowercased: login normalises the address, so a capital in a fixture
    // creates an account that cannot sign in.
    const email = `${FIXTURE_PREFIX}${firstName.toLowerCase()}-${Date.now()}@example.com`;
    const res = await request(app.getHttpServer())
      .post("/v1/students")
      .set(auth(adminToken))
      .send({ firstName, lastName: "Child", email, password })
      .expect(201);
    return { id: res.body.id as string, email };
  }

  async function purgeFixtures() {
    const schools = await controlPrisma.school.findMany({ where: { slug: { startsWith: FIXTURE_PREFIX } } });
    for (const s of schools) {
      const admin = new PgClient({ connectionString: process.env.POSTGRES_ADMIN_URL });
      await admin.connect();
      await admin.query(`DROP DATABASE IF EXISTS "${s.databaseName}" WITH (FORCE)`).catch(() => undefined);
      await admin.end();
    }
    await controlPrisma.provisioningAttempt.deleteMany({
      where: { school: { slug: { startsWith: FIXTURE_PREFIX } } },
    });
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
      .set(auth(platformLogin.body.accessToken))
      .send({
        name: school.slug,
        slug: school.slug,
        adminEmail: school.adminEmail,
        adminPassword: password,
        adminFirstName: "Admin",
        adminLastName: "One",
      })
      .expect(201);

    adminToken = await login(school.adminEmail);

    const teacherEmail = `${FIXTURE_PREFIX}teacher-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post("/v1/teachers")
      .set(auth(adminToken))
      .send({ firstName: "Ada", lastName: "Teacher", email: teacherEmail, password })
      .expect(201);
    teacherToken = await login(teacherEmail);

    // One parent, two children — the case the directory exists to collapse.
    const first = await createStudent("Tunde");
    const second = await createStudent("Bimpe");
    studentToken = await login(first.email);

    const guardianEmail = `${FIXTURE_PREFIX}parent-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post("/v1/guardians")
      .set(auth(adminToken))
      .send({
        studentProfileId: first.id,
        relationship: "Mother",
        firstName: "Amina",
        lastName: "Bello",
        email: guardianEmail,
        password,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post("/v1/guardians")
      .set(auth(adminToken))
      .send({ studentProfileId: second.id, relationship: "Mother", email: guardianEmail })
      .expect(201);

    guardianToken = await login(guardianEmail);
  }, 180000);

  afterAll(async () => {
    if (controlPrisma) await purgeFixtures().catch(() => undefined);
    if (app) await app.close();
  }, 180000);

  it("gives an admin one entry per parent, with every child attached", async () => {
    const res = await request(app.getHttpServer())
      .get("/v1/guardians")
      .set(auth(adminToken))
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].firstName).toBe("Amina");
    expect(res.body[0].children.map((child: { name: string }) => child.name).sort()).toEqual([
      "Bimpe Child",
      "Tunde Child",
    ]);
  });

  it("lets a teacher read it too", async () => {
    // Looking a parent up to telephone them is ordinary teaching work, unlike
    // linking or unlinking a guardian, which stays with the office.
    await request(app.getHttpServer()).get("/v1/guardians").set(auth(teacherToken)).expect(200);
  });

  it("NEVER lets a parent read the school's list of other families", async () => {
    await request(app.getHttpServer()).get("/v1/guardians").set(auth(guardianToken)).expect(403);
  });

  it("NEVER lets a student read it", async () => {
    await request(app.getHttpServer()).get("/v1/guardians").set(auth(studentToken)).expect(403);
  });

  it("still refuses a teacher the power to link a guardian", async () => {
    // The read being widened must not have widened the writes with it.
    await request(app.getHttpServer())
      .post("/v1/guardians")
      .set(auth(teacherToken))
      .send({ studentProfileId: "whatever", relationship: "Mother", email: "x@example.com" })
      .expect(403);
  });
});
