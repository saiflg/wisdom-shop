import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";

const FIXTURE_PREFIX = "reviews-fixture-";

async function purgeFixtures(prisma: PrismaService): Promise<void> {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: FIXTURE_PREFIX } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  if (userIds.length > 0) {
    const orders = await prisma.order.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
    const orderIds = orders.map((o) => o.id);
    if (orderIds.length > 0) {
      await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.refund.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    }
    await prisma.review.deleteMany({ where: { userId: { in: userIds } } });
  }

  const products = await prisma.product.findMany({
    where: { slug: { startsWith: FIXTURE_PREFIX } },
    select: { id: true },
  });
  if (products.length > 0) {
    const ids = products.map((p) => p.id);
    await prisma.review.deleteMany({ where: { productId: { in: ids } } });
    await prisma.orderItem.deleteMany({ where: { productId: { in: ids } } });
    await prisma.cartItem.deleteMany({ where: { productId: { in: ids } } });
    await prisma.product.deleteMany({ where: { id: { in: ids } } });
  }

  await prisma.user.deleteMany({ where: { email: { startsWith: FIXTURE_PREFIX } } });
}

describe("Reviews (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const suffix = Date.now();
  const password = "Sup3rSecret!Pass";
  const slug = `${FIXTURE_PREFIX}book-${suffix}`;

  const buyerEmail = `${FIXTURE_PREFIX}buyer-${suffix}@wisdomshop.example`;
  const buyer2Email = `${FIXTURE_PREFIX}buyer2-${suffix}@wisdomshop.example`;
  const strangerEmail = `${FIXTURE_PREFIX}stranger-${suffix}@wisdomshop.example`;
  const pendingEmail = `${FIXTURE_PREFIX}pending-${suffix}@wisdomshop.example`;
  const modEmail = `${FIXTURE_PREFIX}mod-${suffix}@wisdomshop.example`;

  let buyerToken: string;
  let buyer2Token: string;
  let strangerToken: string;
  let pendingToken: string;
  let modToken: string;
  let productId: string;
  let reviewId: string;

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const http = () => request(app.getHttpServer());

  async function register(email: string, firstName = "Rev", lastName = "Iewer") {
    const res = await http().post("/v1/auth/register").send({ email, password, firstName, lastName });
    return { id: res.body.user.id, token: res.body.accessToken };
  }

  async function orderFor(userId: string, status: string, label: string) {
    return prisma.order.create({
      data: {
        orderNumber: `${FIXTURE_PREFIX}${label}-${suffix}`,
        userId,
        status: status as never,
        subtotalCents: 1000,
        totalCents: 1000,
        items: { create: { productId, titleSnapshot: "Book", unitPriceCents: 1000, quantity: 1 } },
      },
    });
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    await purgeFixtures(prisma);

    const product = await prisma.product.create({
      data: {
        title: `Reviewable Book ${suffix}`,
        slug,
        description: "A product people can review.",
        type: "DIGITAL",
        status: "PUBLISHED",
        priceCents: 1000,
      },
    });
    productId = product.id;

    const buyer = await register(buyerEmail, "Ada", "Lovelace");
    buyerToken = buyer.token;
    const buyer2 = await register(buyer2Email, "Grace", "Hopper");
    buyer2Token = buyer2.token;
    strangerToken = (await register(strangerEmail)).token;
    const pending = await register(pendingEmail);
    pendingToken = pending.token;

    const mod = await register(modEmail);
    const role = await prisma.role.upsert({ where: { name: "MANAGER" }, update: {}, create: { name: "MANAGER" } });
    await prisma.userRole.create({ data: { userId: mod.id, roleId: role.id } });
    modToken = (await http().post("/v1/auth/login").send({ email: modEmail, password })).body.accessToken;

    await orderFor(buyer.id, "PAID", "paid1");
    await orderFor(buyer2.id, "DELIVERED", "delivered1");
    await orderFor(pending.id, "PENDING", "pending1");
  });

  afterAll(async () => {
    if (prisma) await purgeFixtures(prisma).catch(() => undefined);
    if (app) await app.close();
  });

  describe("who may review", () => {
    it("lets a paying customer review", async () => {
      const res = await http()
        .post(`/v1/products/${slug}/reviews`)
        .set(auth(buyerToken))
        .send({ rating: 5, title: "Excellent", body: "Learned a lot." })
        .expect(201);

      reviewId = res.body.id;
      expect(res.body.rating).toBe(5);
    });

    it("refuses someone who never bought it", async () => {
      const res = await http()
        .post(`/v1/products/${slug}/reviews`)
        .set(auth(strangerToken))
        .send({ rating: 1 })
        .expect(403);

      // The whole point: ratings measure customers, not whoever is most
      // motivated to post.
      expect(JSON.stringify(res.body)).toMatch(/bought this product/i);
    });

    it("refuses a customer whose order is not paid for", async () => {
      const res = await http()
        .post(`/v1/products/${slug}/reviews`)
        .set(auth(pendingToken))
        .send({ rating: 5 })
        .expect(403);

      expect(JSON.stringify(res.body)).toMatch(/paid for/i);
    });

    it("refuses an unauthenticated review", async () => {
      await http().post(`/v1/products/${slug}/reviews`).send({ rating: 5 }).expect(401);
    });

    it("refuses a second review from the same customer", async () => {
      await http()
        .post(`/v1/products/${slug}/reviews`)
        .set(auth(buyerToken))
        .send({ rating: 1 })
        .expect(409);
    });

    it("rejects a rating outside 1–5", async () => {
      for (const rating of [0, 6, -1, 2.5]) {
        await http()
          .post(`/v1/products/${slug}/reviews`)
          .set(auth(buyer2Token))
          .send({ rating })
          .expect(400);
      }
    });
  });

  describe("reading reviews", () => {
    it("is public, with a summary alongside the page", async () => {
      const res = await http().get(`/v1/products/${slug}/reviews`).expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.summary).toEqual({
        average: 5,
        count: 1,
        distribution: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 1 },
      });
    });

    it("shows a first name and last initial, not a full name", async () => {
      const res = await http().get(`/v1/products/${slug}/reviews`).expect(200);

      // A review page is public; a full name plus a purchase history is more
      // than someone agreed to publish by leaving a rating.
      expect(res.body.data[0].authorName).toBe("Ada L.");
      expect(JSON.stringify(res.body)).not.toContain("Lovelace");
      expect(JSON.stringify(res.body)).not.toContain(buyerEmail);
    });

    it("averages across reviewers", async () => {
      await http()
        .post(`/v1/products/${slug}/reviews`)
        .set(auth(buyer2Token))
        .send({ rating: 4 })
        .expect(201);

      const res = await http().get(`/v1/products/${slug}/reviews`).expect(200);
      expect(res.body.summary.count).toBe(2);
      expect(res.body.summary.average).toBe(4.5);
    });

    it("404s for a product that isn't published", async () => {
      await http().get("/v1/products/not-a-real-product/reviews").expect(404);
    });
  });

  describe("eligibility endpoint", () => {
    it("tells a buyer they have already reviewed, and hands back their review", async () => {
      const res = await http().get(`/v1/products/${slug}/reviews/me`).set(auth(buyerToken)).expect(200);

      expect(res.body.canReview).toBe(false);
      expect(res.body.reason).toBe("already-reviewed");
      expect(res.body.yourReview.id).toBe(reviewId);
    });

    it("tells a stranger why they cannot", async () => {
      const res = await http().get(`/v1/products/${slug}/reviews/me`).set(auth(strangerToken)).expect(200);

      expect(res.body.canReview).toBe(false);
      expect(res.body.reason).toBe("not-purchased");
      expect(res.body.yourReview).toBeNull();
    });
  });

  describe("editing and removing", () => {
    it("lets the author edit their own review", async () => {
      const res = await http()
        .patch(`/v1/reviews/${reviewId}`)
        .set(auth(buyerToken))
        .send({ rating: 3, title: "Reconsidered" })
        .expect(200);

      expect(res.body.rating).toBe(3);
      expect(res.body.title).toBe("Reconsidered");
    });

    it("does NOT let another customer edit it", async () => {
      await http()
        .patch(`/v1/reviews/${reviewId}`)
        .set(auth(buyer2Token))
        .send({ rating: 1 })
        .expect(403);
    });

    it("does not let a moderator rewrite someone's words", async () => {
      // A moderator can remove a review but never edit it — the review still
      // carries the author's name, so editing puts words in their mouth.
      await http()
        .patch(`/v1/reviews/${reviewId}`)
        .set(auth(modToken))
        .send({ body: "Actually this product is great" })
        .expect(403);
    });

    it("lets a moderator remove a review", async () => {
      await http().delete(`/v1/reviews/${reviewId}`).set(auth(modToken)).expect(204);

      const res = await http().get(`/v1/products/${slug}/reviews`).expect(200);
      expect(res.body.data.map((r: { id: string }) => r.id)).not.toContain(reviewId);
      // The average must follow the removal, not keep counting a hidden row.
      expect(res.body.summary.count).toBe(1);
      expect(res.body.summary.average).toBe(4);
    });

    it("lets the customer review again after theirs was removed", async () => {
      // The removed row still occupies the unique (product, user) slot, so
      // this fails unless the write revives it rather than inserting.
      await http()
        .post(`/v1/products/${slug}/reviews`)
        .set(auth(buyerToken))
        .send({ rating: 5, title: "Back again" })
        .expect(201);

      const res = await http().get(`/v1/products/${slug}/reviews`).expect(200);
      expect(res.body.summary.count).toBe(2);
    });
  });
});
