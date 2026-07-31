import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";

const FIXTURE_SLUG_PREFIX = "flwpp-fixture-";
const FIXTURE_EMAIL_PREFIX = "flwpp-fixture-";

/**
 * Webhook handling for Flutterwave and PayPal.
 *
 * Both need credentials configured for signature verification to run at all,
 * so this suite sets fake ones — and therefore must never call a path that
 * would make a real outbound request. Checkout initialisation is deliberately
 * not exercised here; the provider unit tests cover it with mocked responses.
 *
 * PayPal is the awkward one: it verifies signatures by *asking PayPal*, over
 * the network. That call is stubbed below. The stub is scoped to PayPal hosts
 * and delegates everything else to the real fetch, because Meilisearch runs on
 * fetch in this same process and a blanket stub would silently break indexing.
 */
const FLW_HASH = "flw_test_only_not_a_real_webhook_hash";
const PAYPAL_CREDENTIALS = {
  PAYPAL_CLIENT_ID: "test_client_id",
  PAYPAL_CLIENT_SECRET: "test_client_secret",
  PAYPAL_WEBHOOK_ID: "test_webhook_id",
};

/** What the stubbed PayPal verification endpoint should answer next. */
let paypalVerdict: "SUCCESS" | "FAILURE" | "network-error" = "SUCCESS";
const realFetch = global.fetch;

function installPayPalStub(): void {
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (!url.includes("paypal.com")) return realFetch(input as RequestInfo, init);

    if (url.includes("/v1/oauth2/token")) {
      return new Response(JSON.stringify({ access_token: "stub_token", expires_in: 3600 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("verify-webhook-signature")) {
      if (paypalVerdict === "network-error") throw new Error("ECONNREFUSED");
      return new Response(JSON.stringify({ verification_status: paypalVerdict }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Unexpected PayPal call in test: ${url}`);
  }) as typeof fetch;
}

function paypalHeaders(): Record<string, string> {
  return {
    "paypal-transmission-id": `txn_${Date.now()}`,
    "paypal-transmission-time": new Date().toISOString(),
    "paypal-transmission-sig": "stub-signature",
    "paypal-cert-url": "https://api.sandbox.paypal.com/cert",
    "paypal-auth-algo": "SHA256withRSA",
  };
}

async function purgeFixtures(prisma: PrismaService): Promise<void> {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: FIXTURE_EMAIL_PREFIX } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  if (userIds.length > 0) {
    const orders = await prisma.order.findMany({
      where: { userId: { in: userIds } },
      select: { id: true },
    });
    const orderIds = orders.map((o) => o.id);
    if (orderIds.length > 0) {
      await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
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
  await prisma.processedWebhookEvent.deleteMany({ where: { provider: { in: ["FLUTTERWAVE", "PAYPAL"] } } });
}

describe("Flutterwave and PayPal webhooks (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = Date.now();
  const password = "Fixture!Passw0rd";

  /** One order per provider, so a paid order in one suite half cannot mask the other. */
  const orders: Record<"flw" | "pp", { number: string; total: number }> = {
    flw: { number: "", total: 0 },
    pp: { number: "", total: 0 },
  };

  const post = (path: string) => request(app.getHttpServer()).post(path);

  async function createOrder(key: "flw" | "pp"): Promise<void> {
    const email = `${FIXTURE_EMAIL_PREFIX}${key}-${suffix}@wisdomshop.example`;
    const reg = await post("/v1/auth/register")
      .send({ email, password, firstName: "Fix", lastName: "Ture" })
      .expect(201);
    const auth = { Authorization: `Bearer ${reg.body.accessToken}` };

    const product = await prisma.product.create({
      data: {
        title: `Fixture ${key} ${suffix}`,
        slug: `${FIXTURE_SLUG_PREFIX}${key}-${suffix}`,
        description: "Digital item used by the Flutterwave/PayPal e2e suite.",
        type: "DIGITAL",
        status: "PUBLISHED",
        priceCents: 750000,
        currency: "NGN",
      },
    });

    await post("/v1/cart/items").set(auth).send({ productId: product.id, quantity: 1 }).expect(201);
    const order = await post("/v1/orders").set(auth).send({}).expect(201);
    orders[key] = { number: order.body.orderNumber, total: order.body.totalCents };
  }

  beforeAll(async () => {
    process.env.FLUTTERWAVE_SECRET_KEY = "FLWSECK_TEST-not-a-real-key";
    process.env.FLUTTERWAVE_WEBHOOK_HASH = FLW_HASH;
    Object.assign(process.env, PAYPAL_CREDENTIALS);
    installPayPalStub();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    // rawBody is required: signatures are computed over the exact bytes sent.
    app = moduleRef.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    await purgeFixtures(prisma);
    await createOrder("flw");
    await createOrder("pp");
  });

  afterAll(async () => {
    global.fetch = realFetch;
    if (prisma) await purgeFixtures(prisma).catch(() => undefined);
    if (app) await app.close();
    delete process.env.FLUTTERWAVE_SECRET_KEY;
    delete process.env.FLUTTERWAVE_WEBHOOK_HASH;
    for (const key of Object.keys(PAYPAL_CREDENTIALS)) delete process.env[key];
  });

  describe("Flutterwave", () => {
    /** Flutterwave amounts are MAJOR units — the whole point of the conversion. */
    function chargePayload(overrides: Record<string, unknown> = {}): string {
      return JSON.stringify({
        event: "charge.completed",
        data: {
          tx_ref: orders.flw.number,
          flw_ref: `FLW-${suffix}`,
          status: "successful",
          amount: orders.flw.total / 100,
          currency: "NGN",
          meta: { orderNumber: orders.flw.number },
          ...overrides,
        },
      });
    }

    const send = (payload: string, hash?: string) => {
      const req = post("/webhooks/flutterwave").set("Content-Type", "application/json");
      if (hash !== undefined) req.set("verif-hash", hash);
      return req.send(payload);
    };

    it("rejects a webhook with no verif-hash header", async () => {
      await send(chargePayload()).expect(400);

      const order = await prisma.order.findFirstOrThrow({ where: { orderNumber: orders.flw.number } });
      expect(order.status).toBe("PENDING");
    });

    it("rejects a wrong hash", async () => {
      await send(chargePayload(), "not-the-hash").expect(400);

      const order = await prisma.order.findFirstOrThrow({ where: { orderNumber: orders.flw.number } });
      expect(order.status).toBe("PENDING");
    });

    it("rejects a hash of a different length rather than crashing", async () => {
      // timingSafeEqual throws on length mismatch; a 500 here would mean the
      // length guard is gone.
      await send(chargePayload(), "x").expect(400);
    });

    it("refuses to mark paid when the amount does not match", async () => {
      const res = await send(chargePayload({ amount: 1, tx_ref: `flw_mismatch_${suffix}` }), FLW_HASH).expect(200);

      expect(res.body.handled).toBe(false);
      expect(res.body.reason).toMatch(/amount mismatch/i);

      const order = await prisma.order.findFirstOrThrow({ where: { orderNumber: orders.flw.number } });
      expect(order.status).toBe("PENDING");
    });

    it("ignores a charge.completed that did not actually succeed", async () => {
      // Flutterwave sends this event for failures too. Treating the event type
      // as success would mark failed payments paid.
      const res = await send(
        chargePayload({ status: "failed", tx_ref: `flw_failed_${suffix}` }),
        FLW_HASH,
      ).expect(200);

      expect(res.body.handled).toBe(false);
      expect(res.body.reason).toMatch(/charge status failed/i);

      const order = await prisma.order.findFirstOrThrow({ where: { orderNumber: orders.flw.number } });
      expect(order.status).toBe("PENDING");
    });

    it("marks the order paid on a valid successful charge", async () => {
      const res = await send(chargePayload(), FLW_HASH).expect(200);
      expect(res.body.handled).toBe(true);

      const order = await prisma.order.findFirstOrThrow({ where: { orderNumber: orders.flw.number } });
      expect(order.status).toBe("PAID");

      const payment = await prisma.payment.findFirstOrThrow({
        where: { orderId: order.id, provider: "FLUTTERWAVE" },
      });
      // Stored in minor units regardless of what the wire format used.
      expect(payment.amountCents).toBe(orders.flw.total);
    });

    it("treats a redelivered event as a no-op", async () => {
      const where = { provider: "FLUTTERWAVE" as const, order: { orderNumber: orders.flw.number } };
      const before = await prisma.payment.count({ where });

      const res = await send(chargePayload(), FLW_HASH).expect(200);

      expect(res.body.handled).toBe(false);
      expect(res.body.reason).toBe("duplicate");
      // Counted rather than asserted at a fixed number: earlier tests in this
      // block leave rows behind, and what matters is that the redelivery adds
      // none and does not charge the order twice.
      expect(await prisma.payment.count({ where })).toBe(before);
      expect(await prisma.payment.count({ where: { ...where, status: "SUCCEEDED" } })).toBe(1);
    });

    it("acknowledges an unhandled event type without failing", async () => {
      const payload = JSON.stringify({
        event: "transfer.completed",
        data: { tx_ref: `flw_transfer_${suffix}`, amount: 1 },
      });
      const res = await send(payload, FLW_HASH).expect(200);

      expect(res.body.handled).toBe(false);
      expect(res.body.reason).toMatch(/unhandled event type/i);
    });
  });

  describe("PayPal", () => {
    function capturePayload(overrides: Record<string, unknown> = {}): string {
      return JSON.stringify({
        id: `EV-${suffix}`,
        event_type: "PAYMENT.CAPTURE.COMPLETED",
        resource: {
          id: `CAP-${suffix}`,
          custom_id: orders.pp.number,
          amount: { value: (orders.pp.total / 100).toFixed(2), currency_code: "NGN" },
        },
        ...overrides,
      });
    }

    const send = (payload: string, headers: Record<string, string> = paypalHeaders()) =>
      post("/webhooks/paypal").set("Content-Type", "application/json").set(headers).send(payload);

    beforeEach(() => {
      paypalVerdict = "SUCCESS";
    });

    it("rejects a webhook with no transmission id", async () => {
      const headers = paypalHeaders();
      delete headers["paypal-transmission-id"];
      await send(capturePayload(), headers).expect(400);

      const order = await prisma.order.findFirstOrThrow({ where: { orderNumber: orders.pp.number } });
      expect(order.status).toBe("PENDING");
    });

    it("rejects the webhook when PayPal returns FAILURE", async () => {
      paypalVerdict = "FAILURE";
      await send(capturePayload()).expect(400);

      const order = await prisma.order.findFirstOrThrow({ where: { orderNumber: orders.pp.number } });
      expect(order.status).toBe("PENDING");
    });

    it("fails closed when PayPal is unreachable", async () => {
      // The property worth having: if verification cannot be performed, the
      // webhook is untrusted. The opposite would let anyone who can reach this
      // endpoint mark orders paid whenever PayPal is down.
      paypalVerdict = "network-error";
      await send(capturePayload()).expect(400);

      const order = await prisma.order.findFirstOrThrow({ where: { orderNumber: orders.pp.number } });
      expect(order.status).toBe("PENDING");
    });

    it("refuses to mark paid when the amount does not match", async () => {
      const payload = capturePayload({
        id: `EV-mismatch-${suffix}`,
        resource: {
          id: `CAP-mismatch-${suffix}`,
          custom_id: orders.pp.number,
          amount: { value: "1.00", currency_code: "NGN" },
        },
      });
      const res = await send(payload).expect(200);

      expect(res.body.handled).toBe(false);
      expect(res.body.reason).toMatch(/amount mismatch/i);

      const order = await prisma.order.findFirstOrThrow({ where: { orderNumber: orders.pp.number } });
      expect(order.status).toBe("PENDING");
    });

    it("marks the order paid on a verified capture", async () => {
      const res = await send(capturePayload()).expect(200);
      expect(res.body.handled).toBe(true);

      const order = await prisma.order.findFirstOrThrow({ where: { orderNumber: orders.pp.number } });
      expect(order.status).toBe("PAID");
    });

    it("treats a redelivered event id as a no-op", async () => {
      const where = { provider: "PAYPAL" as const, order: { orderNumber: orders.pp.number } };
      const before = await prisma.payment.count({ where });

      const res = await send(capturePayload()).expect(200);

      expect(res.body.handled).toBe(false);
      expect(res.body.reason).toBe("duplicate");
      expect(await prisma.payment.count({ where })).toBe(before);
      expect(await prisma.payment.count({ where: { ...where, status: "SUCCEEDED" } })).toBe(1);
    });

    it("acknowledges an unhandled event type without failing", async () => {
      const payload = capturePayload({
        id: `EV-other-${suffix}`,
        event_type: "PAYMENT.CAPTURE.PENDING",
      });
      const res = await send(payload).expect(200);

      expect(res.body.handled).toBe(false);
      expect(res.body.reason).toMatch(/unhandled event type/i);
    });
  });
});
