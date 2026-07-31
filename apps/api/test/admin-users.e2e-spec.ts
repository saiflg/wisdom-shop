import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";

const FIXTURE_PREFIX = "adminusers-fixture-";

async function purgeFixtures(prisma: PrismaService): Promise<void> {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: FIXTURE_PREFIX } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length > 0) {
    await prisma.vendor.deleteMany({ where: { userId: { in: ids } } });
  }
  await prisma.user.deleteMany({ where: { email: { startsWith: FIXTURE_PREFIX } } });
}

describe("Admin user & role management (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = Date.now();
  const superEmail = `${FIXTURE_PREFIX}super-${suffix}@wisdomshop.example`;
  const adminEmail = `${FIXTURE_PREFIX}admin-${suffix}@wisdomshop.example`;
  const plainEmail = `${FIXTURE_PREFIX}plain-${suffix}@wisdomshop.example`;
  const password = "Sup3rSecret!Pass";

  let superToken: string;
  let adminToken: string;
  let plainToken: string;
  let superId: string;
  let adminId: string;
  let plainId: string;

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const http = () => request(app.getHttpServer());

  async function login(email: string): Promise<string> {
    const res = await http().post("/v1/auth/login").send({ email, password });
    return res.body.accessToken;
  }

  async function seedRole(userId: string, name: "ADMIN" | "SUPER_ADMIN") {
    const role = await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
    await prisma.userRole.create({ data: { userId, roleId: role.id } });
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    await purgeFixtures(prisma);

    // The bootstrap super admin still has to be seeded directly — that's the
    // chicken-and-egg every deployment has, and why prisma/seed.ts exists.
    const superReg = await http()
      .post("/v1/auth/register")
      .send({ email: superEmail, password, firstName: "Su", lastName: "Per" });
    superId = superReg.body.user.id;
    await seedRole(superId, "SUPER_ADMIN");
    superToken = await login(superEmail);

    const adminReg = await http()
      .post("/v1/auth/register")
      .send({ email: adminEmail, password, firstName: "Ad", lastName: "Min" });
    adminId = adminReg.body.user.id;
    await seedRole(adminId, "ADMIN");
    adminToken = await login(adminEmail);

    const plainReg = await http()
      .post("/v1/auth/register")
      .send({ email: plainEmail, password, firstName: "Pl", lastName: "Ain" });
    plainId = plainReg.body.user.id;
    plainToken = plainReg.body.accessToken;
  });

  afterAll(async () => {
    if (prisma) await purgeFixtures(prisma).catch(() => undefined);
    if (app) await app.close();
  });

  it("keeps user administration away from unauthenticated and ordinary users", async () => {
    await http().get("/v1/admin/users").expect(401);
    await http().get("/v1/admin/users").set(auth(plainToken)).expect(403);
  });

  it("lists and searches users", async () => {
    const res = await http()
      .get(`/v1/admin/users?search=${encodeURIComponent(plainEmail)}`)
      .set(auth(adminToken))
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].email).toBe(plainEmail);
    expect(res.body.data[0].roles).toContain("CUSTOMER");
  });

  it("filters users by role", async () => {
    const res = await http().get("/v1/admin/users?role=SUPER_ADMIN").set(auth(adminToken)).expect(200);
    expect(res.body.data.every((u: { roles: string[] }) => u.roles.includes("SUPER_ADMIN"))).toBe(true);
  });

  it("lets an ADMIN grant an ordinary role", async () => {
    const res = await http()
      .post(`/v1/admin/users/${plainId}/roles`)
      .set(auth(adminToken))
      .send({ role: "SUPPORT" })
      .expect(201);

    expect(res.body.roles).toContain("SUPPORT");
  });

  it("refuses granting the same role twice", async () => {
    await http()
      .post(`/v1/admin/users/${plainId}/roles`)
      .set(auth(adminToken))
      .send({ role: "SUPPORT" })
      .expect(409);
  });

  it("does NOT let an ADMIN grant ADMIN or SUPER_ADMIN", async () => {
    // Privilege escalation: an admin must not be able to mint more admins.
    await http()
      .post(`/v1/admin/users/${plainId}/roles`)
      .set(auth(adminToken))
      .send({ role: "ADMIN" })
      .expect(403);

    await http()
      .post(`/v1/admin/users/${plainId}/roles`)
      .set(auth(adminToken))
      .send({ role: "SUPER_ADMIN" })
      .expect(403);

    const after = await http().get(`/v1/admin/users/${plainId}`).set(auth(adminToken)).expect(200);
    expect(after.body.roles).not.toContain("ADMIN");
    expect(after.body.roles).not.toContain("SUPER_ADMIN");
  });

  it("does not let an ADMIN escalate their own privileges", async () => {
    await http()
      .post(`/v1/admin/users/${adminId}/roles`)
      .set(auth(adminToken))
      .send({ role: "SUPER_ADMIN" })
      .expect(403);
  });

  it("lets a SUPER_ADMIN grant ADMIN", async () => {
    const res = await http()
      .post(`/v1/admin/users/${plainId}/roles`)
      .set(auth(superToken))
      .send({ role: "ADMIN" })
      .expect(201);

    expect(res.body.roles).toContain("ADMIN");
  });

  it("refuses assigning VENDOR directly, even as SUPER_ADMIN", async () => {
    // VENDOR follows vendor approval; assigning it here would let role
    // membership drift from Vendor.status.
    const res = await http()
      .post(`/v1/admin/users/${plainId}/roles`)
      .set(auth(superToken))
      .send({ role: "VENDOR" })
      .expect(403);

    expect(JSON.stringify(res.body)).toMatch(/vendor approval/i);
  });

  it("refuses removing your own last administrative role", async () => {
    const res = await http()
      .delete(`/v1/admin/users/${superId}/roles/SUPER_ADMIN`)
      .set(auth(superToken))
      .expect(409);

    expect(JSON.stringify(res.body)).toMatch(/own last administrative role/i);

    // Still a super admin.
    const me = await http().get(`/v1/admin/users/${superId}`).set(auth(superToken)).expect(200);
    expect(me.body.roles).toContain("SUPER_ADMIN");
  });

  it("allows a SUPER_ADMIN to revoke someone else's ADMIN role", async () => {
    const res = await http()
      .delete(`/v1/admin/users/${plainId}/roles/ADMIN`)
      .set(auth(superToken))
      .expect(200);

    expect(res.body.roles).not.toContain("ADMIN");
  });

  it("refuses revoking a role the user does not have", async () => {
    await http()
      .delete(`/v1/admin/users/${plainId}/roles/ADMIN`)
      .set(auth(superToken))
      .expect(409);
  });

  describe("creating users", () => {
    const created: string[] = [];

    it("lets an admin create an ordinary user who can then sign in", async () => {
      const email = `${FIXTURE_PREFIX}created-${suffix}@wisdomshop.example`;
      const res = await http()
        .post("/v1/admin/users")
        .set(auth(adminToken))
        .send({ email, password, firstName: "New", lastName: "User", markEmailVerified: true })
        .expect(201);

      created.push(res.body.id);
      expect(res.body.roles).toContain("CUSTOMER");
      expect(res.body.emailVerifiedAt).not.toBeNull();

      // The account must actually work, not merely exist.
      const login = await http().post("/v1/auth/login").send({ email, password }).expect(200);
      expect(login.body.accessToken).toBeDefined();
    });

    it("does NOT let an ADMIN create a SUPER_ADMIN", async () => {
      // Creation would otherwise be a trivial way around the escalation
      // policy: an admin who cannot promote anyone to super admin could just
      // create one instead.
      const email = `${FIXTURE_PREFIX}escalate-${suffix}@wisdomshop.example`;
      await http()
        .post("/v1/admin/users")
        .set(auth(adminToken))
        .send({ email, password, firstName: "Esc", lastName: "Alate", roles: ["SUPER_ADMIN"] })
        .expect(403);

      // And the refusal must not leave a half-created account behind.
      const orphan = await prisma.user.findUnique({ where: { email } });
      expect(orphan).toBeNull();
    });

    it("lets a SUPER_ADMIN create staff with a privileged role", async () => {
      const email = `${FIXTURE_PREFIX}staff-${suffix}@wisdomshop.example`;
      const res = await http()
        .post("/v1/admin/users")
        .set(auth(superToken))
        .send({ email, password, firstName: "Staff", lastName: "Member", roles: ["ADMIN"] })
        .expect(201);

      created.push(res.body.id);
      expect(res.body.roles).toEqual(expect.arrayContaining(["CUSTOMER", "ADMIN"]));
    });

    it("refuses VENDOR at creation, as it does when granting", async () => {
      await http()
        .post("/v1/admin/users")
        .set(auth(superToken))
        .send({
          email: `${FIXTURE_PREFIX}vendor-${suffix}@wisdomshop.example`,
          password,
          firstName: "Ven",
          lastName: "Dor",
          roles: ["VENDOR"],
        })
        .expect(403);
    });

    it("refuses a duplicate email", async () => {
      await http()
        .post("/v1/admin/users")
        .set(auth(adminToken))
        .send({ email: plainEmail, password, firstName: "Dup", lastName: "Licate" })
        .expect(409);
    });

    it("enforces the same password strength as public registration", async () => {
      await http()
        .post("/v1/admin/users")
        .set(auth(adminToken))
        .send({
          email: `${FIXTURE_PREFIX}weak-${suffix}@wisdomshop.example`,
          password: "weak",
          firstName: "Weak",
          lastName: "Pass",
        })
        .expect(400);
    });

    it("is not open to ordinary users", async () => {
      await http()
        .post("/v1/admin/users")
        .set(auth(plainToken))
        .send({
          email: `${FIXTURE_PREFIX}nope-${suffix}@wisdomshop.example`,
          password,
          firstName: "No",
          lastName: "Pe",
        })
        .expect(403);
    });
  });

  it("404s for an unknown user", async () => {
    await http().get("/v1/admin/users/not-a-real-id").set(auth(adminToken)).expect(404);
  });
});
