import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";
import { SettingsService } from "../src/settings/settings.service";

const FIXTURE_PREFIX = "settings-fixture-";

async function purgeFixtures(prisma: PrismaService): Promise<void> {
  await prisma.setting.deleteMany({
    where: { key: { in: ["STRIPE_SECRET_KEY", "SMTP_HOST", "SMTP_PORT", "STORE_NAME", "SMTP_PASSWORD"] } },
  });
  await prisma.user.deleteMany({ where: { email: { startsWith: FIXTURE_PREFIX } } });
}

describe("Admin settings (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let settings: SettingsService;

  const suffix = Date.now();
  const superEmail = `${FIXTURE_PREFIX}super-${suffix}@wisdomshop.example`;
  const adminEmail = `${FIXTURE_PREFIX}admin-${suffix}@wisdomshop.example`;
  const plainEmail = `${FIXTURE_PREFIX}plain-${suffix}@wisdomshop.example`;
  const password = "Sup3rSecret!Pass";

  let superToken: string;
  let adminToken: string;
  let plainToken: string;

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const http = () => request(app.getHttpServer());

  async function register(email: string): Promise<{ id: string; token: string }> {
    const res = await http()
      .post("/v1/auth/register")
      .send({ email, password, firstName: "Set", lastName: "Ting" });
    return { id: res.body.user.id, token: res.body.accessToken };
  }

  async function seedRole(userId: string, name: "ADMIN" | "SUPER_ADMIN") {
    const role = await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
    await prisma.userRole.create({ data: { userId, roleId: role.id } });
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    settings = app.get(SettingsService);

    await purgeFixtures(prisma);

    const su = await register(superEmail);
    await seedRole(su.id, "SUPER_ADMIN");
    superToken = (await http().post("/v1/auth/login").send({ email: superEmail, password })).body.accessToken;

    const ad = await register(adminEmail);
    await seedRole(ad.id, "ADMIN");
    adminToken = (await http().post("/v1/auth/login").send({ email: adminEmail, password })).body.accessToken;

    plainToken = (await register(plainEmail)).token;
  });

  afterAll(async () => {
    if (prisma) await purgeFixtures(prisma).catch(() => undefined);
    if (app) await app.close();
  });

  afterEach(() => settings.invalidate());

  it("is reachable only by a super admin", async () => {
    await http().get("/v1/admin/settings").expect(401);
    await http().get("/v1/admin/settings").set(auth(plainToken)).expect(403);
    // Deliberately stricter than the rest of the admin area: these are
    // payment credentials, so an ordinary ADMIN is not enough.
    await http().get("/v1/admin/settings").set(auth(adminToken)).expect(403);
    await http().get("/v1/admin/settings").set(auth(superToken)).expect(200);
  });

  it("never returns a secret value, only a mask", async () => {
    const secret = "sk_test_thisisthesecretvalue_9999";
    await http()
      .put("/v1/admin/settings")
      .set(auth(superToken))
      .send({ values: { STRIPE_SECRET_KEY: secret } })
      .expect(200);

    const res = await http().get("/v1/admin/settings").set(auth(superToken)).expect(200);

    // The whole response body, not just the one field — a secret leaking
    // through some other key would be just as bad.
    expect(JSON.stringify(res.body)).not.toContain(secret);

    const entry = res.body.settings.find((s: { key: string }) => s.key === "STRIPE_SECRET_KEY");
    expect(entry.configured).toBe(true);
    expect(entry.secret).toBe(true);
    expect(entry.value).toMatch(/•/);
    expect(entry.source).toBe("database");
  });

  it("stores secrets encrypted, not as plaintext in the table", async () => {
    const secret = "sk_test_encryption_check_12345";
    await http()
      .put("/v1/admin/settings")
      .set(auth(superToken))
      .send({ values: { STRIPE_SECRET_KEY: secret } })
      .expect(200);

    const row = await prisma.setting.findUniqueOrThrow({ where: { key: "STRIPE_SECRET_KEY" } });
    expect(row.isSecret).toBe(true);
    expect(row.value).not.toContain(secret);
    // Anyone with database access must not be able to read the key.
    expect(row.value).toMatch(/^[^:]+:[^:]+:[^:]+$/); // iv:tag:ciphertext

    // ...but the application can still use it.
    expect(await settings.get("STRIPE_SECRET_KEY")).toBe(secret);
  });

  it("lets a saved value take precedence over the environment", async () => {
    await http()
      .put("/v1/admin/settings")
      .set(auth(superToken))
      .send({ values: { STORE_NAME: "Saved In Database" } })
      .expect(200);

    settings.invalidate();
    expect(await settings.get("STORE_NAME")).toBe("Saved In Database");
  });

  it("reverts to the environment when a value is cleared", async () => {
    await http()
      .put("/v1/admin/settings")
      .set(auth(superToken))
      .send({ values: { STORE_NAME: "Temporary" } })
      .expect(200);
    settings.invalidate();
    expect(await settings.get("STORE_NAME")).toBe("Temporary");

    // An empty string is how the UI says "undo this", without the admin
    // needing to know what the environment holds.
    await http()
      .put("/v1/admin/settings")
      .set(auth(superToken))
      .send({ values: { STORE_NAME: "" } })
      .expect(200);
    settings.invalidate();

    const row = await prisma.setting.findUnique({ where: { key: "STORE_NAME" } });
    expect(row).toBeNull();
  });

  it("refuses keys that are not in the registry", async () => {
    // The table holds payment credentials; an endpoint that writes arbitrary
    // keys is an endpoint that can be pointed at anything the app reads.
    await http()
      .put("/v1/admin/settings")
      .set(auth(superToken))
      .send({ values: { DATABASE_URL: "postgres://attacker/db" } })
      .expect(400);

    await http()
      .put("/v1/admin/settings")
      .set(auth(superToken))
      .send({ values: { JWT_ACCESS_SECRET: "hijack" } })
      .expect(400);

    expect(await prisma.setting.findUnique({ where: { key: "DATABASE_URL" } })).toBeNull();
  });

  it("validates types before storing", async () => {
    await http()
      .put("/v1/admin/settings")
      .set(auth(superToken))
      .send({ values: { SMTP_PORT: "not-a-port" } })
      .expect(400);

    await http()
      .put("/v1/admin/settings")
      .set(auth(superToken))
      .send({ values: { STORE_SUPPORT_EMAIL: "not-an-email" } })
      .expect(400);
  });

  it("records which keys changed without recording their values", async () => {
    const secret = "sk_test_audit_should_not_hold_this";
    await http()
      .put("/v1/admin/settings")
      .set(auth(superToken))
      .send({ values: { STRIPE_SECRET_KEY: secret } })
      .expect(200);

    const entry = await prisma.auditLog.findFirst({
      where: { action: "settings.updated" },
      orderBy: { createdAt: "desc" },
    });

    expect(JSON.stringify(entry?.metadata)).toContain("STRIPE_SECRET_KEY");
    // Encrypting the column would be pointless if the value were copied into
    // an audit table admins can read.
    expect(JSON.stringify(entry?.metadata)).not.toContain(secret);
  });

  it("reports SMTP as unusable rather than pretending it works", async () => {
    const res = await http().post("/v1/admin/settings/email/test").set(auth(superToken)).expect(200);
    // No SMTP host is configured in the test environment, so this must say so
    // instead of returning a cheerful success.
    expect(res.body.ok).toBe(false);
    expect(res.body.message).toBeTruthy();
  });
});
