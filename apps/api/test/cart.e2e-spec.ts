import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";

/** All fixtures this suite creates share these prefixes, so they can be swept by pattern. */
const FIXTURE_SLUG_PREFIX = "cart-fixture-";
const FIXTURE_EMAIL_PREFIX = "cart-fixture-";

async function purgeFixtures(prisma: PrismaService): Promise<void> {
  const stale = await prisma.product.findMany({
    where: { slug: { startsWith: FIXTURE_SLUG_PREFIX } },
    select: { id: true },
  });
  if (stale.length > 0) {
    const ids = stale.map((p) => p.id);
    await prisma.cartItem.deleteMany({ where: { productId: { in: ids } } });
    await prisma.product.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.user.deleteMany({ where: { email: { startsWith: FIXTURE_EMAIL_PREFIX } } });
}

describe("Cart (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = Date.now();
  const userAEmail = `${FIXTURE_EMAIL_PREFIX}a-${suffix}@wisdomshop.example`;
  const userBEmail = `${FIXTURE_EMAIL_PREFIX}b-${suffix}@wisdomshop.example`;
  const password = "Sup3rSecret!Pass";

  let tokenA: string;
  let tokenB: string;
  let publishedId: string;
  let draftId: string;
  let limitedId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    // Sweep fixtures orphaned by a previously crashed run. Without this,
    // a run that dies before afterAll leaves test products PUBLISHED in
    // the catalog, where they show up on the real storefront.
    await purgeFixtures(prisma);

    const regA = await request(app.getHttpServer())
      .post("/v1/auth/register")
      .send({ email: userAEmail, password, firstName: "Cart", lastName: "A" });
    tokenA = regA.body.accessToken;

    const regB = await request(app.getHttpServer())
      .post("/v1/auth/register")
      .send({ email: userBEmail, password, firstName: "Cart", lastName: "B" });
    tokenB = regB.body.accessToken;

    // Products are created directly rather than through the admin API so this
    // suite doesn't depend on role-granting, which has no endpoint yet.
    const published = await prisma.product.create({
      data: {
        title: `Cart Published ${suffix}`,
        slug: `${FIXTURE_SLUG_PREFIX}published-${suffix}`,
        description: "Available for purchase.",
        type: "DIGITAL",
        status: "PUBLISHED",
        priceCents: 2500,
      },
    });
    publishedId = published.id;

    const draft = await prisma.product.create({
      data: {
        title: `Cart Draft ${suffix}`,
        slug: `${FIXTURE_SLUG_PREFIX}draft-${suffix}`,
        description: "Not yet published.",
        type: "DIGITAL",
        status: "DRAFT",
        priceCents: 1000,
      },
    });
    draftId = draft.id;

    const limited = await prisma.product.create({
      data: {
        title: `Cart Limited ${suffix}`,
        slug: `${FIXTURE_SLUG_PREFIX}limited-${suffix}`,
        description: "Only two in stock.",
        type: "PHYSICAL",
        status: "PUBLISHED",
        priceCents: 5000,
        stockQty: 2,
      },
    });
    limitedId = limited.id;
  });

  afterAll(async () => {
    if (prisma) {
      for (const id of [publishedId, draftId, limitedId].filter(Boolean)) {
        await prisma.cartItem.deleteMany({ where: { productId: id } }).catch(() => undefined);
        await prisma.product.delete({ where: { id } }).catch(() => undefined);
      }
      await prisma.user
        .deleteMany({ where: { email: { in: [userAEmail, userBEmail] } } })
        .catch(() => undefined);
    }
    if (app) await app.close();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  it("requires authentication", async () => {
    await request(app.getHttpServer()).get("/v1/cart").expect(401);
  });

  it("starts empty for a new user", async () => {
    const res = await request(app.getHttpServer()).get("/v1/cart").set(auth(tokenA)).expect(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.subtotalCents).toBe(0);
  });

  it("refuses to add an unpublished product", async () => {
    await request(app.getHttpServer())
      .post("/v1/cart/items")
      .set(auth(tokenA))
      .send({ productId: draftId })
      .expect(404);
  });

  let itemId: string;

  it("adds a published product and computes the line total server-side", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/cart/items")
      .set(auth(tokenA))
      .send({ productId: publishedId, quantity: 2 })
      .expect(201);

    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].unitPriceCents).toBe(2500);
    expect(res.body.items[0].lineTotalCents).toBe(5000);
    expect(res.body.subtotalCents).toBe(5000);
    expect(res.body.itemCount).toBe(2);
    itemId = res.body.items[0].id;
  });

  it("merges a repeat add into the same line", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/cart/items")
      .set(auth(tokenA))
      .send({ productId: publishedId, quantity: 1 })
      .expect(201);

    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].quantity).toBe(3);
    expect(res.body.subtotalCents).toBe(7500);
  });

  it("ignores any client-supplied price", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/cart/items")
      .set(auth(tokenA))
      .send({ productId: publishedId, quantity: 1, priceCents: 1, unitPriceCents: 1 })
      .expect(400); // forbidNonWhitelisted rejects unknown fields outright

    expect(res.body.message.join?.(" ") ?? res.body.message).toMatch(/should not exist/i);
  });

  it("enforces stock limits", async () => {
    await request(app.getHttpServer())
      .post("/v1/cart/items")
      .set(auth(tokenA))
      .send({ productId: limitedId, quantity: 3 })
      .expect(400);

    await request(app.getHttpServer())
      .post("/v1/cart/items")
      .set(auth(tokenA))
      .send({ productId: limitedId, quantity: 2 })
      .expect(201);

    // One more would make 3, over the stock of 2.
    await request(app.getHttpServer())
      .post("/v1/cart/items")
      .set(auth(tokenA))
      .send({ productId: limitedId, quantity: 1 })
      .expect(400);
  });

  it("updates an item's quantity", async () => {
    const res = await request(app.getHttpServer())
      .patch(`/v1/cart/items/${itemId}`)
      .set(auth(tokenA))
      .send({ quantity: 1 })
      .expect(200);

    const line = res.body.items.find((i: { id: string }) => i.id === itemId);
    expect(line.quantity).toBe(1);
  });

  it("rejects a zero or negative quantity", async () => {
    await request(app.getHttpServer())
      .patch(`/v1/cart/items/${itemId}`)
      .set(auth(tokenA))
      .send({ quantity: 0 })
      .expect(400);
  });

  it("does not let another user read or mutate this cart", async () => {
    const otherCart = await request(app.getHttpServer()).get("/v1/cart").set(auth(tokenB)).expect(200);
    expect(otherCart.body.items).toEqual([]);

    await request(app.getHttpServer())
      .patch(`/v1/cart/items/${itemId}`)
      .set(auth(tokenB))
      .send({ quantity: 99 })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/v1/cart/items/${itemId}`)
      .set(auth(tokenB))
      .expect(404);

    // Confirm user A's line survived user B's attempts.
    const stillThere = await request(app.getHttpServer()).get("/v1/cart").set(auth(tokenA)).expect(200);
    expect(stillThere.body.items.find((i: { id: string }) => i.id === itemId).quantity).toBe(1);
  });

  it("removes a single item", async () => {
    const res = await request(app.getHttpServer())
      .delete(`/v1/cart/items/${itemId}`)
      .set(auth(tokenA))
      .expect(200);

    expect(res.body.items.find((i: { id: string }) => i.id === itemId)).toBeUndefined();
  });

  it("clears the whole cart", async () => {
    const res = await request(app.getHttpServer()).delete("/v1/cart").set(auth(tokenA)).expect(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.subtotalCents).toBe(0);
  });
});
