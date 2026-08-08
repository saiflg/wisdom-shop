import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { ControlPrismaService } from "../src/control-db/control-prisma.service";

const FIXTURE_PREFIX = "e2e-ai-";

/**
 * A key-shaped string that appears nowhere else in the codebase, so a search
 * for it through a response body is a genuine leak test rather than a
 * coincidence. Not a real credential.
 */
const SECRET = "sk-or-v1-e2eonlyfakekeyvalue00000000000000000000000000000000000000009f3c";

describe("AI provider settings (e2e)", () => {
  let app: INestApplication;
  let controlPrisma: ControlPrismaService;
  let adminToken: string;
  let supportToken: string;

  const adminEmail = `${FIXTURE_PREFIX}admin-${Date.now()}@wisdomcampus.example`;
  const supportEmail = `${FIXTURE_PREFIX}support-${Date.now()}@wisdomcampus.example`;
  const password = "Sup3rSecret!Pass";

  const auth = () => ({ Authorization: `Bearer ${adminToken}` });

  /**
   * The settings are a singleton row shared with the running dev environment,
   * not a fixture this test owns. Whatever is there when the test starts is
   * put back afterwards, so running the suite never costs someone their
   * configured key.
   */
  let originalRow: Record<string, unknown> | null = null;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    await new Promise<void>((resolve) => app.getHttpServer().listen(0, resolve));

    controlPrisma = app.get(ControlPrismaService);
    originalRow = (await controlPrisma.aiProviderSettings.findUnique({ where: { id: 1 } })) as never;

    await controlPrisma.platformUser.deleteMany({ where: { email: { startsWith: FIXTURE_PREFIX } } });

    const argon2 = await import("argon2");
    const passwordHash = await argon2.hash(password);
    await controlPrisma.platformUser.createMany({
      data: [
        { email: adminEmail, passwordHash, firstName: "E2E", lastName: "Admin", roles: ["PLATFORM_ADMIN"] },
        { email: supportEmail, passwordHash, firstName: "E2E", lastName: "Support", roles: ["PLATFORM_SUPPORT"] },
      ],
    });

    const login = async (email: string) => {
      const res = await request(app.getHttpServer())
        .post("/v1/platform/auth/login")
        .send({ email, password })
        .expect(200);
      return res.body.accessToken as string;
    };
    adminToken = await login(adminEmail);
    supportToken = await login(supportEmail);
  }, 120000);

  afterAll(async () => {
    if (originalRow) {
      const { id, createdAt, updatedAt, ...rest } = originalRow as never;
      void id;
      void createdAt;
      void updatedAt;
      await controlPrisma.aiProviderSettings.update({ where: { id: 1 }, data: rest });
    }
    await controlPrisma.platformUser.deleteMany({ where: { email: { startsWith: FIXTURE_PREFIX } } });
    await app.close();
  });

  it("offers a choice of providers with their defaults", async () => {
    const res = await request(app.getHttpServer()).get("/v1/platform/ai/providers").set(auth()).expect(200);

    expect(res.body.length).toBeGreaterThanOrEqual(5);
    expect(res.body.map((p: { id: string }) => p.id)).toEqual(
      expect.arrayContaining(["OPENROUTER", "OPENAI", "ANTHROPIC", "GOOGLE_GEMINI", "OPENAI_COMPATIBLE"]),
    );
    // Every named vendor suggests a model. The generic endpoint cannot —
    // there is no way to guess what a self-hosted server serves.
    for (const provider of res.body) {
      if (provider.id === "OPENAI_COMPATIBLE") continue;
      expect(provider.defaultModel).toBeTruthy();
    }
    // Only the bring-your-own-endpoint option should ask for a base URL.
    const needsBaseUrl = res.body.filter((p: { needsBaseUrl: boolean }) => p.needsBaseUrl);
    expect(needsBaseUrl.map((p: { id: string }) => p.id)).toEqual(["OPENAI_COMPATIBLE"]);
  });

  it("never returns a saved key, and stores it encrypted", async () => {
    const saved = await request(app.getHttpServer())
      .put("/v1/platform/ai/settings")
      .set(auth())
      .send({ provider: "OPENROUTER", model: "google/gemini-2.0-flash-exp:free", apiKey: SECRET })
      .expect(200);

    expect(JSON.stringify(saved.body)).not.toContain(SECRET);
    expect(saved.body.hasApiKey).toBe(true);
    expect(saved.body.apiKeyMasked).toContain(SECRET.slice(-4));
    expect(saved.body.apiKeyMasked).not.toContain(SECRET.slice(0, 8));

    const fetched = await request(app.getHttpServer()).get("/v1/platform/ai/settings").set(auth()).expect(200);
    expect(JSON.stringify(fetched.body)).not.toContain(SECRET);

    // The masked view could be right while the column still held plaintext,
    // so the column itself is what gets asserted.
    const row = await controlPrisma.aiProviderSettings.findUnique({ where: { id: 1 } });
    expect(row?.apiKeyEncrypted).toBeTruthy();
    expect(row?.apiKeyEncrypted).not.toContain(SECRET);
  });

  it("keeps the stored key when the key field is omitted", async () => {
    await request(app.getHttpServer())
      .put("/v1/platform/ai/settings")
      .set(auth())
      .send({ provider: "OPENROUTER", model: "meta-llama/llama-3.3-70b-instruct" })
      .expect(200);

    const res = await request(app.getHttpServer()).get("/v1/platform/ai/settings").set(auth()).expect(200);
    expect(res.body.model).toBe("meta-llama/llama-3.3-70b-instruct");
    // Changing the model must not silently sign the platform out of its provider.
    expect(res.body.hasApiKey).toBe(true);
  });

  it("clears the key when an empty key is sent", async () => {
    await request(app.getHttpServer())
      .put("/v1/platform/ai/settings")
      .set(auth())
      .send({ provider: "OPENROUTER", apiKey: "" })
      .expect(200);

    const res = await request(app.getHttpServer()).get("/v1/platform/ai/settings").set(auth()).expect(200);
    expect(res.body.hasApiKey).toBe(false);
    expect(res.body.apiKeyMasked).toBeNull();

    const row = await controlPrisma.aiProviderSettings.findUnique({ where: { id: 1 } });
    expect(row?.apiKeyEncrypted).toBeNull();
  });

  it("reports a missing key instead of calling out to a provider", async () => {
    await request(app.getHttpServer())
      .put("/v1/platform/ai/settings")
      .set(auth())
      .send({ provider: "OPENROUTER", apiKey: "" })
      .expect(200);

    const res = await request(app.getHttpServer()).post("/v1/platform/ai/test").set(auth()).expect(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.message).toMatch(/key/i);
  });

  it("rejects support staff and anonymous callers", async () => {
    const support = { Authorization: `Bearer ${supportToken}` };

    await request(app.getHttpServer()).get("/v1/platform/ai/settings").set(support).expect(403);
    await request(app.getHttpServer())
      .put("/v1/platform/ai/settings")
      .set(support)
      .send({ provider: "OPENAI", apiKey: "sk-should-not-be-accepted" })
      .expect(403);
    await request(app.getHttpServer()).get("/v1/platform/ai/settings").expect(401);
    await request(app.getHttpServer()).post("/v1/platform/ai/test").expect(401);

    // The rejected write must not have landed.
    const res = await request(app.getHttpServer()).get("/v1/platform/ai/settings").set(auth()).expect(200);
    expect(res.body.provider).toBe("OPENROUTER");
  });

  it("refuses a provider it does not support", async () => {
    await request(app.getHttpServer())
      .put("/v1/platform/ai/settings")
      .set(auth())
      .send({ provider: "SOME_OTHER_LLM", apiKey: "x" })
      .expect(400);
  });
});
