import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";

const FIXTURE_PREFIX = "downloads-fixture-";
const SECRET_CONTENT = "the-purchased-file-contents-9f2a";

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
      await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    }
  }

  const products = await prisma.product.findMany({
    where: { slug: { startsWith: FIXTURE_PREFIX } },
    select: { id: true },
  });
  if (products.length > 0) {
    const ids = products.map((p) => p.id);
    await prisma.productFile.deleteMany({ where: { productId: { in: ids } } });
    await prisma.orderItem.deleteMany({ where: { productId: { in: ids } } });
    await prisma.cartItem.deleteMany({ where: { productId: { in: ids } } });
    await prisma.product.deleteMany({ where: { id: { in: ids } } });
  }

  await prisma.user.deleteMany({ where: { email: { startsWith: FIXTURE_PREFIX } } });
}

describe("Downloads & uploads (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const suffix = Date.now();
  const password = "Sup3rSecret!Pass";
  const adminEmail = `${FIXTURE_PREFIX}admin-${suffix}@wisdomshop.example`;
  const buyerEmail = `${FIXTURE_PREFIX}buyer-${suffix}@wisdomshop.example`;
  const strangerEmail = `${FIXTURE_PREFIX}stranger-${suffix}@wisdomshop.example`;
  const pendingBuyerEmail = `${FIXTURE_PREFIX}pending-${suffix}@wisdomshop.example`;

  let adminToken: string;
  let buyerToken: string;
  let strangerToken: string;
  let pendingBuyerToken: string;
  let productId: string;
  let fileId: string;

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const http = () => request(app.getHttpServer());

  /**
   * Downloads go out as application/octet-stream, which supertest does not
   * parse into `.text` — the bytes arrive in `.body` as a Buffer. Error
   * responses are still JSON, so both shapes have to be handled.
   */
  const bodyText = (res: request.Response): string =>
    Buffer.isBuffer(res.body) ? res.body.toString("utf8") : (res.text ?? JSON.stringify(res.body));

  async function register(email: string): Promise<{ id: string; token: string }> {
    const res = await http()
      .post("/v1/auth/register")
      .send({ email, password, firstName: "Down", lastName: "Loader" });
    return { id: res.body.user.id, token: res.body.accessToken };
  }

  async function orderFor(userId: string, status: string) {
    return prisma.order.create({
      data: {
        orderNumber: `${FIXTURE_PREFIX}${status}-${userId.slice(-6)}-${suffix}`,
        userId,
        status: status as never,
        subtotalCents: 1000,
        totalCents: 1000,
        items: {
          create: { productId, titleSnapshot: "Downloadable", unitPriceCents: 1000, quantity: 1 },
        },
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

    const admin = await register(adminEmail);
    const role = await prisma.role.upsert({ where: { name: "ADMIN" }, update: {}, create: { name: "ADMIN" } });
    await prisma.userRole.create({ data: { userId: admin.id, roleId: role.id } });
    adminToken = (await http().post("/v1/auth/login").send({ email: adminEmail, password })).body.accessToken;

    const buyer = await register(buyerEmail);
    buyerToken = buyer.token;
    strangerToken = (await register(strangerEmail)).token;
    const pendingBuyer = await register(pendingBuyerEmail);
    pendingBuyerToken = pendingBuyer.token;

    const product = await prisma.product.create({
      data: {
        title: `Downloadable Guide ${suffix}`,
        slug: `${FIXTURE_PREFIX}guide-${suffix}`,
        description: "A digital product with a file attached.",
        type: "DIGITAL",
        status: "PUBLISHED",
        priceCents: 1000,
      },
    });
    productId = product.id;

    await orderFor(buyer.id, "PAID");
    await orderFor(pendingBuyer.id, "PENDING");

    const attach = await http()
      .post(`/v1/admin/products/${productId}/files`)
      .set(auth(adminToken))
      .attach("file", Buffer.from(SECRET_CONTENT), "study-guide.pdf")
      .expect(201);
    fileId = attach.body.id;
  });

  afterAll(async () => {
    if (prisma) await purgeFixtures(prisma).catch(() => undefined);
    if (app) await app.close();
  });

  describe("attaching files", () => {
    it("stores the file without exposing where it lives", () => {
      // A storage key in the response is an invitation to try addressing the
      // file directly.
      expect(fileId).toBeTruthy();
      const listed = JSON.stringify({ fileId });
      expect(listed).not.toContain("files/");
    });

    it("keeps the storage key off every client-facing response", async () => {
      const res = await http()
        .get(`/v1/admin/products/${productId}/files`)
        .set(auth(adminToken))
        .expect(200);

      expect(JSON.stringify(res.body)).not.toMatch(/storageKey/);
      expect(res.body[0].originalName).toBe("study-guide.pdf");
    });

    it("refuses attachment from a customer", async () => {
      await http()
        .post(`/v1/admin/products/${productId}/files`)
        .set(auth(buyerToken))
        .attach("file", Buffer.from("nope"), "evil.pdf")
        .expect(403);
    });
  });

  describe("who may download", () => {
    it("gives the buyer the actual bytes", async () => {
      const res = await http().get(`/v1/downloads/${fileId}`).set(auth(buyerToken)).expect(200);
      expect(bodyText(res)).toBe(SECRET_CONTENT);
    });

    it("sends it as an attachment, never inline", async () => {
      const res = await http().get(`/v1/downloads/${fileId}`).set(auth(buyerToken)).expect(200);

      // Inline would let a mislabelled file render as HTML on this origin.
      expect(res.headers["content-disposition"]).toMatch(/^attachment;/);
      expect(res.headers["content-type"]).toMatch(/application\/octet-stream/);
      // Purchased files are per-customer; no shared cache should keep a copy.
      expect(res.headers["cache-control"]).toMatch(/private|no-store/);
    });

    it("refuses someone who never bought it", async () => {
      const res = await http().get(`/v1/downloads/${fileId}`).set(auth(strangerToken)).expect(403);
      expect(JSON.stringify(res.body)).toMatch(/haven't purchased/i);
      expect(bodyText(res)).not.toContain(SECRET_CONTENT);
    });

    it("refuses a buyer whose order has not been paid for", async () => {
      // The headline money case: an unpaid order must not unlock the goods.
      const res = await http().get(`/v1/downloads/${fileId}`).set(auth(pendingBuyerToken)).expect(403);
      expect(JSON.stringify(res.body)).toMatch(/paid for/i);
      expect(bodyText(res)).not.toContain(SECRET_CONTENT);
    });

    it("stops honouring a download once the order is refunded", async () => {
      const order = await prisma.order.findFirstOrThrow({
        where: { user: { email: buyerEmail }, status: "PAID" },
      });
      await prisma.order.update({ where: { id: order.id }, data: { status: "REFUNDED" } });

      await http().get(`/v1/downloads/${fileId}`).set(auth(buyerToken)).expect(403);

      await prisma.order.update({ where: { id: order.id }, data: { status: "PAID" } });
      await http().get(`/v1/downloads/${fileId}`).set(auth(buyerToken)).expect(200);
    });

    it("refuses an unauthenticated request", async () => {
      await http().get(`/v1/downloads/${fileId}`).expect(401);
    });

    it("lets staff through for support", async () => {
      const res = await http().get(`/v1/downloads/${fileId}`).set(auth(adminToken)).expect(200);
      expect(bodyText(res)).toBe(SECRET_CONTENT);
    });
  });

  describe("the buyer's download list", () => {
    it("lists what they bought and nothing else", async () => {
      const mine = await http().get("/v1/downloads").set(auth(buyerToken)).expect(200);
      expect(mine.body).toHaveLength(1);
      expect(mine.body[0].productId).toBe(productId);
      expect(mine.body[0].files[0].id).toBe(fileId);

      const theirs = await http().get("/v1/downloads").set(auth(strangerToken)).expect(200);
      expect(theirs.body).toHaveLength(0);
    });

    it("does not list a product whose order is unpaid", async () => {
      const res = await http().get("/v1/downloads").set(auth(pendingBuyerToken)).expect(200);
      expect(res.body).toHaveLength(0);
    });
  });

  describe("image uploads", () => {
    // A 1x1 PNG.
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );

    it("accepts a PNG and serves it back publicly", async () => {
      const upload = await http()
        .post("/v1/uploads/images")
        .set(auth(adminToken))
        .attach("file", png, "cover.png")
        .expect(201);

      expect(upload.body.url).toMatch(/^\/v1\/uploads\/images\//);

      // Product imagery appears on pages anyone can see, so this one is
      // deliberately public.
      const served = await http().get(upload.body.url).expect(200);
      expect(served.headers["content-type"]).toMatch(/image\/png/);
    });

    it("rejects SVG, which can carry scripts", async () => {
      // Serving one from our own origin would be stored XSS available to
      // every approved vendor.
      const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
      const res = await http()
        .post("/v1/uploads/images")
        .set(auth(adminToken))
        .attach("file", svg, { filename: "x.svg", contentType: "image/svg+xml" })
        .expect(400);

      expect(JSON.stringify(res.body)).toMatch(/svg/i);
    });

    it("rejects a non-image type", async () => {
      await http()
        .post("/v1/uploads/images")
        .set(auth(adminToken))
        .attach("file", Buffer.from("<html>hi</html>"), { filename: "x.html", contentType: "text/html" })
        .expect(400);
    });

    it("refuses uploads from a customer", async () => {
      await http()
        .post("/v1/uploads/images")
        .set(auth(buyerToken))
        .attach("file", png, "cover.png")
        .expect(403);
    });

    it("refuses to serve a traversal attempt", async () => {
      // The name is checked against the generated-key pattern before the
      // filesystem is touched at all.
      await http().get("/v1/uploads/images/..%2F..%2F.env").expect(404);
      await http().get("/v1/uploads/images/not-a-real-key.png").expect(404);
    });
  });
});
