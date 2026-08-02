import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Client as PgClient } from "pg";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { ControlPrismaService } from "../src/control-db/control-prisma.service";
import { GeminiService } from "../src/ai/gemini.service";

const FIXTURE_PREFIX = "e2e-sow-";

/**
 * `GeminiService` is overridden with a fake that returns a canned structured
 * response — this proves the full generate -> parse -> persist -> response
 * path works without needing a real GEMINI_API_KEY or network access, same
 * reasoning as the plan's "TestingModule provider-override" approach.
 */
const FAKE_GENERATED_CONTENT = {
  weeks: [
    { weekNumber: 1, topic: "Fractions", objectives: ["Add fractions"], activities: ["Pizza slicing exercise"] },
  ],
};

describe("Schemes of work (e2e)", () => {
  let app: INestApplication;
  let controlPrisma: ControlPrismaService;
  let accessToken: string;
  let subjectId: string;

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
    subjectId = subjectRes.body.id;
    // Cold ts-jest compile of the whole AppModule graph plus a real school
    // provisioning cycle (new tenant DB + migrations) routinely exceeds
    // Jest's default 60s hook timeout on first run — same reasoning as
    // tenant-isolation.e2e-spec.ts, which does this twice.
  }, 120000);

  afterAll(async () => {
    if (controlPrisma) await purgeFixtures().catch(() => undefined);
    if (app) await app.close();
  }, 120000);

  it("seeds MANUAL curriculum settings at provisioning time", async () => {
    const res = await request(app.getHttpServer())
      .get("/v1/curriculum-settings")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.mode).toBe("MANUAL");
  });

  it("403s the generate endpoint while mode is MANUAL", async () => {
    await request(app.getHttpServer())
      .post("/v1/schemes-of-work/generate")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ subjectId, academicYear: "2026-2027", term: "Term 1" })
      .expect(403);
  });

  it("manually creates, edits, and publishes a scheme of work", async () => {
    const created = await request(app.getHttpServer())
      .post("/v1/schemes-of-work")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        subjectId,
        academicYear: "2026-2027",
        term: "Term 1",
        content: { weeks: [{ weekNumber: 1, topic: "Numbers", objectives: ["Count"], activities: ["Game"] }] },
      })
      .expect(201);
    expect(created.body.status).toBe("DRAFT");
    expect(created.body.source).toBe("MANUAL");

    const edited = await request(app.getHttpServer())
      .patch(`/v1/schemes-of-work/${created.body.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ content: { weeks: [{ weekNumber: 1, topic: "Numbers (revised)", objectives: ["Count"], activities: ["Game"] }] } })
      .expect(200);
    expect(edited.body.content.weeks[0].topic).toBe("Numbers (revised)");

    const published = await request(app.getHttpServer())
      .patch(`/v1/schemes-of-work/${created.body.id}/publish`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(published.body.status).toBe("PUBLISHED");
  });

  it("generates a scheme of work via the (faked) AI provider once mode allows it", async () => {
    await request(app.getHttpServer())
      .patch("/v1/curriculum-settings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ mode: "HYBRID" })
      .expect(200);

    const generated = await request(app.getHttpServer())
      .post("/v1/schemes-of-work/generate")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ subjectId, academicYear: "2027-2028", term: "Term 1" })
      .expect(201);

    expect(generated.body.source).toBe("AI_GENERATED");
    expect(generated.body.status).toBe("DRAFT");
    expect(generated.body.content).toEqual(FAKE_GENERATED_CONTENT);
    expect(generated.body.generatedAt).not.toBeNull();
  });

  it("hides DRAFT schemes from students/guardians but shows PUBLISHED ones", async () => {
    const draft = await request(app.getHttpServer())
      .post("/v1/schemes-of-work")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        subjectId,
        academicYear: "2026-2027",
        term: "Term 2",
        content: { weeks: [{ weekNumber: 1, topic: "Draft topic", objectives: ["x"], activities: ["y"] }] },
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
      .get("/v1/schemes-of-work")
      .set("Authorization", `Bearer ${studentToken}`)
      .expect(200);
    const idsVisibleToStudent = listAsStudent.body.map((s: { id: string }) => s.id);
    expect(idsVisibleToStudent).not.toContain(draft.body.id);

    await request(app.getHttpServer())
      .get(`/v1/schemes-of-work/${draft.body.id}`)
      .set("Authorization", `Bearer ${studentToken}`)
      .expect(404);

    const listAsAdmin = await request(app.getHttpServer())
      .get("/v1/schemes-of-work")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(listAsAdmin.body.map((s: { id: string }) => s.id)).toContain(draft.body.id);
  });
});
