import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../src/prisma/prisma.service";
import { verifyHandoffToken } from "../src/licenses/edu-handoff";
import { buildCheckoutCompletedEvent, signStripePayload } from "./stripe-signature";

const FIXTURE_PREFIX = "licenses-fixture-";
const TEST_WEBHOOK_SECRET = "whsec_test_only_not_a_real_secret";
/**
 * Read from the running app rather than assumed: `.env` may already define
 * EDU_SETUP_SIGNING_SECRET, and a non-empty value there takes precedence over
 * anything the test puts in process.env. Verifying with the secret the app
 * actually signed with is both correct and what the real EMS portal does.
 */
let eduSecret: string;

async function purgeFixtures(prisma: PrismaService): Promise<void> {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: FIXTURE_PREFIX } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  if (userIds.length > 0) {
    await prisma.license.deleteMany({ where: { userId: { in: userIds } } });
    const orders = await prisma.order.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
    const orderIds = orders.map((o) => o.id);
    if (orderIds.length > 0) {
      await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    }
  }

  const stale = await prisma.product.findMany({
    where: { slug: { startsWith: FIXTURE_PREFIX } },
    select: { id: true },
  });
  if (stale.length > 0) {
    const ids = stale.map((p) => p.id);
    await prisma.license.deleteMany({ where: { productId: { in: ids } } });
    await prisma.orderItem.deleteMany({ where: { productId: { in: ids } } });
    await prisma.cartItem.deleteMany({ where: { productId: { in: ids } } });
    await prisma.product.deleteMany({ where: { id: { in: ids } } });
  }

  await prisma.user.deleteMany({ where: { email: { startsWith: FIXTURE_PREFIX } } });
  await prisma.processedWebhookEvent.deleteMany({ where: { eventId: { startsWith: "evt_lic_" } } });
}

describe("Licenses & EMS handoff (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = Date.now();
  const buyerEmail = `${FIXTURE_PREFIX}buyer-${suffix}@wisdomshop.example`;
  const otherEmail = `${FIXTURE_PREFIX}other-${suffix}@wisdomshop.example`;
  const password = "Sup3rSecret!Pass";

  let buyerToken: string;
  let otherToken: string;
  let softwareProductId: string;
  let bookProductId: string;
  let orderNumber: string;
  let orderId: string;
  let orderTotal: number;
  let licenseKey: string;

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const http = () => request(app.getHttpServer());

  function sendStripeWebhook(payload: string) {
    return http()
      .post("/webhooks/stripe")
      .set("stripe-signature", signStripePayload(payload, TEST_WEBHOOK_SECRET))
      .set("Content-Type", "application/json")
      .send(payload);
  }

  beforeAll(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
    delete process.env.STRIPE_SECRET_KEY;

    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    eduSecret = app.get(ConfigService).get<string>("EDU_SETUP_SIGNING_SECRET")!;

    await purgeFixtures(prisma);

    const reg = await http()
      .post("/v1/auth/register")
      .send({ email: buyerEmail, password, firstName: "Lic", lastName: "Buyer" });
    buyerToken = reg.body.accessToken;

    const otherReg = await http()
      .post("/v1/auth/register")
      .send({ email: otherEmail, password, firstName: "Lic", lastName: "Other" });
    otherToken = otherReg.body.accessToken;

    const software = await prisma.product.create({
      data: {
        title: `School Management System ${suffix}`,
        slug: `${FIXTURE_PREFIX}sms-${suffix}`,
        description: "A licensable school management system.",
        type: "SOFTWARE",
        status: "PUBLISHED",
        priceCents: 49900,
      },
    });
    softwareProductId = software.id;

    // A non-licensable item in the same order, to prove only the right lines
    // produce keys.
    const book = await prisma.product.create({
      data: {
        title: `Plain Book ${suffix}`,
        slug: `${FIXTURE_PREFIX}book-${suffix}`,
        description: "A digital book, which is a download and not a license.",
        type: "DIGITAL",
        status: "PUBLISHED",
        priceCents: 1000,
      },
    });
    bookProductId = book.id;

    await http()
      .post("/v1/cart/items")
      .set(auth(buyerToken))
      .send({ productId: softwareProductId, quantity: 3 })
      .expect(201);
    await http()
      .post("/v1/cart/items")
      .set(auth(buyerToken))
      .send({ productId: bookProductId, quantity: 1 })
      .expect(201);

    const order = await http().post("/v1/orders").set(auth(buyerToken)).send({}).expect(201);
    orderNumber = order.body.orderNumber;
    orderId = order.body.id;
    orderTotal = order.body.totalCents;
  });

  afterAll(async () => {
    if (prisma) await purgeFixtures(prisma).catch(() => undefined);
    if (app) await app.close();
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  it("issues no licenses before payment", async () => {
    const res = await http().get("/v1/licenses").set(auth(buyerToken)).expect(200);
    expect(res.body).toHaveLength(0);
  });

  it("issues a license only for the licensable line once payment lands", async () => {
    const payload = buildCheckoutCompletedEvent({
      eventId: `evt_lic_success_${suffix}`,
      sessionId: `cs_lic_${suffix}`,
      orderNumber,
      amountTotal: orderTotal,
    });
    const res = await sendStripeWebhook(payload).expect(200);
    expect(res.body.handled).toBe(true);

    const licenses = await prisma.license.findMany({ where: { orderId } });
    // Software line only — the digital book is a download, not a license.
    expect(licenses).toHaveLength(1);
    expect(licenses[0]!.productId).toBe(softwareProductId);
    // Quantity 3 becomes 3 seats on one key, not 3 keys.
    expect(licenses[0]!.seats).toBe(3);
    expect(licenses[0]!.status).toBe("ACTIVE");
    expect(licenses[0]!.key).toMatch(/^WS-[0-9A-Z]{5}(-[0-9A-Z]{5}){3}$/);
    licenseKey = licenses[0]!.key;
  });

  it("does not mint a second key when the webhook is redelivered", async () => {
    // Same payment, new event id — this is a genuine provider retry, not a
    // duplicate-event no-op, so it exercises the license idempotency guard
    // rather than the webhook ledger.
    const payload = buildCheckoutCompletedEvent({
      eventId: `evt_lic_redelivery_${suffix}`,
      sessionId: `cs_lic_${suffix}`,
      orderNumber,
      amountTotal: orderTotal,
    });
    await sendStripeWebhook(payload).expect(200);

    const licenses = await prisma.license.findMany({ where: { orderId } });
    expect(licenses).toHaveLength(1);
    expect(licenses[0]!.key).toBe(licenseKey);
  });

  it("lists the license for its owner", async () => {
    const res = await http().get("/v1/licenses").set(auth(buyerToken)).expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].key).toBe(licenseKey);
    expect(res.body[0].product.id).toBe(softwareProductId);
    expect(res.body[0].order.orderNumber).toBe(orderNumber);
  });

  it("does not expose a license to another customer", async () => {
    await http().get(`/v1/licenses/${licenseKey}`).set(auth(otherToken)).expect(404);
    const theirs = await http().get("/v1/licenses").set(auth(otherToken)).expect(200);
    expect(theirs.body).toHaveLength(0);
  });

  it("requires authentication", async () => {
    await http().get("/v1/licenses").expect(401);
    await http().post(`/v1/licenses/${licenseKey}/setup-handoff`).expect(401);
  });

  it("returns a Complete Your School Setup redirect with a verifiable token", async () => {
    const res = await http()
      .post(`/v1/licenses/${licenseKey}/setup-handoff`)
      .set(auth(buyerToken))
      .expect(201);

    expect(res.body.redirectUrl).toContain("token=");
    const token = new URL(res.body.redirectUrl).searchParams.get("token")!;

    // Verified exactly as the separate EMS portal would, with only the shared
    // secret — no callback into this API.
    const payload = verifyHandoffToken(token, eduSecret);
    expect(payload.k).toBe(licenseKey);
    expect(payload.p).toBe(softwareProductId);
    expect(payload.o).toBe(orderId);
    expect(payload.exp * 1000).toBeGreaterThan(Date.now());
  });

  it("issues a handoff token that a wrong secret cannot verify", async () => {
    const res = await http()
      .post(`/v1/licenses/${licenseKey}/setup-handoff`)
      .set(auth(buyerToken))
      .expect(201);
    const token = new URL(res.body.redirectUrl).searchParams.get("token")!;

    expect(() => verifyHandoffToken(token, "a_different_secret_at_least_32_chars_")).toThrow();
  });

  it("does not let another customer create a handoff for this license", async () => {
    await http().post(`/v1/licenses/${licenseKey}/setup-handoff`).set(auth(otherToken)).expect(404);
  });

  it("refuses a handoff once the license is revoked", async () => {
    await prisma.license.update({ where: { key: licenseKey }, data: { status: "REVOKED" } });

    await http()
      .post(`/v1/licenses/${licenseKey}/setup-handoff`)
      .set(auth(buyerToken))
      .expect(400);

    await prisma.license.update({ where: { key: licenseKey }, data: { status: "ACTIVE" } });
  });

  it("refuses a handoff for an expired license", async () => {
    await prisma.license.update({
      where: { key: licenseKey },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await http()
      .post(`/v1/licenses/${licenseKey}/setup-handoff`)
      .set(auth(buyerToken))
      .expect(400);

    await prisma.license.update({ where: { key: licenseKey }, data: { expiresAt: null } });
  });

  it("keeps license revocation away from ordinary customers", async () => {
    await http().patch(`/v1/admin/licenses/${licenseKey}/revoke`).set(auth(buyerToken)).expect(403);
  });
});
