import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Client as PgClient } from "pg";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { ControlPrismaService } from "../src/control-db/control-prisma.service";

const FIXTURE_PREFIX = "e2e-chat-";

/**
 * A class conversation is a room children are in. These tests are about who
 * can get into it, who can be heard in it, and what happens to something
 * somebody wishes they had not said.
 */
describe("Class chat (e2e)", () => {
  let app: INestApplication;
  let controlPrisma: ControlPrismaService;

  let adminToken: string;
  let teacherToken: string;
  let outsiderTeacherToken: string;
  let alfieToken: string;
  let bimpeToken: string;
  let outsiderStudentToken: string;

  let classId: string;
  let otherClassId: string;

  const platformEmail = `${FIXTURE_PREFIX}platform-${Date.now()}@wisdomcampus.example`;
  const password = "Sup3rSecret!Pass";
  const school = { slug: `${FIXTURE_PREFIX}${Date.now()}`, adminEmail: `${FIXTURE_PREFIX}admin@example.com` };

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  /**
   * Posts a message, pausing first.
   *
   * The rate limiter allows one message per author per 1.5s, and these tests
   * run far faster than any child types — without the pause the suite trips
   * its own safeguard and reports it as a broken chat. Waiting here rather
   * than loosening the limit: the limit is the feature.
   */
  async function postMessage(token: string, body: string, expected = 201) {
    await new Promise((resolve) => setTimeout(resolve, 1600));
    return request(app.getHttpServer())
      .post(`/v1/classes/${classId}/chat`)
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

  /** A student with a login, enrolled in a class. */
  async function createStudent(firstName: string, enrolInClassId: string) {
    const email = `${FIXTURE_PREFIX}${firstName.toLowerCase()}-${Date.now()}@example.com`;
    const student = await request(app.getHttpServer())
      .post("/v1/students")
      .set(auth(adminToken))
      .send({ firstName, lastName: "Learner", email, password })
      .expect(201);

    // POST /v1/students returns the StudentProfile itself, so `id` here is
    // the profile id and `userId` is the login.
    await request(app.getHttpServer())
      .post("/v1/enrollments")
      .set(auth(adminToken))
      .send({ studentProfileId: student.body.id, classId: enrolInClassId })
      .expect(201);

    return { id: student.body.userId as string, token: await login(email) };
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
      .set({ Authorization: `Bearer ${platformLogin.body.accessToken}` })
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
    const teacher = await request(app.getHttpServer())
      .post("/v1/teachers")
      .set(auth(adminToken))
      .send({ firstName: "Ada", lastName: "Teacher", email: teacherEmail, password })
      .expect(201);
    teacherToken = await login(teacherEmail);

    const outsiderEmail = `${FIXTURE_PREFIX}other-teacher-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post("/v1/teachers")
      .set(auth(adminToken))
      .send({ firstName: "Musa", lastName: "Elsewhere", email: outsiderEmail, password })
      .expect(201);
    outsiderTeacherToken = await login(outsiderEmail);

    const created = await request(app.getHttpServer())
      .post("/v1/classes")
      .set(auth(adminToken))
      .send({ name: "JSS 1A", academicYear: "2026-2027", homeroomTeacherId: teacher.body.id })
      .expect(201);
    classId = created.body.id;

    const other = await request(app.getHttpServer())
      .post("/v1/classes")
      .set(auth(adminToken))
      .send({ name: "JSS 1B", academicYear: "2026-2027" })
      .expect(201);
    otherClassId = other.body.id;

    ({ token: alfieToken } = await createStudent("Alfie", classId));
    ({ token: bimpeToken } = await createStudent("Bimpe", classId));
    ({ token: outsiderStudentToken } = await createStudent("Chidi", otherClassId));
  }, 180000);

  afterAll(async () => {
    if (controlPrisma) await purgeFixtures().catch(() => undefined);
    if (app) await app.close();
  }, 180000);

  describe("who is in the room", () => {
    it("shows a classmate the class list, their teacher and the school's leadership", async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/classes/${classId}/members`)
        .set(auth(alfieToken))
        .expect(200);

      expect(res.body.students.map((s: { name: string }) => s.name)).toEqual([
        "Alfie Learner",
        "Bimpe Learner",
      ]);
      expect(res.body.classTeacher.name).toBe("Ada Teacher");
      expect(Array.isArray(res.body.leadership)).toBe(true);
    });

    it("does NOT hand a class list out as a contact list", async () => {
      // Names, not addresses. Thirty children knowing who is in their class
      // is not the same as thirty children having each other's email.
      const res = await request(app.getHttpServer())
        .get(`/v1/classes/${classId}/members`)
        .set(auth(alfieToken))
        .expect(200);

      const serialised = JSON.stringify(res.body.students);
      expect(serialised).not.toContain("@example.com");
      expect(serialised).not.toContain("dateOfBirth");
    });

    it("REFUSES a student from another class", async () => {
      await request(app.getHttpServer())
        .get(`/v1/classes/${classId}/members`)
        .set(auth(outsiderStudentToken))
        .expect(403);
    });

    it("shows the roll number to staff and not to classmates", async () => {
      const staff = await request(app.getHttpServer())
        .get(`/v1/classes/${classId}/members`)
        .set(auth(adminToken))
        .expect(200);
      const child = await request(app.getHttpServer())
        .get(`/v1/classes/${classId}/members`)
        .set(auth(alfieToken))
        .expect(200);

      expect(staff.body.students[0]).toHaveProperty("studentCode");
      expect(child.body.students[0].studentCode).toBeNull();
    });
  });

  describe("talking to the class", () => {
    it("carries the notice telling students their teachers can read it", async () => {
      // Supervision a child knows about is a classroom; supervision they do
      // not know about is surveillance.
      const res = await request(app.getHttpServer())
        .get(`/v1/classes/${classId}/chat`)
        .set(auth(alfieToken))
        .expect(200);

      expect(res.body.notice).toMatch(/teacher/i);
      expect(res.body.notice).toMatch(/remove/i);
    });

    it("lets a classmate post and a classmate read", async () => {
      await postMessage(alfieToken, "Does anyone have the maths homework?");

      const res = await request(app.getHttpServer())
        .get(`/v1/classes/${classId}/chat`)
        .set(auth(bimpeToken))
        .expect(200);

      expect(res.body.messages.at(-1)).toMatchObject({
        body: "Does anyone have the maths homework?",
        authorName: "Alfie Learner",
        mine: false,
      });
    });

    it("NEVER lets a student read another class's conversation", async () => {
      await request(app.getHttpServer())
        .get(`/v1/classes/${classId}/chat`)
        .set(auth(outsiderStudentToken))
        .expect(403);

      await request(app.getHttpServer())
        .post(`/v1/classes/${classId}/chat`)
        .set(auth(outsiderStudentToken))
        .send({ body: "let me in" })
        .expect(403);
    });

    it("lets any teacher read it, including one who does not teach the class", async () => {
      // Moderation that requires being a member first arrives too late.
      await request(app.getHttpServer())
        .get(`/v1/classes/${classId}/chat`)
        .set(auth(outsiderTeacherToken))
        .expect(200);
    });

    it("lets an administrator read and NOT write", async () => {
      const read = await request(app.getHttpServer())
        .get(`/v1/classes/${classId}/chat`)
        .set(auth(adminToken))
        .expect(200);
      expect(read.body.canPost).toBe(false);

      await request(app.getHttpServer())
        .post(`/v1/classes/${classId}/chat`)
        .set(auth(adminToken))
        .send({ body: "from the office" })
        .expect(403);
    });

    it("refuses an empty message and one that is too long", async () => {
      await request(app.getHttpServer())
        .post(`/v1/classes/${classId}/chat`)
        .set(auth(bimpeToken))
        .send({ body: "    " })
        .expect(400);

      await request(app.getHttpServer())
        .post(`/v1/classes/${classId}/chat`)
        .set(auth(bimpeToken))
        .send({ body: "x".repeat(2001) })
        .expect(400);
    });

    it("slows down a flood, in words a child can act on", async () => {
      await request(app.getHttpServer())
        .post(`/v1/classes/${classId}/chat`)
        .set(auth(bimpeToken))
        .send({ body: "first" })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post(`/v1/classes/${classId}/chat`)
        .set(auth(bimpeToken))
        .send({ body: "second, immediately" })
        .expect(400);

      expect(res.body.message).toMatch(/slow down/i);
      expect(res.body.message).not.toMatch(/rate|throttl|429/i);
    });
  });

  describe("removing something", () => {
    let messageId: string;

    it("lets a student take back their own words", async () => {
      const posted = await postMessage(alfieToken, "something regretted");
      messageId = posted.body.id;

      await request(app.getHttpServer())
        .delete(`/v1/class-messages/${messageId}`)
        .set(auth(alfieToken))
        .expect(200);
    });

    it("leaves a visible gap rather than vanishing it", async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/classes/${classId}/chat`)
        .set(auth(bimpeToken))
        .expect(200);

      const removed = res.body.messages.find((m: { id: string }) => m.id === messageId);
      expect(removed.deleted).toBe(true);
      expect(removed.body).toBe("This message was removed.");
    });

    it("NEVER shows a classmate what it said", async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/classes/${classId}/chat`)
        .set(auth(bimpeToken))
        .expect(200);
      expect(JSON.stringify(res.body)).not.toContain("something regretted");
    });

    it("still shows staff what it said — 'delete the evidence' must not work", async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/classes/${classId}/chat`)
        .set(auth(teacherToken))
        .expect(200);

      const removed = res.body.messages.find((m: { id: string }) => m.id === messageId);
      expect(removed.removedBody).toBe("something regretted");
    });

    it("refuses to let a student delete a classmate's message", async () => {
      const posted = await postMessage(alfieToken, "mine, not yours");

      await request(app.getHttpServer())
        .delete(`/v1/class-messages/${posted.body.id}`)
        .set(auth(bimpeToken))
        .expect(403);
    });
  });

  describe("reporting", () => {
    let messageId: string;

    it("records a report without deleting anything", async () => {
      // If reporting deleted, any group of children could silence anyone by
      // agreeing to report them.
      const posted = await postMessage(alfieToken, "a message somebody objects to");
      messageId = posted.body.id;

      await request(app.getHttpServer())
        .post(`/v1/class-messages/${messageId}/report`)
        .set(auth(bimpeToken))
        .send({ reason: "This is unkind about someone in our class" })
        .expect(201);

      const chat = await request(app.getHttpServer())
        .get(`/v1/classes/${classId}/chat`)
        .set(auth(bimpeToken))
        .expect(200);
      const still = chat.body.messages.find((m: { id: string }) => m.id === messageId);
      expect(still.deleted).toBe(false);
    });

    it("puts it in front of staff, with the class and the text", async () => {
      const res = await request(app.getHttpServer())
        .get("/v1/class-messages/reports")
        .set(auth(teacherToken))
        .expect(200);

      const report = res.body.find((r: { message: { id: string } }) => r.message.id === messageId);
      expect(report.reason).toContain("unkind");
      expect(report.message.body).toBe("a message somebody objects to");
      expect(report.class.name).toBe("JSS 1A");
    });

    it("keeps the reports queue away from students", async () => {
      await request(app.getHttpServer())
        .get("/v1/class-messages/reports")
        .set(auth(alfieToken))
        .expect(403);
    });
  });

  describe("pausing the room", () => {
    it("lets the class teacher stop students posting while still writing themselves", async () => {
      await request(app.getHttpServer())
        .put(`/v1/classes/${classId}/chat/lock`)
        .set(auth(teacherToken))
        .send({ locked: true, reason: "Paused during the lesson" })
        .expect(200);

      const refused = await postMessage(alfieToken, "still talking", 403);
      expect(refused.body.message).toMatch(/paused/i);

      await postMessage(teacherToken, "Settle down please");
    });

    it("refuses to let a student unlock it", async () => {
      await request(app.getHttpServer())
        .put(`/v1/classes/${classId}/chat/lock`)
        .set(auth(alfieToken))
        .send({ locked: false })
        .expect(403);
    });

    it("lets the teacher open it again", async () => {
      await request(app.getHttpServer())
        .put(`/v1/classes/${classId}/chat/lock`)
        .set(auth(teacherToken))
        .send({ locked: false })
        .expect(200);

      await postMessage(alfieToken, "thanks");
    });
  });
});
