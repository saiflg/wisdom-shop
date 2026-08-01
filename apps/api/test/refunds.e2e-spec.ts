import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";

const FIXTURE_PREFIX = "refund-fixture-";
const PAYSTACK_KEY = "sk_test_only_not_a_real_paystack_key";

/**
 * Refunds end to end.
 *
 * Paystack is the provider under test because its refund is a single HTTP
 * call, which keeps the stub honest. The stub is scoped to Paystack's host
 * and delegates everything else to the real fetch — Meilisearch runs on fetch
 * in this same process, and a blanket stub would break indexing silently.
 *
 * What is being checked here is not "does Paystack work" — it cannot be —
 * but that our ledger, balance arithmetic and order state stay correct
 * across partial refunds, retries, races and provider refusals.
 */
type StubBehaviour =
  | { kind: "ok"; refundId?: string; status?: string }
  | { kind: "refuse"; message: string }
  | { kind: "network-error" };

let paystackBehaviour: StubBehaviour = { kind: "ok" };
let paystackCalls: { amount: number; transaction: string }[] = [];
const realFetch = global.fetch;

function installPaystackStub(): void {
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (!url.includes("api.paystack.co")) return realFetch(input as RequestInfo, init);

    if (url.endsWith("/refund")) {
      const body = JSON.parse((init?.body as string) ?? "{}");
      paystackCalls.push({ amount: body.amount, transaction: body.transaction });

      if (paystackBehaviour.kind === "network-error") throw new Error("ECONNRESET");
      if (paystackBehaviour.kind === "refuse") {
        return jsonResponse({ status: false, message: paystackBehaviour.message });
      }
      return jsonResponse({
        status: true,
        message: "ok",
        data: { id: paystackBehaviour.refundId ?? "rf_1", status: paystackBehaviour.status ?? "processed" },
      });
    }
    throw new Error(`Unexpected Paystack call in test: ${url}`);
  }) as typeof fetch;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function purgeFixtures(prisma: PrismaService): Promise<void> {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: FIXTURE_PREFIX } },
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
      await prisma.refund.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    }
  }

  const stale = await prisma.product.findMany({
    where: { slug: { startsWith: FIXTURE_PREFIX } },
    select: { id: true },
  });
  if (stale.length > 0) {
    const ids = stale.map((p) => p.id);
    await prisma.orderItem.deleteMany({ where: { productId: { in: ids } } });
    await prisma.cartItem.deleteMany({ where: { productId: { in: ids } } });
    await prisma.product.deleteMany({ where: { id: { in: ids } } });
  }

  await prisma.user.deleteMany({ where: { email: { startsWith: FIXTURE_PREFIX } } });
}

describe("Refunds (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const suffix = Date.now();
  const password = "Sup3rSecret!Pass";
  const adminEmail = `${FIXTURE_PREFIX}admin-${suffix}@wisdomshop.example`;
  const supportEmail = `${FIXTURE_PREFIX}support-${suffix}@wisdomshop.example`;

  let adminToken: string;
  let supportToken: string;

  const http = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  /** The paid order under test. Each test that mutates one makes its own. */
  const ORDER_CENTS = 750000;

  async function grantRole(userId: string, name: "ADMIN" | "SUPPORT"): Promise<void> {
    const role = await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
    await prisma.userRole.create({ data: { userId, roleId: role.id } });
  }

  async function registerWithRole(email: string, role: "ADMIN" | "SUPPORT"): Promise<string> {
    const reg = await http()
      .post("/v1/auth/register")
      .send({ email, password, firstName: "Ref", lastName: "Und" })
      .expect(201);
    await grantRole(reg.body.user.id, role);
    const login = await http().post("/v1/auth/login").send({ email, password }).expect(200);
    return login.body.accessToken;
  }

  /**
   * A paid order with a Paystack payment behind it — the state a successful
   * webhook leaves, created directly so the test is about refunding rather
   * than about paying.
   */
  async function createPaidOrder(tag: string): Promise<string> {
    // "buyer-" namespaced so a tag can never collide with a staff fixture
    // email — "support" did exactly that.
    const email = `${FIXTURE_PREFIX}buyer-${tag}-${suffix}@wisdomshop.example`;
    const reg = await http()
      .post("/v1/auth/register")
      .send({ email, password, firstName: "Buy", lastName: "Er" })
      .expect(201);
    const token = reg.body.accessToken;

    const product = await prisma.product.create({
      data: {
        title: `Refund Fixture ${tag} ${suffix}`,
        slug: `${FIXTURE_PREFIX}${tag}-${suffix}`,
        description: "Digital item used by the refunds e2e suite.",
        type: "DIGITAL",
        status: "PUBLISHED",
        priceCents: ORDER_CENTS,
        currency: "NGN",
      },
    });

    await http()
      .post("/v1/cart/items")
      .set(auth(token))
      .send({ productId: product.id, quantity: 1 })
      .expect(201);
    const order = await http().post("/v1/orders").set(auth(token)).send({}).expect(201);

    await prisma.order.update({ where: { id: order.body.id }, data: { status: "PAID" } });
    await prisma.payment.create({
      data: {
        orderId: order.body.id,
        provider: "PAYSTACK",
        status: "SUCCEEDED",
        amountCents: order.body.totalCents,
        currency: order.body.currency,
        providerRef: `txn_${tag}_${suffix}`,
      },
    });

    return order.body.orderNumber;
  }

  const refundUrl = (orderNumber: string) => `/v1/admin/orders/${orderNumber}/refunds`;

  beforeAll(async () => {
    process.env.PAYSTACK_SECRET_KEY = PAYSTACK_KEY;
    installPaystackStub();

    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    await purgeFixtures(prisma);
    adminToken = await registerWithRole(adminEmail, "ADMIN");
    supportToken = await registerWithRole(supportEmail, "SUPPORT");
  });

  afterAll(async () => {
    global.fetch = realFetch;
    if (prisma) await purgeFixtures(prisma).catch(() => undefined);
    if (app) await app.close();
    delete process.env.PAYSTACK_SECRET_KEY;
  });

  beforeEach(() => {
    paystackBehaviour = { kind: "ok" };
    paystackCalls = [];
  });

  describe("permissions", () => {
    it("refuses an anonymous caller", async () => {
      const orderNumber = await createPaidOrder("anon");
      await http().post(refundUrl(orderNumber)).send({}).expect(401);
    });

    it("refuses SUPPORT, who can move orders but must not move money", async () => {
      const orderNumber = await createPaidOrder("support");

      await http().post(refundUrl(orderNumber)).set(auth(supportToken)).send({}).expect(403);

      const order = await prisma.order.findFirstOrThrow({ where: { orderNumber } });
      expect(order.status).toBe("PAID");
      expect(paystackCalls).toHaveLength(0);
    });

    it("lets SUPPORT read the refund position", async () => {
      // Reading is how support answers "have I been refunded yet?".
      const orderNumber = await createPaidOrder("support-read");
      const res = await http().get(refundUrl(orderNumber)).set(auth(supportToken)).expect(200);

      expect(res.body.refundableCents).toBe(ORDER_CENTS);
    });
  });

  describe("issuing a refund", () => {
    it("refunds the whole balance when no amount is given", async () => {
      const orderNumber = await createPaidOrder("full");

      const res = await http().post(refundUrl(orderNumber)).set(auth(adminToken)).send({}).expect(201);

      expect(res.body.status).toBe("SUCCEEDED");
      expect(res.body.amountCents).toBe(ORDER_CENTS);
      expect(paystackCalls).toEqual([
        { amount: ORDER_CENTS, transaction: `txn_full_${suffix}` },
      ]);

      const order = await prisma.order.findFirstOrThrow({ where: { orderNumber } });
      expect(order.status).toBe("REFUNDED");
    });

    it("leaves the order PARTIALLY_REFUNDED after a partial refund", async () => {
      const orderNumber = await createPaidOrder("partial");

      const res = await http()
        .post(refundUrl(orderNumber))
        .set(auth(adminToken))
        .send({ amountCents: 250000, reason: "One item returned" })
        .expect(201);

      expect(res.body.amountCents).toBe(250000);

      const order = await prisma.order.findFirstOrThrow({ where: { orderNumber } });
      expect(order.status).toBe("PARTIALLY_REFUNDED");

      const summary = await http().get(refundUrl(orderNumber)).set(auth(adminToken)).expect(200);
      expect(summary.body.refundedCents).toBe(250000);
      expect(summary.body.refundableCents).toBe(ORDER_CENTS - 250000);
    });

    it("moves to REFUNDED once the remainder goes back", async () => {
      const orderNumber = await createPaidOrder("partial-then-full");

      await http()
        .post(refundUrl(orderNumber))
        .set(auth(adminToken))
        .send({ amountCents: 250000 })
        .expect(201);
      await http().post(refundUrl(orderNumber)).set(auth(adminToken)).send({}).expect(201);

      // The second refund must send only what was left, not the whole order.
      expect(paystackCalls.map((c) => c.amount)).toEqual([250000, ORDER_CENTS - 250000]);

      const order = await prisma.order.findFirstOrThrow({ where: { orderNumber } });
      expect(order.status).toBe("REFUNDED");
    });

    it("records who issued it and why", async () => {
      const orderNumber = await createPaidOrder("audit");
      await http()
        .post(refundUrl(orderNumber))
        .set(auth(adminToken))
        .send({ amountCents: 1000, reason: "Damaged in transit" })
        .expect(201);

      const refund = await prisma.refund.findFirstOrThrow({
        where: { order: { orderNumber } },
        include: { initiatedBy: { select: { email: true } } },
      });
      expect(refund.initiatedBy?.email).toBe(adminEmail);
      expect(refund.reason).toBe("Damaged in transit");
    });

    it("writes an order status history entry", async () => {
      const orderNumber = await createPaidOrder("history");
      await http()
        .post(refundUrl(orderNumber))
        .set(auth(adminToken))
        .send({ amountCents: 1000 })
        .expect(201);

      const history = await prisma.orderStatusHistory.findFirstOrThrow({
        where: { order: { orderNumber }, toStatus: "PARTIALLY_REFUNDED" },
      });
      expect(history.fromStatus).toBe("PAID");
    });
  });

  describe("refusing what must not happen", () => {
    it("refuses more than the order is worth", async () => {
      const orderNumber = await createPaidOrder("over");

      const res = await http()
        .post(refundUrl(orderNumber))
        .set(auth(adminToken))
        .send({ amountCents: ORDER_CENTS + 1 })
        .expect(400);

      expect(res.body.message).toMatch(/exceeds/);
      // The guard has to bite before the provider is called, not after.
      expect(paystackCalls).toHaveLength(0);

      const order = await prisma.order.findFirstOrThrow({ where: { orderNumber } });
      expect(order.status).toBe("PAID");
    });

    it("refuses more than what remains after a partial refund", async () => {
      const orderNumber = await createPaidOrder("over-remaining");
      await http()
        .post(refundUrl(orderNumber))
        .set(auth(adminToken))
        .send({ amountCents: 700000 })
        .expect(201);

      await http()
        .post(refundUrl(orderNumber))
        .set(auth(adminToken))
        .send({ amountCents: 50001 })
        .expect(400);

      expect(paystackCalls).toHaveLength(1);
    });

    it("refuses a second refund once fully refunded", async () => {
      const orderNumber = await createPaidOrder("already");
      await http().post(refundUrl(orderNumber)).set(auth(adminToken)).send({}).expect(201);

      const res = await http().post(refundUrl(orderNumber)).set(auth(adminToken)).send({}).expect(409);
      expect(res.body.message).toMatch(/cannot be refunded/i);
      expect(paystackCalls).toHaveLength(1);
    });

    it("refuses to refund an order that was never paid", async () => {
      const email = `${FIXTURE_PREFIX}unpaid-${suffix}@wisdomshop.example`;
      const reg = await http()
        .post("/v1/auth/register")
        .send({ email, password, firstName: "Un", lastName: "Paid" })
        .expect(201);
      const product = await prisma.product.create({
        data: {
          title: `Refund Unpaid ${suffix}`,
          slug: `${FIXTURE_PREFIX}unpaid-${suffix}`,
          description: "Never paid for.",
          type: "DIGITAL",
          status: "PUBLISHED",
          priceCents: 1000,
          currency: "NGN",
        },
      });
      await http()
        .post("/v1/cart/items")
        .set(auth(reg.body.accessToken))
        .send({ productId: product.id, quantity: 1 })
        .expect(201);
      const order = await http()
        .post("/v1/orders")
        .set(auth(reg.body.accessToken))
        .send({})
        .expect(201);

      // Refunding a PENDING order would send money nobody paid.
      await http().post(refundUrl(order.body.orderNumber)).set(auth(adminToken)).send({}).expect(409);
      expect(paystackCalls).toHaveLength(0);
    });

    it("refuses a fractional amount rather than rounding it", async () => {
      const orderNumber = await createPaidOrder("fractional");
      await http()
        .post(refundUrl(orderNumber))
        .set(auth(adminToken))
        .send({ amountCents: 19.99 })
        .expect(400);

      expect(paystackCalls).toHaveLength(0);
    });

    it("refuses a negative amount", async () => {
      // A negative refund is a charge.
      const orderNumber = await createPaidOrder("negative");
      await http()
        .post(refundUrl(orderNumber))
        .set(auth(adminToken))
        .send({ amountCents: -5000 })
        .expect(400);

      expect(paystackCalls).toHaveLength(0);
    });

    it("404s for an unknown order", async () => {
      await http().post(refundUrl("WS-does-not-exist")).set(auth(adminToken)).send({}).expect(404);
    });
  });

  describe("idempotency", () => {
    it("returns the original refund when the same key is replayed", async () => {
      const orderNumber = await createPaidOrder("idempotent");
      const body = { amountCents: 1000, idempotencyKey: `key-${suffix}` };

      const first = await http().post(refundUrl(orderNumber)).set(auth(adminToken)).send(body).expect(201);
      const second = await http().post(refundUrl(orderNumber)).set(auth(adminToken)).send(body).expect(201);

      expect(second.body.id).toBe(first.body.id);
      // The headline property: one refund reached the provider, not two.
      expect(paystackCalls).toHaveLength(1);

      const refunds = await prisma.refund.findMany({ where: { order: { orderNumber } } });
      expect(refunds).toHaveLength(1);
    });

    it("treats two concurrent submissions of one key as a single refund", async () => {
      const orderNumber = await createPaidOrder("concurrent");
      const body = { amountCents: 1000, idempotencyKey: `race-${suffix}` };

      const results = await Promise.allSettled([
        http().post(refundUrl(orderNumber)).set(auth(adminToken)).send(body),
        http().post(refundUrl(orderNumber)).set(auth(adminToken)).send(body),
      ]);

      const statuses = results
        .map((r) => (r.status === "fulfilled" ? r.value.status : 0))
        .sort();
      // Either the second saw the existing row (201 with the same refund) or
      // it lost the unique-constraint race (409). Both are correct; two
      // refunds are not.
      expect(statuses.every((s) => s === 201 || s === 409)).toBe(true);
      expect(paystackCalls).toHaveLength(1);

      const refunds = await prisma.refund.findMany({ where: { order: { orderNumber } } });
      expect(refunds).toHaveLength(1);
    });

    it("issues a genuinely separate refund when no key is given", async () => {
      const orderNumber = await createPaidOrder("separate");

      await http()
        .post(refundUrl(orderNumber))
        .set(auth(adminToken))
        .send({ amountCents: 1000 })
        .expect(201);
      await http()
        .post(refundUrl(orderNumber))
        .set(auth(adminToken))
        .send({ amountCents: 1000 })
        .expect(201);

      const refunds = await prisma.refund.findMany({ where: { order: { orderNumber } } });
      expect(refunds).toHaveLength(2);
    });
  });

  describe("when the provider says no", () => {
    it("records a FAILED refund and reports it, leaving the order alone", async () => {
      const orderNumber = await createPaidOrder("refused");
      paystackBehaviour = { kind: "refuse", message: "Transaction too old to refund" };

      const res = await http().post(refundUrl(orderNumber)).set(auth(adminToken)).send({}).expect(409);
      expect(res.body.message).toMatch(/too old to refund/i);

      const order = await prisma.order.findFirstOrThrow({ where: { orderNumber } });
      expect(order.status).toBe("PAID");

      const refund = await prisma.refund.findFirstOrThrow({ where: { order: { orderNumber } } });
      expect(refund.status).toBe("FAILED");
      expect(refund.failureReason).toMatch(/too old to refund/i);
    });

    it("leaves the balance refundable after a failure", async () => {
      // A failed attempt moved no money, so it must not strand the
      // customer's refund behind a phantom balance.
      const orderNumber = await createPaidOrder("failed-then-ok");
      paystackBehaviour = { kind: "refuse", message: "temporary glitch" };
      await http().post(refundUrl(orderNumber)).set(auth(adminToken)).send({}).expect(409);

      const summary = await http().get(refundUrl(orderNumber)).set(auth(adminToken)).expect(200);
      expect(summary.body.refundableCents).toBe(ORDER_CENTS);

      paystackBehaviour = { kind: "ok" };
      await http().post(refundUrl(orderNumber)).set(auth(adminToken)).send({}).expect(201);

      const order = await prisma.order.findFirstOrThrow({ where: { orderNumber } });
      expect(order.status).toBe("REFUNDED");
    });

    it("records a network failure as FAILED rather than losing it", async () => {
      const orderNumber = await createPaidOrder("network");
      paystackBehaviour = { kind: "network-error" };

      await http().post(refundUrl(orderNumber)).set(auth(adminToken)).send({}).expect(409);

      const refund = await prisma.refund.findFirstOrThrow({ where: { order: { orderNumber } } });
      expect(refund.status).toBe("FAILED");
    });
  });

  describe("unsettled refunds", () => {
    it("keeps an unsettled refund PENDING and counts it against the balance", async () => {
      // Money that may already be in flight must not be refundable twice,
      // even though the provider has not confirmed it yet.
      const orderNumber = await createPaidOrder("pending");
      paystackBehaviour = { kind: "ok", status: "pending" };

      await http()
        .post(refundUrl(orderNumber))
        .set(auth(adminToken))
        .send({ amountCents: 500000 })
        .expect(201);

      const refund = await prisma.refund.findFirstOrThrow({ where: { order: { orderNumber } } });
      expect(refund.status).toBe("PENDING");

      const summary = await http().get(refundUrl(orderNumber)).set(auth(adminToken)).expect(200);
      expect(summary.body.refundableCents).toBe(ORDER_CENTS - 500000);
    });
  });
});
