import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";
import { SearchService } from "../src/search/search.service";

const FIXTURE_PREFIX = "search-fixture-";

async function purgeFixtures(prisma: PrismaService): Promise<void> {
  const products = await prisma.product.findMany({
    where: { slug: { startsWith: FIXTURE_PREFIX } },
    select: { id: true },
  });
  if (products.length > 0) {
    const ids = products.map((p) => p.id);
    await prisma.orderItem.deleteMany({ where: { productId: { in: ids } } });
    await prisma.cartItem.deleteMany({ where: { productId: { in: ids } } });
    await prisma.product.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.user.deleteMany({ where: { email: { startsWith: FIXTURE_PREFIX } } });
}

/** Meilisearch indexes asynchronously; give a write a moment to land. */
async function settle(ms = 900): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Product search (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let search: SearchService;

  const suffix = Date.now();
  const password = "Sup3rSecret!Pass";
  const adminEmail = `${FIXTURE_PREFIX}admin-${suffix}@wisdomshop.example`;

  let adminToken: string;
  let draftId: string;

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    search = app.get(SearchService);

    await purgeFixtures(prisma);

    const reg = await http()
      .post("/v1/auth/register")
      .send({ email: adminEmail, password, firstName: "Sea", lastName: "Rch" });
    const role = await prisma.role.upsert({ where: { name: "ADMIN" }, update: {}, create: { name: "ADMIN" } });
    await prisma.userRole.create({ data: { userId: reg.body.user.id, roleId: role.id } });
    adminToken = (await http().post("/v1/auth/login").send({ email: adminEmail, password })).body.accessToken;

    // Created through the API so the indexing hook runs, exactly as it would
    // when a real admin adds a product.
    const published = await http()
      .post("/v1/admin/products")
      .set(auth(adminToken))
      .send({
        title: `Zylophone Handbook ${suffix}`,
        slug: `${FIXTURE_PREFIX}zylophone-${suffix}`,
        description: "A distinctive title, so the match cannot be a coincidence.",
        type: "DIGITAL",
        priceCents: 2500,
      })
      .expect(201);

    await http()
      .patch(`/v1/admin/products/${published.body.id}`)
      .set(auth(adminToken))
      .send({ status: "PUBLISHED" })
      .expect(200);

    const draft = await http()
      .post("/v1/admin/products")
      .set(auth(adminToken))
      .send({
        title: `Zylophone Secret Draft ${suffix}`,
        slug: `${FIXTURE_PREFIX}draft-${suffix}`,
        description: "Unreleased and must never surface in search.",
        type: "DIGITAL",
        priceCents: 9900,
      })
      .expect(201);
    draftId = draft.body.id;

    await settle();
  });

  afterAll(async () => {
    if (prisma) await purgeFixtures(prisma).catch(() => undefined);
    if (app) await app.close();
  });

  it("has search configured in this environment", () => {
    // If this ever fails the rest of the suite is measuring the database
    // fallback rather than search, so it is asserted rather than assumed.
    expect(search.enabled).toBe(true);
  });

  it("finds a published product by a word from its title", async () => {
    const res = await http()
      .get(`/v1/products?search=Zylophone`)
      .expect(200);

    const titles = res.body.data.map((p: { title: string }) => p.title);
    expect(titles).toContain(`Zylophone Handbook ${suffix}`);
  });

  it("tolerates a typo, which the database fallback cannot", async () => {
    // This is the whole reason for running a search engine: "Zylophon"
    // matches nothing under a SQL `contains`.
    const res = await http().get(`/v1/products?search=Zylophon`).expect(200);

    const titles = res.body.data.map((p: { title: string }) => p.title);
    expect(titles).toContain(`Zylophone Handbook ${suffix}`);
  });

  it("never surfaces an unpublished product", async () => {
    const res = await http().get(`/v1/products?search=Zylophone`).expect(200);

    const ids = res.body.data.map((p: { id: string }) => p.id);
    expect(ids).not.toContain(draftId);
    expect(JSON.stringify(res.body)).not.toContain("Secret Draft");
  });

  it("drops a product from search once it is unpublished", async () => {
    const created = await http()
      .post("/v1/admin/products")
      .set(auth(adminToken))
      .send({
        title: `Qwertium Guide ${suffix}`,
        slug: `${FIXTURE_PREFIX}qwertium-${suffix}`,
        description: "Published, then withdrawn.",
        type: "DIGITAL",
        priceCents: 1000,
      })
      .expect(201);

    await http()
      .patch(`/v1/admin/products/${created.body.id}`)
      .set(auth(adminToken))
      .send({ status: "PUBLISHED" })
      .expect(200);
    await settle();

    const visible = await http().get(`/v1/products?search=Qwertium`).expect(200);
    expect(visible.body.data.map((p: { id: string }) => p.id)).toContain(created.body.id);

    await http()
      .patch(`/v1/admin/products/${created.body.id}`)
      .set(auth(adminToken))
      .send({ status: "DRAFT" })
      .expect(200);
    await settle();

    // A withdrawn product that stayed in the index would keep appearing in
    // results that lead nowhere.
    const gone = await http().get(`/v1/products?search=Qwertium`).expect(200);
    expect(gone.body.data.map((p: { id: string }) => p.id)).not.toContain(created.body.id);
  });

  it("still applies the other listing filters to search results", async () => {
    // Search decides what matches the phrase; the database still owns type,
    // category and price filtering.
    const res = await http()
      .get(`/v1/products?search=Zylophone&type=PHYSICAL`)
      .expect(200);

    expect(res.body.data).toHaveLength(0);
  });

  it("returns nothing rather than everything for a phrase that matches nothing", async () => {
    const res = await http()
      .get("/v1/products?search=xyzzynotathinginthecatalogue")
      .expect(200);

    // An empty id list must mean "no matches", not "no filter".
    expect(res.body.data).toHaveLength(0);
  });

  it("exposes reindexing to admins only", async () => {
    await http().post("/v1/admin/search/reindex").expect(401);

    const res = await http().post("/v1/admin/search/reindex").set(auth(adminToken)).expect(200);
    expect(res.body.enabled).toBe(true);
    expect(res.body.indexed).toBeGreaterThan(0);
  });

  it("reports search status", async () => {
    const res = await http().get("/v1/admin/search/status").set(auth(adminToken)).expect(200);
    expect(res.body.enabled).toBe(true);
  });
});
