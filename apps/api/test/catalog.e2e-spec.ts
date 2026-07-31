import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";

describe("Catalog (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = Date.now();
  const adminEmail = `catalog-admin-${suffix}@wisdomshop.example`;
  const customerEmail = `catalog-customer-${suffix}@wisdomshop.example`;
  const password = "Sup3rSecret!Pass";

  let adminToken: string;
  let customerToken: string;
  let categoryId: string;
  let productId: string;
  let productSlug: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    // Register two users, then hand-promote one to ADMIN directly via
    // Prisma — there's no API surface for role assignment yet (that's
    // Phase 11: Admin Dashboard), so this is the only way to get an
    // elevated token for testing RBAC without depending on seed data.
    const adminRegister = await request(app.getHttpServer())
      .post("/v1/auth/register")
      .send({ email: adminEmail, password, firstName: "Cat", lastName: "Admin" });

    const adminRole = await prisma.role.upsert({
      where: { name: "ADMIN" },
      update: {},
      create: { name: "ADMIN" },
    });
    await prisma.userRole.create({
      data: { userId: adminRegister.body.user.id, roleId: adminRole.id },
    });

    const adminLogin = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ email: adminEmail, password });
    adminToken = adminLogin.body.accessToken;

    const customerRegister = await request(app.getHttpServer())
      .post("/v1/auth/register")
      .send({ email: customerEmail, password, firstName: "Cat", lastName: "Customer" });
    customerToken = customerRegister.body.accessToken;
  });

  // Guarded because Jest still runs afterAll when beforeAll fails. Without
  // these checks, teardown throws on an undefined prisma/app and that error
  // replaces the real beforeAll failure in the output.
  afterAll(async () => {
    if (prisma) {
      if (productId) await prisma.product.delete({ where: { id: productId } }).catch(() => undefined);
      if (categoryId) await prisma.category.delete({ where: { id: categoryId } }).catch(() => undefined);
      await prisma.user
        .deleteMany({ where: { email: { in: [adminEmail, customerEmail] } } })
        .catch(() => undefined);
    }
    if (app) await app.close();
  });

  it("rejects category creation without a token", async () => {
    await request(app.getHttpServer())
      .post("/v1/admin/categories")
      .send({ name: "Should Fail" })
      .expect(401);
  });

  it("rejects category creation from a CUSTOMER-role token", async () => {
    await request(app.getHttpServer())
      .post("/v1/admin/categories")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ name: "Should Fail" })
      .expect(403);
  });

  it("lets an ADMIN-role token create a category with an auto-generated slug", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/admin/categories")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: `E2E Category ${suffix}` })
      .expect(201);

    expect(res.body.slug).toBe(`e2e-category-${suffix}`);
    categoryId = res.body.id;
  });

  it("creates a product as DRAFT by default, invisible on the public list", async () => {
    const createRes = await request(app.getHttpServer())
      .post("/v1/admin/products")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: `E2E Product ${suffix}`,
        description: "A product created by the catalog e2e suite.",
        type: "DIGITAL",
        priceCents: 1234,
        categoryIds: [categoryId],
      })
      .expect(201);

    expect(createRes.body.status).toBe("DRAFT");
    productId = createRes.body.id;
    productSlug = createRes.body.slug;

    await request(app.getHttpServer()).get(`/v1/products/${productSlug}`).expect(404);

    const listRes = await request(app.getHttpServer()).get(
      `/v1/products?search=${encodeURIComponent(`E2E Product ${suffix}`)}`,
    );
    expect(listRes.body.data).toHaveLength(0);
  });

  it("does not let the public listing be talked into showing drafts", async () => {
    // The admin screen filters by status, so the parameter is now accepted on
    // the shared query DTO. The public listing must still pin PUBLISHED —
    // otherwise `?status=DRAFT` is a catalogue leak of unreleased products.
    const res = await request(app.getHttpServer()).get("/v1/products?status=DRAFT").expect(200);

    expect(res.body.data.map((p: { id: string }) => p.id)).not.toContain(productId);
    expect(
      res.body.data.every((p: { status: string }) => p.status === "PUBLISHED"),
    ).toBe(true);
  });

  it("lets an admin filter their own list by status", async () => {
    const drafts = await request(app.getHttpServer())
      .get("/v1/admin/products?status=DRAFT")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(drafts.body.data.map((p: { id: string }) => p.id)).toContain(productId);
    expect(drafts.body.data.every((p: { status: string }) => p.status === "DRAFT")).toBe(true);
  });

  it("becomes publicly visible once published by an admin", async () => {
    await request(app.getHttpServer())
      .patch(`/v1/admin/products/${productId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "PUBLISHED" })
      .expect(200);

    const detail = await request(app.getHttpServer()).get(`/v1/products/${productSlug}`).expect(200);
    expect(detail.body.title).toBe(`E2E Product ${suffix}`);
    expect(detail.body.categories[0].category.id).toBe(categoryId);

    const list = await request(app.getHttpServer()).get(
      `/v1/products?category=e2e-category-${suffix}`,
    );
    expect(list.body.data.map((p: { id: string }) => p.id)).toContain(productId);
  });

  it("refuses to delete a category that still has a product assigned", async () => {
    await request(app.getHttpServer())
      .delete(`/v1/admin/categories/${categoryId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(409);
  });
});
