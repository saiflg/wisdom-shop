import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Client as PgClient } from "pg";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { ControlPrismaService } from "../src/control-db/control-prisma.service";
import { AiService } from "../src/ai/ai.service";
import { MAX_TURNS_PER_SESSION } from "../src/ai-teacher/tutor-limits";

const FIXTURE_PREFIX = "e2e-tutor-";

/**
 * `AiService` is overridden so the suite never needs a provider key or the
 * network. The fake echoes the prompt length back, which lets one test assert
 * that the prompt actually grew with the conversation rather than being
 * rebuilt from nothing each turn.
 */
const TUTOR_REPLY = "A denominator is the number underneath the line. What is the one in 3/4?";

describe("AI Teacher (e2e)", () => {
  let app: INestApplication;
  let controlPrisma: ControlPrismaService;
  let generateText: jest.Mock;

  let adminToken: string;
  let studentAToken: string;
  let studentBToken: string;
  let guardianAToken: string;
  let guardianBToken: string;
  let subjectId: string;
  let sessionId: string;

  const platformEmail = `${FIXTURE_PREFIX}platform-${Date.now()}@wisdomcampus.example`;
  const password = "Sup3rSecret!Pass";
  const school = { slug: `${FIXTURE_PREFIX}${Date.now()}`, adminEmail: `${FIXTURE_PREFIX}admin@example.com` };
  const studentAEmail = `${FIXTURE_PREFIX}student-a@example.com`;
  const studentBEmail = `${FIXTURE_PREFIX}student-b@example.com`;
  const guardianAEmail = `${FIXTURE_PREFIX}guardian-a@example.com`;
  const guardianBEmail = `${FIXTURE_PREFIX}guardian-b@example.com`;

  const asAdmin = () => ({ Authorization: `Bearer ${adminToken}` });
  const asStudentA = () => ({ Authorization: `Bearer ${studentAToken}` });
  const asStudentB = () => ({ Authorization: `Bearer ${studentBToken}` });

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
    generateText = jest.fn().mockResolvedValue(TUTOR_REPLY);

    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AiService)
      .useValue({ generateText })
      .compile();

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

    const subject = await request(app.getHttpServer())
      .post("/v1/subjects")
      .set(asAdmin())
      .send({ name: "Mathematics", gradeLevel: "Grade 5" })
      .expect(201);
    subjectId = subject.body.id;

    // Two students in two different families, so cross-student scoping has
    // something real to leak if it is wrong.
    const a = await request(app.getHttpServer())
      .post("/v1/students")
      .set(asAdmin())
      .send({ firstName: "Ada", lastName: "One", email: studentAEmail, password })
      .expect(201);
    const b = await request(app.getHttpServer())
      .post("/v1/students")
      .set(asAdmin())
      .send({ firstName: "Bob", lastName: "Two", email: studentBEmail, password })
      .expect(201);

    await request(app.getHttpServer())
      .post("/v1/guardians")
      .set(asAdmin())
      .send({
        studentProfileId: a.body.id,
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
        studentProfileId: b.body.id,
        firstName: "Gary",
        lastName: "Two",
        email: guardianBEmail,
        password,
        relationship: "Father",
      })
      .expect(201);

    studentAToken = await login(studentAEmail);
    studentBToken = await login(studentBEmail);
    guardianAToken = await login(guardianAEmail);
    guardianBToken = await login(guardianBEmail);
    // Same reasoning as attendance.e2e-spec.ts: a school, a subject, two
    // students, two guardians and five argon2 logins do not fit in Jest's
    // default hook timeout once the whole suite is running.
  }, 180000);

  afterAll(async () => {
    if (controlPrisma) await purgeFixtures().catch(() => undefined);
    if (app) await app.close();
  }, 120000);

  beforeEach(() => {
    generateText.mockClear();
  });

  it("starts a lesson on a subject and topic", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/ai-teacher/sessions")
      .set(asStudentA())
      .send({ subjectId, topic: "Adding fractions" })
      .expect(201);

    expect(res.body.status).toBe("ACTIVE");
    expect(res.body.topic).toBe("Adding fractions");
    expect(res.body.subject.name).toBe("Mathematics");
    expect(res.body.turns).toEqual([]);
    sessionId = res.body.id;
  });

  it("404s a lesson on a subject that does not exist", async () => {
    await request(app.getHttpServer())
      .post("/v1/ai-teacher/sessions")
      .set(asStudentA())
      .send({ subjectId: "does-not-exist", topic: "Anything" })
      .expect(404);
  });

  it("refuses a guardian starting a lesson in a child's name", async () => {
    await request(app.getHttpServer())
      .post("/v1/ai-teacher/sessions")
      .set("Authorization", `Bearer ${guardianAToken}`)
      .send({ subjectId, topic: "Adding fractions" })
      .expect(403);
  });

  it("answers a question and stores both halves of the exchange in order", async () => {
    const res = await request(app.getHttpServer())
      .post(`/v1/ai-teacher/sessions/${sessionId}/ask`)
      .set(asStudentA())
      .send({ question: "What is a denominator?" })
      .expect(201);

    expect(res.body.question.role).toBe("STUDENT");
    expect(res.body.answer.role).toBe("TUTOR");
    expect(res.body.answer.content).toBe(TUTOR_REPLY);
    expect(res.body.answer.sequence).toBe(res.body.question.sequence + 1);

    const transcript = await request(app.getHttpServer())
      .get(`/v1/ai-teacher/sessions/${sessionId}`)
      .set(asStudentA())
      .expect(200);
    expect(transcript.body.turns.map((turn: { role: string }) => turn.role)).toEqual(["STUDENT", "TUTOR"]);
    expect(transcript.body.turns[0].content).toBe("What is a denominator?");
  });

  it("grounds the prompt in the school's curriculum rather than sending the bare question", async () => {
    await request(app.getHttpServer())
      .post(`/v1/ai-teacher/sessions/${sessionId}/ask`)
      .set(asStudentA())
      .send({ question: "And the numerator?" })
      .expect(201);

    const prompt = generateText.mock.calls[0][0] as string;
    expect(prompt).toContain("Mathematics");
    expect(prompt).toContain("Grade 5");
    expect(prompt).toContain("Adding fractions");
    // The earlier exchange has to be replayed, or the tutor has amnesia.
    expect(prompt).toContain("What is a denominator?");
    expect(prompt).toContain("And the numerator?");
    // And the rules that make this safe for a child must be in every call.
    expect(prompt).toMatch(/trusted adult/);
    expect(prompt).toMatch(/Never ask for or repeat personal details/);
  });

  it("never lets one student read another's lesson", async () => {
    await request(app.getHttpServer())
      .get(`/v1/ai-teacher/sessions/${sessionId}`)
      .set(asStudentB())
      .expect(404);

    const list = await request(app.getHttpServer())
      .get("/v1/ai-teacher/sessions")
      .set(asStudentB())
      .expect(200);
    expect(list.body).toEqual([]);
  });

  it("never lets one student speak into another's transcript", async () => {
    await request(app.getHttpServer())
      .post(`/v1/ai-teacher/sessions/${sessionId}/ask`)
      .set(asStudentB())
      .send({ question: "let me in" })
      .expect(404);

    // The refusal must happen before any spend.
    expect(generateText).not.toHaveBeenCalled();
  });

  it("does not let staff put words in a student's mouth", async () => {
    // Staff can read the whole transcript; that is the point of keeping one.
    // Writing into it would forge the record a safeguarding review relies on.
    await request(app.getHttpServer())
      .post(`/v1/ai-teacher/sessions/${sessionId}/ask`)
      .set(asAdmin())
      .send({ question: "pretend the student asked this" })
      .expect(404);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("lets staff read any lesson in the school", async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/ai-teacher/sessions/${sessionId}`)
      .set(asAdmin())
      .expect(200);
    expect(res.body.turns.length).toBeGreaterThan(0);
    expect(res.body.startedByUser.firstName).toBe("Ada");
  });

  it("lets a guardian read their own child's lesson but not another family's", async () => {
    await request(app.getHttpServer())
      .get(`/v1/ai-teacher/sessions/${sessionId}`)
      .set("Authorization", `Bearer ${guardianAToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/v1/ai-teacher/sessions/${sessionId}`)
      .set("Authorization", `Bearer ${guardianBToken}`)
      .expect(404);

    const list = await request(app.getHttpServer())
      .get("/v1/ai-teacher/sessions")
      .set("Authorization", `Bearer ${guardianBToken}`)
      .expect(200);
    expect(list.body).toEqual([]);
  });

  it("refuses a question longer than the cap without calling the provider", async () => {
    await request(app.getHttpServer())
      .post(`/v1/ai-teacher/sessions/${sessionId}/ask`)
      .set(asStudentA())
      .send({ question: "x".repeat(5000) })
      .expect(400);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("stops at the per-session limit, and refuses before spending", async () => {
    const fresh = await request(app.getHttpServer())
      .post("/v1/ai-teacher/sessions")
      .set(asStudentA())
      .send({ subjectId, topic: "Long division" })
      .expect(201);

    // Fill the session by writing to the tenant database directly rather than
    // through the API: this test is about the limit, and 40 real round trips
    // would dominate the suite's runtime.
    const record = await controlPrisma.school.findFirstOrThrow({ where: { slug: school.slug } });
    const tenantDb = new PgClient({
      connectionString: (process.env.POSTGRES_ADMIN_URL ?? "").replace(/\/postgres$/, `/${record.databaseName}`),
    });
    await tenantDb.connect();
    try {
      for (let index = 0; index < MAX_TURNS_PER_SESSION; index += 1) {
        // TUTOR turns, because the cap counts provider calls: an automatic
        // class advances without a question being typed and costs the same.
        await tenantDb.query(
          `INSERT INTO tutor_turns (id, "sessionId", sequence, role, content, "createdAt")
           VALUES ($1, $2, $3, 'TUTOR', $4, NOW())`,
          [`filler-${index}-${Date.now()}`, fresh.body.id, index + 1, `filler ${index}`],
        );
      }
    } finally {
      await tenantDb.end();
    }

    generateText.mockClear();
    const refused = await request(app.getHttpServer())
      .post(`/v1/ai-teacher/sessions/${fresh.body.id}/ask`)
      .set(asStudentA())
      .send({ question: "one more?" })
      .expect(403);

    expect(refused.body.message).toMatch(/limit/i);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("refuses questions once a lesson has ended", async () => {
    const fresh = await request(app.getHttpServer())
      .post("/v1/ai-teacher/sessions")
      .set(asStudentA())
      .send({ subjectId, topic: "Decimals" })
      .expect(201);

    const ended = await request(app.getHttpServer())
      .patch(`/v1/ai-teacher/sessions/${fresh.body.id}/end`)
      .set(asStudentA())
      .expect(200);
    expect(ended.body.status).toBe("ENDED");
    expect(ended.body.endedAt).not.toBeNull();

    generateText.mockClear();
    await request(app.getHttpServer())
      .post(`/v1/ai-teacher/sessions/${fresh.body.id}/ask`)
      .set(asStudentA())
      .send({ question: "still there?" })
      .expect(403);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("leaves no dangling question in the transcript when the provider fails", async () => {
    const fresh = await request(app.getHttpServer())
      .post("/v1/ai-teacher/sessions")
      .set(asStudentA())
      .send({ subjectId, topic: "Percentages" })
      .expect(201);

    generateText.mockRejectedValueOnce(new Error("provider is down"));
    await request(app.getHttpServer())
      .post(`/v1/ai-teacher/sessions/${fresh.body.id}/ask`)
      .set(asStudentA())
      .send({ question: "what is 10%?" })
      .expect(500);

    // A question with no answer would read like the tutor ignored the child.
    const after = await request(app.getHttpServer())
      .get(`/v1/ai-teacher/sessions/${fresh.body.id}`)
      .set(asStudentA())
      .expect(200);
    expect(after.body.turns).toEqual([]);

    // And the student can simply ask again.
    generateText.mockResolvedValueOnce(TUTOR_REPLY);
    await request(app.getHttpServer())
      .post(`/v1/ai-teacher/sessions/${fresh.body.id}/ask`)
      .set(asStudentA())
      .send({ question: "what is 10%?" })
      .expect(201);
  });
});
