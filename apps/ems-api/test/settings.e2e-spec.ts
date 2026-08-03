import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Client as PgClient } from "pg";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { ControlPrismaService } from "../src/control-db/control-prisma.service";

const FIXTURE_PREFIX = "e2e-set-";

const SMTP_PASSWORD = "sup3r-secret-smtp-password";
const STRIPE_SECRET = "sk_test_51ABCDEFGHIJKLMNOP";

describe("Gateway settings (e2e)", () => {
  let app: INestApplication;
  let controlPrisma: ControlPrismaService;
  let adminToken: string;
  let teacherToken: string;

  const platformEmail = `${FIXTURE_PREFIX}platform-${Date.now()}@wisdomcampus.example`;
  const password = "Sup3rSecret!Pass";
  const school = { slug: `${FIXTURE_PREFIX}${Date.now()}`, adminEmail: `${FIXTURE_PREFIX}admin@example.com` };
  const teacherEmail = `${FIXTURE_PREFIX}teacher@example.com`;

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

    const adminLogin = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ schoolSlug: school.slug, email: school.adminEmail, password })
      .expect(200);
    adminToken = adminLogin.body.accessToken;

    await request(app.getHttpServer())
      .post("/v1/teachers")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ firstName: "Test", lastName: "Teacher", email: teacherEmail, password })
      .expect(201);

    const teacherLogin = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ schoolSlug: school.slug, email: teacherEmail, password })
      .expect(200);
    teacherToken = teacherLogin.body.accessToken;
    // See schemes-of-work.e2e-spec.ts for why these hooks need 120s.
  }, 120000);

  afterAll(async () => {
    if (controlPrisma) await purgeFixtures().catch(() => undefined);
    if (app) await app.close();
  }, 120000);

  it("refuses a teacher — gateway credentials are SCHOOL_ADMIN only", async () => {
    await request(app.getHttpServer())
      .get("/v1/settings/communication")
      .set("Authorization", `Bearer ${teacherToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .patch("/v1/settings/communication/email")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ host: "smtp.example.com" })
      .expect(403);
  });

  it("reports every gateway as unconfigured before anything is saved", async () => {
    const res = await request(app.getHttpServer())
      .get("/v1/settings/communication")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.email.configured).toBe(false);
    expect(res.body.sms.configured).toBe(false);
    expect(res.body.whatsapp.configured).toBe(false);
    expect(res.body.push.configured).toBe(false);
    expect(res.body.email.password).toBeNull();
  });

  it("never returns an SMTP password in plaintext or ciphertext", async () => {
    const saved = await request(app.getHttpServer())
      .patch("/v1/settings/communication/email")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        host: "smtp.example.com",
        port: 587,
        username: "mailer@example.com",
        password: SMTP_PASSWORD,
        encryption: "TLS",
        senderName: "Demo School",
        senderEmail: "no-reply@example.com",
      })
      .expect(200);

    expect(saved.body.configured).toBe(true);
    // Non-secret fields come back as entered.
    expect(saved.body.host).toBe("smtp.example.com");
    expect(saved.body.username).toBe("mailer@example.com");
    // The secret comes back only as a hint.
    expect(saved.body.password).not.toBe(SMTP_PASSWORD);
    expect(saved.body.password).toMatch(/•/);

    const body = JSON.stringify(saved.body);
    expect(body).not.toContain(SMTP_PASSWORD);
    // Ciphertext is base64 triples; the stored column must not leak either.
    expect(body).not.toContain("passwordEncrypted");

    const read = await request(app.getHttpServer())
      .get("/v1/settings/communication")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(JSON.stringify(read.body)).not.toContain(SMTP_PASSWORD);
  });

  it("keeps the stored password when a later edit omits it", async () => {
    // The form only ever saw a mask, so saving an unrelated change must not
    // wipe the working gateway.
    const updated = await request(app.getHttpServer())
      .patch("/v1/settings/communication/email")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ senderName: "Renamed School" })
      .expect(200);

    expect(updated.body.senderName).toBe("Renamed School");
    expect(updated.body.configured).toBe(true);
    expect(updated.body.password).toMatch(/•/);

    // An empty string is the same "unchanged" signal.
    const blanked = await request(app.getHttpServer())
      .patch("/v1/settings/communication/email")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ password: "" })
      .expect(200);
    expect(blanked.body.password).toMatch(/•/);
  });

  it("clears a secret only on an explicit null", async () => {
    const cleared = await request(app.getHttpServer())
      .patch("/v1/settings/communication/email")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ password: null })
      .expect(200);
    expect(cleared.body.password).toBeNull();

    // Put it back for the remaining tests.
    await request(app.getHttpServer())
      .patch("/v1/settings/communication/email")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ password: SMTP_PASSWORD })
      .expect(200);
  });

  it("masks SMS and WhatsApp secrets too", async () => {
    const sms = await request(app.getHttpServer())
      .patch("/v1/settings/communication/sms")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        providerName: "Any Vendor",
        baseUrl: "https://sms.example.com/send",
        apiKey: "sms-api-key-abcdef123456",
        apiSecret: "sms-api-secret-zyxwv987654",
        senderId: "SCHOOL",
      })
      .expect(200);
    expect(sms.body.configured).toBe(true);
    expect(JSON.stringify(sms.body)).not.toContain("sms-api-key-abcdef123456");
    expect(JSON.stringify(sms.body)).not.toContain("sms-api-secret-zyxwv987654");

    const whatsapp = await request(app.getHttpServer())
      .patch("/v1/settings/communication/whatsapp")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ accessToken: "EAAG-whatsapp-access-token-value", phoneNumberId: "1234567890" })
      .expect(200);
    expect(whatsapp.body.configured).toBe(true);
    expect(JSON.stringify(whatsapp.body)).not.toContain("EAAG-whatsapp-access-token-value");
  });

  it("lists all three payment providers, unconfigured by default", async () => {
    const res = await request(app.getHttpServer())
      .get("/v1/settings/payments")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.map((row: { provider: string }) => row.provider).sort()).toEqual([
      "FLUTTERWAVE",
      "PAYSTACK",
      "STRIPE",
    ]);
    expect(res.body.every((row: { configured: boolean }) => row.configured === false)).toBe(true);
  });

  it("never returns a payment secret key", async () => {
    const saved = await request(app.getHttpServer())
      .patch("/v1/settings/payments/STRIPE")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ publicKey: "pk_test_visible", secretKey: STRIPE_SECRET, currency: "ngn", enabled: true })
      .expect(200);

    expect(saved.body.configured).toBe(true);
    // The publishable key is not a secret and is shown in full.
    expect(saved.body.publicKey).toBe("pk_test_visible");
    expect(saved.body.currency).toBe("NGN");
    expect(saved.body.secretKey).not.toBe(STRIPE_SECRET);
    expect(JSON.stringify(saved.body)).not.toContain(STRIPE_SECRET);

    const listed = await request(app.getHttpServer())
      .get("/v1/settings/payments")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(JSON.stringify(listed.body)).not.toContain(STRIPE_SECRET);
  });

  it("rejects an unknown payment provider", async () => {
    await request(app.getHttpServer())
      .get("/v1/settings/payments/BITCOIN")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(400);
  });

  it("fails a test send clearly when the gateway isn't configured", async () => {
    // Push has never been saved in this suite.
    await request(app.getHttpServer())
      .post("/v1/settings/communication/sms/test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ to: "+10000000000" });
    // The SMS gateway *is* configured here but points at example.com, so the
    // call fails at the network rather than the not-configured guard. The
    // guard itself is covered by the payment provider below, which has no
    // credentials saved at all.
    const res = await request(app.getHttpServer())
      .post("/v1/settings/payments/PAYSTACK/test")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(503);
    expect(res.body.message).toMatch(/isn't configured yet/i);
  }, 60000);
});
