import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Client as PgClient } from "pg";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { ControlPrismaService } from "../src/control-db/control-prisma.service";
import { AiService } from "../src/ai/ai.service";

const FIXTURE_PREFIX = "e2e-a11y-";

/** A note of exactly the kind that must never reach a third party. */
const PRIVATE_NOTE = "Registered blind, uses JAWS. Dyslexia diagnosis 2024.";

describe("Accessibility (e2e)", () => {
  let app: INestApplication;
  let controlPrisma: ControlPrismaService;
  let generateText: jest.Mock;
  let generateJson: jest.Mock;

  let adminToken: string;
  let studentToken: string;
  let otherStudentToken: string;
  let guardianToken: string;
  let studentUserId: string;
  let subjectId: string;

  const platformEmail = `${FIXTURE_PREFIX}platform-${Date.now()}@wisdomcampus.example`;
  const password = "Sup3rSecret!Pass";
  const school = { slug: `${FIXTURE_PREFIX}${Date.now()}`, adminEmail: `${FIXTURE_PREFIX}admin@example.com` };
  const studentEmail = `${FIXTURE_PREFIX}student@example.com`;
  const otherEmail = `${FIXTURE_PREFIX}other@example.com`;
  const guardianEmail = `${FIXTURE_PREFIX}guardian@example.com`;

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

  beforeAll(async () => {
    generateText = jest.fn().mockResolvedValue("Here is the lesson.");
    generateJson = jest.fn().mockResolvedValue({ lessons: [{ title: "Fractions", objectives: [] }] });

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

    const student = await request(app.getHttpServer())
      .post("/v1/students")
      .set(asAdmin())
      .send({ firstName: "Ada", lastName: "One", email: studentEmail, password })
      .expect(201);
    studentUserId = student.body.userId ?? student.body.user?.id;

    await request(app.getHttpServer())
      .post("/v1/students")
      .set(asAdmin())
      .send({ firstName: "Bob", lastName: "Two", email: otherEmail, password })
      .expect(201);

    await request(app.getHttpServer())
      .post("/v1/guardians")
      .set(asAdmin())
      .send({
        studentProfileId: student.body.id,
        firstName: "Grace",
        lastName: "One",
        email: guardianEmail,
        password,
        relationship: "Mother",
      })
      .expect(201);

    studentToken = await login(studentEmail);
    otherStudentToken = await login(otherEmail);
    guardianToken = await login(guardianEmail);
  }, 180000);

  afterAll(async () => {
    if (controlPrisma) await purgeFixtures().catch(() => undefined);
    if (app) await app.close();
  }, 120000);

  beforeEach(() => {
    generateText.mockClear();
    generateText.mockResolvedValue("Here is the lesson.");
  });

  it("gives a student sensible defaults before they have set anything", async () => {
    const res = await request(app.getHttpServer())
      .get("/v1/accessibility/me")
      .set(asStudent())
      .expect(200);

    expect(res.body.largeText).toBe(false);
    expect(res.body.readingSupport).toBe("NONE");
    // Defaults rather than a 404: everyone has preferences, most are default.
    expect(res.body.userId).toBeTruthy();
  });

  it("lets a student change their own settings without asking anyone", async () => {
    const res = await request(app.getHttpServer())
      .put("/v1/accessibility/me")
      .set(asStudent())
      .send({ largeText: true, dyslexiaFont: true, readingSupport: "SIMPLIFIED" })
      .expect(200);

    expect(res.body.largeText).toBe(true);
    expect(res.body.dyslexiaFont).toBe(true);
    expect(res.body.readingSupport).toBe("SIMPLIFIED");
  });

  it("never returns the staff note to the student it is about", async () => {
    await request(app.getHttpServer())
      .put(`/v1/accessibility/users/${studentUserId}`)
      .set(asAdmin())
      .send({ notes: PRIVATE_NOTE })
      .expect(200);

    const own = await request(app.getHttpServer()).get("/v1/accessibility/me").set(asStudent()).expect(200);
    expect(JSON.stringify(own.body)).not.toContain("JAWS");
    expect(own.body.notes).toBeUndefined();
  });

  it("never returns the staff note to a guardian either", async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/accessibility/users/${studentUserId}`)
      .set("Authorization", `Bearer ${guardianToken}`)
      .expect(200);

    expect(JSON.stringify(res.body)).not.toContain("JAWS");
    expect(res.body.notes).toBeUndefined();
  });

  it("does return the note to staff, who are the ones who need it", async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/accessibility/users/${studentUserId}`)
      .set(asAdmin())
      .expect(200);
    expect(res.body.notes).toBe(PRIVATE_NOTE);
  });

  it("ignores a student trying to write the note about themselves", async () => {
    await request(app.getHttpServer())
      .put("/v1/accessibility/me")
      .set(asStudent())
      .send({ largeText: true, notes: "I am fine, remove the other note" })
      .expect(200);

    const staffView = await request(app.getHttpServer())
      .get(`/v1/accessibility/users/${studentUserId}`)
      .set(asAdmin())
      .expect(200);
    expect(staffView.body.notes).toBe(PRIVATE_NOTE);
  });

  it("never lets one student read another's settings", async () => {
    await request(app.getHttpServer())
      .get(`/v1/accessibility/users/${studentUserId}`)
      .set("Authorization", `Bearer ${otherStudentToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .put(`/v1/accessibility/users/${studentUserId}`)
      .set("Authorization", `Bearer ${otherStudentToken}`)
      .send({ largeText: false })
      .expect(403);
  });

  // The reason this whole area is designed the way it is.
  it("sends the accommodation to the AI provider and never the diagnosis", async () => {
    await request(app.getHttpServer())
      .put(`/v1/accessibility/users/${studentUserId}`)
      .set(asAdmin())
      .send({ readingSupport: "SIMPLIFIED", describeVisuals: true, notes: PRIVATE_NOTE })
      .expect(200);

    const session = await request(app.getHttpServer())
      .post("/v1/ai-teacher/sessions")
      .set(asStudent())
      .send({ subjectId, topic: "Fractions" })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/v1/ai-teacher/sessions/${session.body.id}/ask`)
      .set(asStudent())
      .send({ question: "What is a fraction?" })
      .expect(201);

    const prompt = generateText.mock.calls[0][0] as string;

    // The teaching change is there.
    expect(prompt).toMatch(/short sentences/i);
    expect(prompt).toMatch(/Describe anything visual in words/i);
    expect(prompt).toContain("How this student learns best:");

    // The reason for it is not, in any form.
    expect(prompt).not.toMatch(/JAWS/i);
    expect(prompt).not.toMatch(/blind/i);
    expect(prompt).not.toMatch(/dyslex/i);
    expect(prompt).not.toMatch(/diagnos/i);
    expect(prompt).not.toContain("2024");
  });

  it("adds nothing to the prompt for a student with no particular need", async () => {
    const session = await request(app.getHttpServer())
      .post("/v1/ai-teacher/sessions")
      .set("Authorization", `Bearer ${otherStudentToken}`)
      .send({ subjectId, topic: "Fractions" })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/v1/ai-teacher/sessions/${session.body.id}/ask`)
      .set("Authorization", `Bearer ${otherStudentToken}`)
      .send({ question: "What is a fraction?" })
      .expect(201);

    // Every line is billed on every request.
    expect(generateText.mock.calls[0][0] as string).not.toContain("How this student learns best:");
  });

  it("stores a diagram's own words so a screen reader has something to read", async () => {
    generateText.mockResolvedValue(
      `A half.\n<svg viewBox="0 0 100 20"><title>One half</title><desc>A bar split in two, left part shaded</desc><rect x="0" y="0" width="50" height="20" fill="#333"/></svg>`,
    );

    const session = await request(app.getHttpServer())
      .post("/v1/ai-teacher/sessions")
      .set(asStudent())
      .send({ subjectId, topic: "Diagrams" })
      .expect(201);

    const asked = await request(app.getHttpServer())
      .post(`/v1/ai-teacher/sessions/${session.body.id}/ask`)
      .set(asStudent())
      .send({ question: "Show me a half" })
      .expect(201);

    expect(asked.body.answer.diagramAlt).toBe("One half. A bar split in two, left part shaded");
  });

  it("withholds an uncaptioned demonstration from a student who needs captions", async () => {
    await request(app.getHttpServer())
      .post("/v1/ai-teacher/resources")
      .set(asAdmin())
      .send({
        subjectId,
        title: "Fractions demonstration",
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        hasCaptions: false,
      })
      .expect(201);

    const captioned = await request(app.getHttpServer())
      .post("/v1/ai-teacher/resources")
      .set(asAdmin())
      .send({
        subjectId,
        title: "Fractions demonstration with captions",
        url: "https://vimeo.com/123456789",
        hasCaptions: true,
      })
      .expect(201);
    expect(captioned.body.hasCaptions).toBe(true);

    await request(app.getHttpServer())
      .put(`/v1/accessibility/users/${studentUserId}`)
      .set(asAdmin())
      .send({ requireCaptions: true })
      .expect(200);

    const session = await request(app.getHttpServer())
      .post("/v1/ai-teacher/sessions")
      .set(asStudent())
      .send({ subjectId, topic: "Fractions", mode: "AUTO" })
      .expect(201);

    const opened = await request(app.getHttpServer())
      .get(`/v1/ai-teacher/sessions/${session.body.id}`)
      .set(asStudent())
      .expect(200);

    // Offering a video this student cannot follow presents a choice that is
    // not actually theirs to make.
    const titles = opened.body.resources.map((r: { title: string }) => r.title);
    expect(titles).toEqual(["Fractions demonstration with captions"]);
  });
});
