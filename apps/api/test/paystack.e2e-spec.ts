import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  buildPaystackChargeSuccess,
  buildPaystackRefund,
  signPaystackPayload,
} from "./paystack-signature";

const FIXTURE_SLUG_PREFIX = "paystack-fixture-";
const FIXTURE_EMAIL_PREFIX = "paystack-fixture-";

/**
 * Paystack signs with the SECRET KEY itself, so verifying signatures requires
 * PAYSTACK_SECRET_KEY to be set. That means this suite must set a fake key —
 * and therefore must never let a code path make a real outbound call. Only
 * webhook handling is exercised here; transaction initialisation (the one
 * path that would contact Paystack) is deliberately not called.
 */
const TEST_SECRET_KEY = "sk_test_only_not_a_real_paystack_key";

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
      await prisma.refund.deleteMany({ where: { orderId: { in: orderIds } } });
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
  await prisma.processedWebhookEvent.deleteMany({ where: { provider: "PAYSTACK" } });
}

describe("Paystack payments (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = Date.now();
  const email = `${FIXTURE_EMAIL_PREFIX}${suffix}@wisdomshop.example`;
  const password = "Sup3rSecret!Pass";

  let token: string;
  let orderNumber: string;
  let orderTotal: number;

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const post = (path: string) => request(app.getHttpServer()).post(path);

  function sendWebhook(payload: string, signature: string) {
    return post("/webhooks/paystack")
      .set("x-paystack-signature", signature)
      .set("Content-Type", "application/json")
      .send(payload);
  }

  beforeAll(async () => {
    process.env.PAYSTACK_SECRET_KEY = TEST_SECRET_KEY;

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
      lastName: "Stack",
    });
    token = reg.body.accessToken;

    const product = await prisma.product.create({
      data: {
        title: `Paystack Fixture ${suffix}`,
        slug: `${FIXTURE_SLUG_PREFIX}${suffix}`,
        description: "Digital item used by the Paystack e2e suite.",
        type: "DIGITAL",
        status: "PUBLISHED",
        priceCents: 750000, // ₦7,500.00 in kobo
        currency: "NGN",
      },
    });

    await post("/v1/cart/items").set(auth()).send({ productId: product.id, quantity: 1 }).expect(201);
    const order = await post("/v1/orders").set(auth()).send({}).expect(201);
    orderNumber = order.body.orderNumber;
    orderTotal = order.body.totalCents;
  });

  afterAll(async () => {
    if (prisma) await purgeFixtures(prisma).catch(() => undefined);
    if (app) await app.close();
    delete process.env.PAYSTACK_SECRET_KEY;
  });

  it("reports Paystack as configured", async () => {
    const res = await request(app.getHttpServer())
      .get("/v1/payments/providers")
      .set(auth())
      .expect(200);

    const paystack = res.body.find((p: { provider: string }) => p.provider === "PAYSTACK");
    expect(paystack.configured).toBe(true);
  });

  it("rejects a webhook with no signature header", async () => {
    const payload = buildPaystackChargeSuccess({
      reference: `ref_nosig_${suffix}`,
      orderNumber,
      amountMinorUnits: orderTotal,
    });

    await post("/webhooks/paystack").set("Content-Type", "application/json").send(payload).expect(400);
  });

  it("rejects a signature made with the wrong key", async () => {
    const payload = buildPaystackChargeSuccess({
      reference: `ref_badkey_${suffix}`,
      orderNumber,
      amountMinorUnits: orderTotal,
    });

    await sendWebhook(payload, signPaystackPayload(payload, "sk_test_wrong_key")).expect(400);

    const order = await prisma.order.findFirstOrThrow({ where: { orderNumber } });
    expect(order.status).toBe("PENDING");
  });

  it("rejects a SHA256 signature (Paystack uses SHA512)", async () => {
    // Guards against the copy-paste failure mode of reusing Stripe's scheme.
    const payload = buildPaystackChargeSuccess({
      reference: `ref_sha256_${suffix}`,
      orderNumber,
      amountMinorUnits: orderTotal,
    });
    const { createHmac } = await import("node:crypto");
    const sha256Sig = createHmac("sha256", TEST_SECRET_KEY).update(payload, "utf8").digest("hex");

    await sendWebhook(payload, sha256Sig).expect(400);
  });

  it("rejects a payload tampered with after signing", async () => {
    const payload = buildPaystackChargeSuccess({
      reference: `ref_tamper_${suffix}`,
      orderNumber,
      amountMinorUnits: orderTotal,
    });
    const signature = signPaystackPayload(payload, TEST_SECRET_KEY);
    const tampered = payload.replace(`"amount":${orderTotal}`, `"amount":1`);

    await sendWebhook(tampered, signature).expect(400);

    const order = await prisma.order.findFirstOrThrow({ where: { orderNumber } });
    expect(order.status).toBe("PENDING");
  });

  it("refuses to mark paid when the amount does not match", async () => {
    const payload = buildPaystackChargeSuccess({
      reference: `ref_mismatch_${suffix}`,
      orderNumber,
      amountMinorUnits: 100,
    });
    const res = await sendWebhook(payload, signPaystackPayload(payload, TEST_SECRET_KEY)).expect(200);

    expect(res.body.handled).toBe(false);
    expect(res.body.reason).toMatch(/amount mismatch/i);

    const order = await prisma.order.findFirstOrThrow({ where: { orderNumber } });
    expect(order.status).toBe("PENDING");
  });

  it("marks the order paid on a valid charge.success", async () => {
    const payload = buildPaystackChargeSuccess({
      reference: `ref_success_${suffix}`,
      orderNumber,
      amountMinorUnits: orderTotal,
    });
    const res = await sendWebhook(payload, signPaystackPayload(payload, TEST_SECRET_KEY)).expect(200);

    expect(res.body.handled).toBe(true);

    const order = await prisma.order.findFirstOrThrow({ where: { orderNumber } });
    expect(order.status).toBe("PAID");

    // Scoped to this reference: an earlier test deliberately leaves a FAILED
    // payment row (the amount-mismatch attempt) against the same order, and
    // an unscoped lookup would pick that one up instead.
    const payment = await prisma.payment.findFirstOrThrow({
      where: { orderId: order.id, provider: "PAYSTACK", providerRef: `ref_success_${suffix}` },
    });
    expect(payment.status).toBe("SUCCEEDED");
    expect(payment.amountCents).toBe(orderTotal);
  });

  it("treats a redelivered event as a no-op", async () => {
    // Paystack has no event id, so idempotency keys on event type + reference.
    const payload = buildPaystackChargeSuccess({
      reference: `ref_success_${suffix}`,
      orderNumber,
      amountMinorUnits: orderTotal,
    });
    const res = await sendWebhook(payload, signPaystackPayload(payload, TEST_SECRET_KEY)).expect(200);

    expect(res.body.handled).toBe(false);
    expect(res.body.reason).toBe("duplicate");

    // The idempotency claim is "this reference produced exactly one payment
    // row", not "the order has exactly one row" — the order legitimately also
    // carries the FAILED row from the amount-mismatch test.
    const order = await prisma.order.findFirstOrThrow({ where: { orderNumber } });
    const payments = await prisma.payment.findMany({
      where: { orderId: order.id, provider: "PAYSTACK", providerRef: `ref_success_${suffix}` },
    });
    expect(payments).toHaveLength(1);
    expect(payments[0]!.status).toBe("SUCCEEDED");
  });

  it("marks the order refunded, then refuses a late success", async () => {
    const refundPayload = buildPaystackRefund({ reference: `ref_success_${suffix}`, orderNumber });
    const refundRes = await sendWebhook(
      refundPayload,
      signPaystackPayload(refundPayload, TEST_SECRET_KEY),
    ).expect(200);
    expect(refundRes.body.handled).toBe(true);

    const refunded = await prisma.order.findFirstOrThrow({ where: { orderNumber } });
    expect(refunded.status).toBe("REFUNDED");

    // A late/replayed success must not resurrect a refunded order.
    const latePayload = buildPaystackChargeSuccess({
      reference: `ref_late_${suffix}`,
      orderNumber,
      amountMinorUnits: orderTotal,
    });
    const lateRes = await sendWebhook(
      latePayload,
      signPaystackPayload(latePayload, TEST_SECRET_KEY),
    ).expect(200);

    expect(lateRes.body.handled).toBe(false);
    expect(lateRes.body.reason).toMatch(/illegal transition/i);

    const stillRefunded = await prisma.order.findFirstOrThrow({ where: { orderNumber } });
    expect(stillRefunded.status).toBe("REFUNDED");
  });

  it("acknowledges an unhandled event type without failing", async () => {
    const payload = JSON.stringify({
      event: "customeridentification.success",
      data: { reference: `ref_other_${suffix}` },
    });
    const res = await sendWebhook(payload, signPaystackPayload(payload, TEST_SECRET_KEY)).expect(200);

    expect(res.body.handled).toBe(false);
    expect(res.body.reason).toMatch(/unhandled event type/i);
  });
});
