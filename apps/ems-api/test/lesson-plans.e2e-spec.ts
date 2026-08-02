import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Client as PgClient } from "pg";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { ControlPrismaService } from "../src/control-db/control-prisma.service";
import { GeminiService } from "../src/ai/gemini.service";

const FIXTURE_PREFIX = "e2e-lp-";

/**
 * `GeminiService` is overridden with a fake that returns a canned structured
 * response — proves the full generate -> parse -> persist -> response path
 * works without needing a real GEMINI_API_KEY or network access, same
 * reasoning as schemes-of-work.e2e-spec.ts.
 */
const FAKE_GENERATED_CONTENT = {
  objectives: ["Add fractions with unlike denominators"],
  materials: ["Fraction tiles", "Worksheet"],
  introduction: "Recap adding fractions with the same denominator.",
  developmentSteps: ["Model with fraction tiles", "Guided practice", "Independent practice"],
  conclusion: "Exit ticket with two problems.",
  assessment: "Review exit ticket answers.",
  homework: "Complete worksheet page 12.",
};

describe("Lesson plans (e2e)", () => {
  let app: INestApplication;
  let controlPrisma: ControlPrismaService;
  let accessToken: string;
  let schemeOfWorkId: string;

  const platformEmail = `${FIXTURE_PREFIX}platform-${Date.now()}@wisdomcampus.example`;
  const platformPassword = "Sup3rSecret!Pass";
  const school = { slug: `${FIXTURE_PREFIX}${Date.now()}`, adminEmail: `${FIXTURE_PREFIX}admin@example.com` };
  const adminPassword = "Sup3rSecret!Pass";

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
      .overrideProvider(GeminiService)
      .useValue({
        isConfigured: true,
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
    const platformAccessToken = platformLogin.body.accessToken as string;

    await request(app.getHttpServer())
      .post("/v1/platform/schools")
      .set("Authorization", `Bearer ${platformAccessToken}`)
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
      .send({ name: "Mathematics", gradeLevel: "Grade 5" })
      .expect(201);

    const schemeRes = await request(app.getHttpServer())
      .post("/v1/schemes-of-work")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        subjectId: subjectRes.body.id,
        academicYear: "2026-2027",
        term: "Term 1",
        content: {
          weeks: [
            { weekNumber: 1, topic: "Fractions", objectives: ["Understand fractions"], activities: ["Pizza slicing"] },
          ],
        },
      })
      .expect(201);
    schemeOfWorkId = schemeRes.body.id;
    // Cold ts-jest compile of the whole AppModule graph plus a real school
    // provisioning cycle (new tenant DB + migrations) routinely exceeds
    // Jest's default 60s hook timeout on first run — same reasoning as
    // tenant-isolation.e2e-spec.ts, which does this twice.
  }, 120000);

  afterAll(async () => {
    if (controlPrisma) await purgeFixtures().catch(() => undefined);
    if (app) await app.close();
  }, 120000);

  it("403s the generate endpoint while mode is MANUAL", async () => {
    await request(app.getHttpServer())
      .post("/v1/lesson-plans/generate")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ schemeOfWorkId, weekNumber: 1 })
      .expect(403);
  });

  it("404s creating a lesson plan for a week that doesn't exist on the scheme", async () => {
    await request(app.getHttpServer())
      .post("/v1/lesson-plans")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        schemeOfWorkId,
        weekNumber: 99,
        content: {
          objectives: ["x"],
          materials: ["y"],
          introduction: "z",
          developmentSteps: ["a"],
          conclusion: "b",
          assessment: "c",
          homework: "d",
        },
      })
      .expect(404);
  });

  it("manually creates, edits, and publishes a lesson plan", async () => {
    const created = await request(app.getHttpServer())
      .post("/v1/lesson-plans")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        schemeOfWorkId,
        weekNumber: 1,
        content: {
          objectives: ["Understand fractions"],
          materials: ["Pizza cutouts"],
          introduction: "What is a fraction?",
          developmentSteps: ["Demonstrate", "Practice"],
          conclusion: "Recap",
          assessment: "Quick quiz",
          homework: "Worksheet page 3",
        },
      })
      .expect(201);
    expect(created.body.status).toBe("DRAFT");
    expect(created.body.source).toBe("MANUAL");
    expect(created.body.weekNumber).toBe(1);

    const edited = await request(app.getHttpServer())
      .patch(`/v1/lesson-plans/${created.body.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        content: {
          objectives: ["Understand fractions (revised)"],
          materials: ["Pizza cutouts"],
          introduction: "What is a fraction?",
          developmentSteps: ["Demonstrate", "Practice"],
          conclusion: "Recap",
          assessment: "Quick quiz",
          homework: "Worksheet page 3",
        },
      })
      .expect(200);
    expect(edited.body.content.objectives[0]).toBe("Understand fractions (revised)");

    const published = await request(app.getHttpServer())
      .patch(`/v1/lesson-plans/${created.body.id}/publish`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(published.body.status).toBe("PUBLISHED");
  });

  it("generates a lesson plan via the (faked) AI provider once mode allows it", async () => {
    await request(app.getHttpServer())
      .patch("/v1/curriculum-settings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ mode: "HYBRID" })
      .expect(200);

    const subjectRes = await request(app.getHttpServer())
      .post("/v1/subjects")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Science", gradeLevel: "Grade 5" })
      .expect(201);

    const schemeRes = await request(app.getHttpServer())
      .post("/v1/schemes-of-work")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        subjectId: subjectRes.body.id,
        academicYear: "2026-2027",
        term: "Term 1",
        content: { weeks: [{ weekNumber: 1, topic: "States of matter", objectives: ["x"], activities: ["y"] }] },
      })
      .expect(201);

    const generated = await request(app.getHttpServer())
      .post("/v1/lesson-plans/generate")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ schemeOfWorkId: schemeRes.body.id, weekNumber: 1 })
      .expect(201);

    expect(generated.body.source).toBe("AI_GENERATED");
    expect(generated.body.status).toBe("DRAFT");
    expect(generated.body.content).toEqual(FAKE_GENERATED_CONTENT);
    expect(generated.body.generatedAt).not.toBeNull();
  });

  it("hides DRAFT lesson plans from students/guardians but shows PUBLISHED ones", async () => {
    const subjectRes = await request(app.getHttpServer())
      .post("/v1/subjects")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "History", gradeLevel: "Grade 5" })
      .expect(201);

    const schemeRes = await request(app.getHttpServer())
      .post("/v1/schemes-of-work")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        subjectId: subjectRes.body.id,
        academicYear: "2026-2027",
        term: "Term 1",
        content: { weeks: [{ weekNumber: 1, topic: "Ancient Egypt", objectives: ["x"], activities: ["y"] }] },
      })
      .expect(201);

    const draft = await request(app.getHttpServer())
      .post("/v1/lesson-plans")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        schemeOfWorkId: schemeRes.body.id,
        weekNumber: 1,
        content: {
          objectives: ["x"],
          materials: ["y"],
          introduction: "z",
          developmentSteps: ["a"],
          conclusion: "b",
          assessment: "c",
          homework: "d",
        },
      })
      .expect(201);

    await request(app.getHttpServer())
      .post("/v1/students")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ firstName: "Test", lastName: "Student", email: `${FIXTURE_PREFIX}student@example.com`, password: adminPassword })
      .expect(201);

    const studentLogin = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ schoolSlug: school.slug, email: `${FIXTURE_PREFIX}student@example.com`, password: adminPassword })
      .expect(200);
    const studentToken = studentLogin.body.accessToken as string;

    const listAsStudent = await request(app.getHttpServer())
      .get("/v1/lesson-plans")
      .set("Authorization", `Bearer ${studentToken}`)
      .expect(200);
    const idsVisibleToStudent = listAsStudent.body.map((p: { id: string }) => p.id);
    expect(idsVisibleToStudent).not.toContain(draft.body.id);

    await request(app.getHttpServer())
      .get(`/v1/lesson-plans/${draft.body.id}`)
      .set("Authorization", `Bearer ${studentToken}`)
      .expect(404);

    const listAsAdmin = await request(app.getHttpServer())
      .get("/v1/lesson-plans")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(listAsAdmin.body.map((p: { id: string }) => p.id)).toContain(draft.body.id);
  });
});
