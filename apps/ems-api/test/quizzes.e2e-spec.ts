import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Client as PgClient } from "pg";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { ControlPrismaService } from "../src/control-db/control-prisma.service";
import { AiService } from "../src/ai/ai.service";

const FIXTURE_PREFIX = "e2e-quiz-";

const FAKE_GENERATED_CONTENT = {
  questions: [
    {
      questionNumber: 1,
      prompt: "What is 2 + 2?",
      type: "MULTIPLE_CHOICE",
      options: ["3", "4", "5"],
      correctAnswer: "4",
      marks: 1,
    },
  ],
};

function sampleQuestions() {
  return [
    {
      questionNumber: 1,
      prompt: "What is a noun?",
      type: "SHORT_ANSWER",
      options: [],
      correctAnswer: "A naming word",
      marks: 2,
    },
    {
      questionNumber: 2,
      prompt: "Which of these is a verb?",
      type: "MULTIPLE_CHOICE",
      options: ["table", "run", "blue"],
      correctAnswer: "run",
      marks: 1,
    },
  ];
}

describe("Quizzes (e2e)", () => {
  let app: INestApplication;
  let controlPrisma: ControlPrismaService;
  let accessToken: string;
  let studentToken: string;
  let schemeOfWorkId: string;

  const platformEmail = `${FIXTURE_PREFIX}platform-${Date.now()}@wisdomcampus.example`;
  const platformPassword = "Sup3rSecret!Pass";
  const school = { slug: `${FIXTURE_PREFIX}${Date.now()}`, adminEmail: `${FIXTURE_PREFIX}admin@example.com` };
  const adminPassword = "Sup3rSecret!Pass";
  const studentEmail = `${FIXTURE_PREFIX}student@example.com`;

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
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AiService)
      .useValue({
        generateJson: jest.fn().mockResolvedValue(FAKE_GENERATED_CONTENT),
      })
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    const server = app.getHttpServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));

    controlPrisma = app.get(ControlPrismaService);
    await purgeFixtures();

    const argon2 = await import("argon2");
    await controlPrisma.platformUser.create({
      data: {
        email: platformEmail,
        passwordHash: await argon2.hash(platformPassword),
        firstName: "E2E",
        lastName: "Platform",
        roles: ["PLATFORM_ADMIN"],
      },
    });
    const platformLogin = await request(app.getHttpServer())
      .post("/v1/platform/auth/login")
      .send({ email: platformEmail, password: platformPassword })
      .expect(200);

    await request(app.getHttpServer())
      .post("/v1/platform/schools")
      .set("Authorization", `Bearer ${platformLogin.body.accessToken}`)
      .send({
        name: school.slug,
        slug: school.slug,
        adminEmail: school.adminEmail,
        adminPassword,
        adminFirstName: "Admin",
        adminLastName: school.slug,
      })
      .expect(201);

    const login = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ schoolSlug: school.slug, email: school.adminEmail, password: adminPassword })
      .expect(200);
    accessToken = login.body.accessToken;

    const subjectRes = await request(app.getHttpServer())
      .post("/v1/subjects")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "English", gradeLevel: "Grade 5" })
      .expect(201);

    const schemeRes = await request(app.getHttpServer())
      .post("/v1/schemes-of-work")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        subjectId: subjectRes.body.id,
        academicYear: "2026-2027",
        term: "Term 1",
        content: {
          weeks: [{ weekNumber: 1, topic: "Parts of speech", objectives: ["Identify nouns"], activities: ["Sorting"] }],
        },
      })
      .expect(201);
    schemeOfWorkId = schemeRes.body.id;

    await request(app.getHttpServer())
      .post("/v1/students")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ firstName: "Test", lastName: "Student", email: studentEmail, password: adminPassword })
      .expect(201);

    const studentLogin = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ schoolSlug: school.slug, email: studentEmail, password: adminPassword })
      .expect(200);
    studentToken = studentLogin.body.accessToken;
    // See schemes-of-work.e2e-spec.ts for why these hooks need 120s.
  }, 120000);

  afterAll(async () => {
    if (controlPrisma) await purgeFixtures().catch(() => undefined);
    if (app) await app.close();
  }, 120000);

  it("403s the generate endpoint while mode is MANUAL", async () => {
    await request(app.getHttpServer())
      .post("/v1/quizzes/generate")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ schemeOfWorkId, weekNumber: 1, title: "Week 1 quiz" })
      .expect(403);
  });

  it("404s creating a quiz for a week the scheme doesn't have", async () => {
    await request(app.getHttpServer())
      .post("/v1/quizzes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ schemeOfWorkId, weekNumber: 99, title: "Nope", content: { questions: sampleQuestions() } })
      .expect(404);
  });

  it("manually creates, edits, and publishes a quiz", async () => {
    const created = await request(app.getHttpServer())
      .post("/v1/quizzes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ schemeOfWorkId, weekNumber: 1, title: "Week 1 quiz", content: { questions: sampleQuestions() } })
      .expect(201);
    expect(created.body.status).toBe("DRAFT");
    expect(created.body.source).toBe("MANUAL");

    const edited = await request(app.getHttpServer())
      .patch(`/v1/quizzes/${created.body.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ title: "Week 1 quiz (revised)" })
      .expect(200);
    expect(edited.body.title).toBe("Week 1 quiz (revised)");
    // Content is optional on update — omitting it must not wipe the questions.
    expect(edited.body.content.questions).toHaveLength(2);

    const published = await request(app.getHttpServer())
      .patch(`/v1/quizzes/${created.body.id}/publish`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(published.body.status).toBe("PUBLISHED");
  });

  it("allows more than one quiz per week, unlike lesson plans", async () => {
    await request(app.getHttpServer())
      .post("/v1/quizzes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ schemeOfWorkId, weekNumber: 1, title: "Week 1 retest", content: { questions: sampleQuestions() } })
      .expect(201);
  });

  it("generates a quiz via the (faked) AI provider once mode allows it", async () => {
    await request(app.getHttpServer())
      .patch("/v1/curriculum-settings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ mode: "HYBRID" })
      .expect(200);

    const generated = await request(app.getHttpServer())
      .post("/v1/quizzes/generate")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ schemeOfWorkId, weekNumber: 1, title: "AI quiz" })
      .expect(201);

    expect(generated.body.source).toBe("AI_GENERATED");
    expect(generated.body.status).toBe("DRAFT");
    expect(generated.body.content).toEqual(FAKE_GENERATED_CONTENT);
    expect(generated.body.generatedAt).not.toBeNull();
  });

  it("never sends the answer key to a student, on either list or detail", async () => {
    const created = await request(app.getHttpServer())
      .post("/v1/quizzes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ schemeOfWorkId, weekNumber: 1, title: "Answer-leak check", content: { questions: sampleQuestions() } })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/v1/quizzes/${created.body.id}/publish`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    const detail = await request(app.getHttpServer())
      .get(`/v1/quizzes/${created.body.id}`)
      .set("Authorization", `Bearer ${studentToken}`)
      .expect(200);

    // The questions must still be there — stripping answers must not gut the quiz.
    expect(detail.body.content.questions).toHaveLength(2);
    expect(detail.body.content.questions[0].prompt).toBe("What is a noun?");
    expect(detail.body.content.questions[1].options).toEqual(["table", "run", "blue"]);
    for (const question of detail.body.content.questions) {
      expect(question).not.toHaveProperty("correctAnswer");
    }
    // Belt and braces: the answer text must not appear anywhere in the payload.
    expect(JSON.stringify(detail.body)).not.toContain("A naming word");

    const list = await request(app.getHttpServer())
      .get("/v1/quizzes")
      .set("Authorization", `Bearer ${studentToken}`)
      .expect(200);
    expect(JSON.stringify(list.body)).not.toContain("correctAnswer");
    expect(JSON.stringify(list.body)).not.toContain("A naming word");

    // And staff still get the answers.
    const staffDetail = await request(app.getHttpServer())
      .get(`/v1/quizzes/${created.body.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(staffDetail.body.content.questions[0].correctAnswer).toBe("A naming word");
  });

  it("hides DRAFT quizzes from students but shows them to staff", async () => {
    const draft = await request(app.getHttpServer())
      .post("/v1/quizzes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ schemeOfWorkId, weekNumber: 1, title: "Unpublished", content: { questions: sampleQuestions() } })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/v1/quizzes/${draft.body.id}`)
      .set("Authorization", `Bearer ${studentToken}`)
      .expect(404);

    const listAsStudent = await request(app.getHttpServer())
      .get("/v1/quizzes")
      .set("Authorization", `Bearer ${studentToken}`)
      .expect(200);
    expect(listAsStudent.body.map((q: { id: string }) => q.id)).not.toContain(draft.body.id);

    const listAsAdmin = await request(app.getHttpServer())
      .get("/v1/quizzes")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(listAsAdmin.body.map((q: { id: string }) => q.id)).toContain(draft.body.id);
  });
});
