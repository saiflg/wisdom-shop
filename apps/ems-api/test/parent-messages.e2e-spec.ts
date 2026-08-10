import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Client as PgClient } from "pg";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { ControlPrismaService } from "../src/control-db/control-prisma.service";

const FIXTURE_PREFIX = "e2e-parentmsg-";

/**
 * A family talking to the school about one child.
 *
 * The three things worth proving: another family cannot see it, the child
 * cannot see it, and a withdrawn message is not readable by anybody
 * afterwards.
 */
describe("Parent and school messages (e2e)", () => {
  let app: INestApplication;
  let controlPrisma: ControlPrismaService;

  let adminToken: string;
  let teacherToken: string;
  let parentAToken: string;
  let parentBToken: string;
  let studentAToken: string;
  let childAProfileId: string;
  let childBProfileId: string;

  const platformEmail = `${FIXTURE_PREFIX}platform-${Date.now()}@wisdomcampus.example`;
  const password = "Sup3rSecret!Pass";
  const school = { slug: `${FIXTURE_PREFIX}${Date.now()}`, adminEmail: `${FIXTURE_PREFIX}admin@example.com` };

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** Messages are rate limited per person per thread, and these tests are faster than any parent. */
  async function post(token: string, studentProfileId: string, body: string, expected = 201) {
    await new Promise((resolve) => setTimeout(resolve, 1600));
    return request(app.getHttpServer())
      .post(`/v1/parent-messages/${studentProfileId}`)
      .set(auth(token))
      .send({ body })
      .expect(expected);
  }

  async function login(email: string) {
    const res = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ schoolSlug: school.slug, email, password })
      .expect(200);
    return res.body.accessToken as string;
  }

  async function createFamily(childName: string) {
    // Lowercased: login normalises the address, so a fixture with a capital
    // in it creates an account that cannot sign in.
    const studentEmail = `${FIXTURE_PREFIX}${childName.toLowerCase()}-${Date.now()}@example.com`;
    const student = await request(app.getHttpServer())
      .post("/v1/students")
      .set(auth(adminToken))
      .send({ firstName: childName, lastName: "Child", email: studentEmail, password })
      .expect(201);

    const guardianEmail = `${FIXTURE_PREFIX}parent-${childName.toLowerCase()}-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post("/v1/guardians")
      .set(auth(adminToken))
      .send({
        studentProfileId: student.body.id,
        relationship: "Mother",
        firstName: "Parent",
        lastName: `Of ${childName}`,
        email: guardianEmail,
        password,
      })
      .expect(201);

    return {
      studentProfileId: student.body.id as string,
      studentToken: await login(studentEmail),
      guardianToken: await login(guardianEmail),
    };
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

    const familyA = await createFamily("Ada");
    const familyB = await createFamily("Bimpe");
    childAProfileId = familyA.studentProfileId;
    childBProfileId = familyB.studentProfileId;
    parentAToken = familyA.guardianToken;
    parentBToken = familyB.guardianToken;
    studentAToken = familyA.studentToken;
  }, 180000);

  afterAll(async () => {
    if (controlPrisma) await purgeFixtures().catch(() => undefined);
    if (app) await app.close();
  }, 180000);

  describe("a parent writing to the school", () => {
    it("can open a conversation about their own child and be answered", async () => {
      await post(parentAToken, childAProfileId, "Ada was unwell yesterday, please excuse her absence");

      const asTeacher = await request(app.getHttpServer())
        .get(`/v1/parent-messages/${childAProfileId}`)
        .set(auth(teacherToken))
        .expect(200);
      expect(asTeacher.body.messages.at(-1).body).toContain("unwell");
      expect(asTeacher.body.youAre).toBe("SCHOOL");

      await post(teacherToken, childAProfileId, "Thank you for letting us know");

      const asParent = await request(app.getHttpServer())
        .get(`/v1/parent-messages/${childAProfileId}`)
        .set(auth(parentAToken))
        .expect(200);
      expect(asParent.body.messages).toHaveLength(2);
      expect(asParent.body.youAre).toBe("FAMILY");
    });

    it("NEVER lets one family read another family's conversation", async () => {
      // The invariant. 404 rather than 403, so probing ids teaches nothing.
      await request(app.getHttpServer())
        .get(`/v1/parent-messages/${childBProfileId}`)
        .set(auth(parentAToken))
        .expect(404);

      await post(parentAToken, childBProfileId, "let me in", 404);
    });

    it("NEVER lets the child read what their parent wrote about them", async () => {
      // A parent raising a worry is not writing to the child, and a thread
      // the child can read is a thread the parent will not use honestly.
      await request(app.getHttpServer())
        .get(`/v1/parent-messages/${childAProfileId}`)
        .set(auth(studentAToken))
        .expect(404);

      await post(studentAToken, childAProfileId, "hello", 404);
    });

    it("keeps a student out of the thread list entirely", async () => {
      const res = await request(app.getHttpServer())
        .get("/v1/parent-messages")
        .set(auth(studentAToken))
        .expect(200);
      expect(res.body).toEqual([]);
    });
  });

  describe("the school's inbox", () => {
    it("shows staff every family, with the ones awaiting a reply first", async () => {
      await post(parentBToken, childBProfileId, "Could we discuss Bimpe's reading?");

      const res = await request(app.getHttpServer())
        .get("/v1/parent-messages")
        .set(auth(adminToken))
        .expect(200);

      const names = res.body.map((thread: { studentName: string }) => thread.studentName);
      expect(names).toEqual(expect.arrayContaining(["Ada Child", "Bimpe Child"]));

      // Bimpe's family spoke last and is unanswered, so it sorts above Ada's,
      // which the teacher already replied to.
      expect(res.body[0].studentName).toBe("Bimpe Child");
      expect(res.body[0].awaitingSchool).toBe(true);
    });

    it("shows a parent only their own child", async () => {
      const res = await request(app.getHttpServer())
        .get("/v1/parent-messages")
        .set(auth(parentAToken))
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].studentName).toBe("Ada Child");
    });
  });

  describe("withdrawing", () => {
    let messageId: string;

    it("lets the author take a message back", async () => {
      const posted = await post(parentAToken, childAProfileId, "something said in temper");
      messageId = posted.body.id;

      await request(app.getHttpServer())
        .delete(`/v1/parent-messages/messages/${messageId}`)
        .set(auth(parentAToken))
        .expect(200);
    });

    it("leaves a marker rather than vanishing", async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/parent-messages/${childAProfileId}`)
        .set(auth(teacherToken))
        .expect(200);
      const withdrawn = res.body.messages.find((m: { id: string }) => m.id === messageId);
      expect(withdrawn.deleted).toBe(true);
      expect(withdrawn.body).toBe("This message was withdrawn.");
    });

    it("does NOT let even staff read the original back", async () => {
      // Deliberately unlike the class chat: that is children being
      // supervised, this is two adults.
      const res = await request(app.getHttpServer())
        .get(`/v1/parent-messages/${childAProfileId}`)
        .set(auth(adminToken))
        .expect(200);
      expect(JSON.stringify(res.body)).not.toContain("temper");
    });

    it("refuses a parent withdrawing the school's reply", async () => {
      const thread = await request(app.getHttpServer())
        .get(`/v1/parent-messages/${childAProfileId}`)
        .set(auth(parentAToken))
        .expect(200);
      const schoolMessage = thread.body.messages.find((m: { side: string }) => m.side === "SCHOOL");

      await request(app.getHttpServer())
        .delete(`/v1/parent-messages/messages/${schoolMessage.id}`)
        .set(auth(parentAToken))
        .expect(403);
    });
  });

  describe("limits", () => {
    it("refuses an empty message", async () => {
      await post(parentAToken, childAProfileId, "   ", 400);
    });

    it("slows a flood down in words a person can act on", async () => {
      await post(parentAToken, childAProfileId, "first");
      const res = await request(app.getHttpServer())
        .post(`/v1/parent-messages/${childAProfileId}`)
        .set(auth(parentAToken))
        .send({ body: "second, immediately" })
        .expect(400);
      expect(res.body.message).toMatch(/slow down/i);
    });
  });
});
