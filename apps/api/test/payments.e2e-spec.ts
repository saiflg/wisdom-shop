import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  buildChargeRefundedEvent,
  buildCheckoutCompletedEvent,
  signStripePayload,
} from "./stripe-signature";

const FIXTURE_SLUG_PREFIX = "payments-fixture-";
const FIXTURE_EMAIL_PREFIX = "payments-fixture-";

/**
 * The suite sets STRIPE_WEBHOOK_SECRET before the app boots so signature
 * verification is exercised for real. No secret key is set, so no code path
 * here ever reaches Stripe over the network.
 */
const TEST_WEBHOOK_SECRET = "whsec_test_only_not_a_real_secret";

async function purgeFixtures(prisma: PrismaService): Promise<void> {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: FIXTURE_EMAIL_PREFIX } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  if (userIds.length > 0) {
    const orders = await prisma.order.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
    const orderIds = orders.map((o) => o.id);
    if (orderIds.length > 0) {
      await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    }
  }

  const stale = await prisma.product.findMany({
    where: { slug: { startsWith: FIXTURE_SLUG_PREFIX } },
    select: { id: true },
  });
  if (stale.length > 0) {
    const ids = stale.map((p) => p.id);
    await prisma.orderItem.deleteMany({ where: { productId: { in: ids } } });
    await prisma.cartItem.deleteMany({ where: { productId: { in: ids } } });
    await prisma.product.deleteMany({ where: { id: { in: ids } } });
  }

  await prisma.user.deleteMany({ where: { email: { startsWith: FIXTURE_EMAIL_PREFIX } } });
  await prisma.processedWebhookEvent.deleteMany({ where: { eventId: { startsWith: "evt_test_" } } });
}

describe("Payments (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = Date.now();
  const email = `${FIXTURE_EMAIL_PREFIX}${suffix}@wisdomshop.example`;
  const otherEmail = `${FIXTURE_EMAIL_PREFIX}other-${suffix}@wisdomshop.example`;
  const password = "Sup3rSecret!Pass";

  let token: string;
  let otherToken: string;
  let productId: string;
  let orderNumber: string;
  let orderTotal: number;

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const post = (path: string) => request(app.getHttpServer()).post(path);

  function sendWebhook(payload: string, signature: string) {
    return post("/webhooks/stripe")
      .set("stripe-signature", signature)
      .set("Content-Type", "application/json")
      .send(payload);
  }

  beforeAll(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
    // Ensure no secret key leaks in from the environment — this suite must
    // never be able to contact Stripe.
    delete process.env.STRIPE_SECRET_KEY;

    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    await purgeFixtures(prisma);

    const reg = await post("/v1/auth/register").send({
      email,
      password,
      firstName: "Pay",
      lastName: "Test",
    });
    token = reg.body.accessToken;

    const otherReg = await post("/v1/auth/register").send({
      email: otherEmail,
      password,
      firstName: "Other",
      lastName: "Test",
    });
    otherToken = otherReg.body.accessToken;

    const product = await prisma.product.create({
      data: {
        title: `Payments Fixture ${suffix}`,
        slug: `${FIXTURE_SLUG_PREFIX}${suffix}`,
        description: "Digital item used by the payments e2e suite.",
        type: "DIGITAL",
        status: "PUBLISHED",
        priceCents: 4200,
      },
    });
    productId = product.id;

    await post("/v1/cart/items").set(auth(token)).send({ productId, quantity: 1 }).expect(201);
    const order = await post("/v1/orders").set(auth(token)).send({}).expect(201);
    orderNumber = order.body.orderNumber;
    orderTotal = order.body.totalCents;
  });

  afterAll(async () => {
    if (prisma) await purgeFixtures(prisma).catch(() => undefined);
    if (app) await app.close();
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  it("reports Stripe as unconfigured when no secret key is set", async () => {
    const res = await request(app.getHttpServer())
      .get("/v1/payments/providers")
      .set(auth(token))
      .expect(200);

    // Asserted by membership rather than exact array equality: adding a
    // provider is a legitimate change that shouldn't break this test, but
    // "Stripe reports itself unconfigured" must keep holding.
    expect(res.body).toEqual(
      expect.arrayContaining([{ provider: "STRIPE", configured: false }]),
    );
    // Nothing may claim to be configured — this suite sets no provider keys.
    expect(res.body.every((p: { configured: boolean }) => p.configured === false)).toBe(true);
  });

  it("returns 503 rather than a confusing SDK error when initiating without a key", async () => {
    await post(`/v1/payments/stripe/checkout/${orderNumber}`).set(auth(token)).expect(503);
  });

  it("does not let another user start payment for someone else's order", async () => {
    await post(`/v1/payments/stripe/checkout/${orderNumber}`).set(auth(otherToken)).expect(404);
  });

  it("rejects a webhook with no signature header", async () => {
    const payload = buildCheckoutCompletedEvent({
      eventId: `evt_test_nosig_${suffix}`,
      sessionId: `cs_test_${suffix}`,
      orderNumber,
      amountTotal: orderTotal,
    });

    await post("/webhooks/stripe").set("Content-Type", "application/json").send(payload).expect(400);
  });

  it("rejects a webhook whose signature does not match the payload", async () => {
    const payload = buildCheckoutCompletedEvent({
      eventId: `evt_test_badsig_${suffix}`,
      sessionId: `cs_test_${suffix}`,
      orderNumber,
      amountTotal: orderTotal,
    });
    const signature = signStripePayload(payload, "whsec_the_wrong_secret");

    await sendWebhook(payload, signature).expect(400);

    // The order must be untouched by a forged webhook.
    const order = await prisma.order.findFirstOrThrow({ where: { orderNumber } });
    expect(order.status).toBe("PENDING");
  });

  it("rejects a correctly-signed payload that was then tampered with", async () => {
    const payload = buildCheckoutCompletedEvent({
      eventId: `evt_test_tamper_${suffix}`,
      sessionId: `cs_test_${suffix}`,
      orderNumber,
      amountTotal: orderTotal,
    });
    const signature = signStripePayload(payload, TEST_WEBHOOK_SECRET);
    const tampered = payload.replace(`"amount_total":${orderTotal}`, `"amount_total":1`);

    await sendWebhook(tampered, signature).expect(400);

    const order = await prisma.order.findFirstOrThrow({ where: { orderNumber } });
    expect(order.status).toBe("PENDING");
  });

  it("rejects a stale signature outside Stripe's timestamp tolerance", async () => {
    const payload = buildCheckoutCompletedEvent({
      eventId: `evt_test_stale_${suffix}`,
      sessionId: `cs_test_${suffix}`,
      orderNumber,
      amountTotal: orderTotal,
    });
    // Two hours old — well outside the default 5-minute tolerance.
    const staleTimestamp = Math.floor(Date.now() / 1000) - 7200;
    const signature = signStripePayload(payload, TEST_WEBHOOK_SECRET, staleTimestamp);

    await sendWebhook(payload, signature).expect(400);
  });

  it("refuses to mark an order paid when the amount does not match", async () => {
    const payload = buildCheckoutCompletedEvent({
      eventId: `evt_test_mismatch_${suffix}`,
      sessionId: `cs_test_mismatch_${suffix}`,
      orderNumber,
      amountTotal: 1, // paid 1 cent for a 4200 cent order
    });
    const signature = signStripePayload(payload, TEST_WEBHOOK_SECRET);

    const res = await sendWebhook(payload, signature).expect(200);
    expect(res.body.handled).toBe(false);
    expect(res.body.reason).toMatch(/amount mismatch/i);

    const order = await prisma.order.findFirstOrThrow({ where: { orderNumber } });
    expect(order.status).toBe("PENDING");

    const payments = await prisma.payment.findMany({ where: { orderId: order.id } });
    expect(payments.some((p) => p.status === "FAILED")).toBe(true);
  });

  it("marks the order paid on a valid, correctly-signed success event", async () => {
    const payload = buildCheckoutCompletedEvent({
      eventId: `evt_test_success_${suffix}`,
      sessionId: `cs_test_success_${suffix}`,
      orderNumber,
      amountTotal: orderTotal,
    });
    const signature = signStripePayload(payload, TEST_WEBHOOK_SECRET);

    const res = await sendWebhook(payload, signature).expect(200);
    expect(res.body.handled).toBe(true);

    const order = await prisma.order.findFirstOrThrow({ where: { orderNumber } });
    expect(order.status).toBe("PAID");

    const payment = await prisma.payment.findFirstOrThrow({
      where: { orderId: order.id, providerRef: `cs_test_success_${suffix}` },
    });
    expect(payment.status).toBe("SUCCEEDED");
    expect(payment.amountCents).toBe(orderTotal);
  });

  it("treats a redelivered event as a no-op (idempotency)", async () => {
    // Same event id as the previous test — Stripe retries look exactly like this.
    const payload = buildCheckoutCompletedEvent({
      eventId: `evt_test_success_${suffix}`,
      sessionId: `cs_test_success_${suffix}`,
      orderNumber,
      amountTotal: orderTotal,
    });
    const signature = signStripePayload(payload, TEST_WEBHOOK_SECRET);

    const res = await sendWebhook(payload, signature).expect(200);
    expect(res.body.handled).toBe(false);
    expect(res.body.reason).toBe("duplicate");

    // Exactly one payment row for this session, not two.
    const order = await prisma.order.findFirstOrThrow({ where: { orderNumber } });
    const payments = await prisma.payment.findMany({
      where: { orderId: order.id, providerRef: `cs_test_success_${suffix}` },
    });
    expect(payments).toHaveLength(1);
  });

  it("refuses to start a new payment for an already-paid order", async () => {
    // 409 (not 503) proves the status check runs before the missing-key check.
    await post(`/v1/payments/stripe/checkout/${orderNumber}`).set(auth(token)).expect(409);
  });

  it("marks the order refunded on a valid refund event", async () => {
    const payload = buildChargeRefundedEvent({
      eventId: `evt_test_refund_${suffix}`,
      chargeId: `ch_test_${suffix}`,
      orderNumber,
    });
    const signature = signStripePayload(payload, TEST_WEBHOOK_SECRET);

    const res = await sendWebhook(payload, signature).expect(200);
    expect(res.body.handled).toBe(true);

    const order = await prisma.order.findFirstOrThrow({ where: { orderNumber } });
    expect(order.status).toBe("REFUNDED");
  });

  it("does not resurrect a refunded order via a late success webhook", async () => {
    // The scenario the transition table exists for: a delayed or replayed
    // success event arriving after the order was refunded.
    const payload = buildCheckoutCompletedEvent({
      eventId: `evt_test_late_${suffix}`,
      sessionId: `cs_test_late_${suffix}`,
      orderNumber,
      amountTotal: orderTotal,
    });
    const signature = signStripePayload(payload, TEST_WEBHOOK_SECRET);

    const res = await sendWebhook(payload, signature).expect(200);
    expect(res.body.handled).toBe(false);
    expect(res.body.reason).toMatch(/illegal transition/i);

    const order = await prisma.order.findFirstOrThrow({ where: { orderNumber } });
    expect(order.status).toBe("REFUNDED");
  });

  it("acknowledges an unhandled event type without failing", async () => {
    const payload = JSON.stringify({
      id: `evt_test_other_${suffix}`,
      object: "event",
      type: "customer.created",
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: "cus_test", object: "customer" } },
    });
    const signature = signStripePayload(payload, TEST_WEBHOOK_SECRET);

    const res = await sendWebhook(payload, signature).expect(200);
    expect(res.body.handled).toBe(false);
    expect(res.body.reason).toMatch(/unhandled event type/i);
  });

  it("keeps payment listings scoped to the owning user", async () => {
    await request(app.getHttpServer())
      .get(`/v1/payments/${orderNumber}`)
      .set(auth(otherToken))
      .expect(404);

    const res = await request(app.getHttpServer())
      .get(`/v1/payments/${orderNumber}`)
      .set(auth(token))
      .expect(200);

    expect(res.body.length).toBeGreaterThan(0);
    // rawWebhook holds provider payloads and must not be exposed.
    expect(res.body[0].rawWebhook).toBeUndefined();
  });
});
