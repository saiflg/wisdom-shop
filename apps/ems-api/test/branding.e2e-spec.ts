import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Client as PgClient } from "pg";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { ControlPrismaService } from "../src/control-db/control-prisma.service";

const FIXTURE_PREFIX = "e2e-brand-";

/**
 * A one-pixel PNG. Real bytes, because the upload route reads the mimetype
 * multer derived and the size — a text buffer labelled image/png would pass
 * this suite while telling us nothing about the real path.
 */
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const SVG_LOGO = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

describe("Per-school branding and host routing (e2e)", () => {
  let app: INestApplication;
  let controlPrisma: ControlPrismaService;
  let adminToken: string;
  let teacherToken: string;
  let otherAdminToken: string;
  let platformToken: string;

  const stamp = Date.now();
  const platformEmail = `${FIXTURE_PREFIX}platform-${stamp}@wisdomcampus.example`;
  const password = "Sup3rSecret!Pass";

  // Two schools: one under test, one to prove nothing crosses between them.
  const school = { slug: `${FIXTURE_PREFIX}a-${stamp}`, adminEmail: `${FIXTURE_PREFIX}admin-a@example.com` };
  const other = { slug: `${FIXTURE_PREFIX}b-${stamp}`, adminEmail: `${FIXTURE_PREFIX}admin-b@example.com` };
  const teacherEmail = `${FIXTURE_PREFIX}teacher@example.com`;

  const CUSTOM_DOMAIN = `portal.${FIXTURE_PREFIX}${stamp}.example`;

  async function purgeFixtures() {
    const schools = await controlPrisma.school.findMany({ where: { slug: { startsWith: FIXTURE_PREFIX } } });
    for (const s of schools) {
      const admin = new PgClient({ connectionString: process.env.POSTGRES_ADMIN_URL });
      await admin.connect();
      await admin.query(`DROP DATABASE IF EXISTS "${s.databaseName}" WITH (FORCE)`).catch(() => undefined);
      await admin.end();
    }
    await controlPrisma.provisioningAttempt.deleteMany({
      where: { school: { slug: { startsWith: FIXTURE_PREFIX } } },
    });
    await controlPrisma.school.deleteMany({ where: { slug: { startsWith: FIXTURE_PREFIX } } });
    await controlPrisma.platformUser.deleteMany({ where: { email: { startsWith: FIXTURE_PREFIX } } });
  }

  async function provision(platformToken: string, target: { slug: string; adminEmail: string }) {
    await request(app.getHttpServer())
      .post("/v1/platform/schools")
      .set("Authorization", `Bearer ${platformToken}`)
      .send({
        name: target.slug,
        slug: target.slug,
        adminEmail: target.adminEmail,
        adminPassword: password,
        adminFirstName: "Admin",
        adminLastName: target.slug,
      })
      .expect(201);

    const login = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ schoolSlug: target.slug, email: target.adminEmail, password })
      .expect(200);
    return login.body.accessToken as string;
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    await new Promise<void>((resolve) => app.getHttpServer().listen(0, resolve));

    controlPrisma = app.get(ControlPrismaService);
    await purgeFixtures();

    const argon2 = await import("argon2");
    await controlPrisma.platformUser.create({
      data: {
        email: platformEmail,
        passwordHash: await argon2.hash(password),
        firstName: "E2E",
        lastName: "Platform",
        roles: ["PLATFORM_ADMIN"],
      },
    });
    const platformLogin = await request(app.getHttpServer())
      .post("/v1/platform/auth/login")
      .send({ email: platformEmail, password })
      .expect(200);

    platformToken = platformLogin.body.accessToken;
    adminToken = await provision(platformToken, school);
    otherAdminToken = await provision(platformToken, other);

    await request(app.getHttpServer())
      .post("/v1/teachers")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ firstName: "Test", lastName: "Teacher", email: teacherEmail, password })
      .expect(201);

    const teacherLogin = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ schoolSlug: school.slug, email: teacherEmail, password })
      .expect(200);
    teacherToken = teacherLogin.body.accessToken;
    // Two schools provisioned in one hook — see the harness note in
    // PROGRESS.md for why an explicit timeout is mandatory here.
  }, 180000);

  afterAll(async () => {
    await purgeFixtures();
    await app.close();
  }, 120000);

  describe("resolving a school from the hostname", () => {
    it("reads the school from its subdomain", async () => {
      const res = await request(app.getHttpServer())
        .get("/v1/branding/public")
        .set("Host", `${school.slug}.localhost`)
        .expect(200);

      expect(res.body.resolvedFrom).toBe("host");
      expect(res.body.branding.schoolSlug).toBe(school.slug);
      expect(res.body.branding.schoolName).toBe(school.slug);
    });

    it("returns the defaults for a school that has never set any branding", async () => {
      const res = await request(app.getHttpServer())
        .get("/v1/branding/public")
        .set("Host", `${other.slug}.localhost`)
        .expect(200);

      expect(res.body.branding).toMatchObject({
        primaryColor: "#1d4ed8",
        accentColor: "#0f766e",
        onPrimaryColor: "#ffffff",
        logoUrl: null,
        tagline: null,
      });
    });

    it("treats the apex as no school rather than an error", async () => {
      const res = await request(app.getHttpServer())
        .get("/v1/branding/public")
        .set("Host", "localhost")
        .expect(200);

      expect(res.body).toEqual({ resolvedFrom: "none", branding: null });
    });

    it.each(["www", "api", "admin"])("refuses the reserved subdomain %s", async (label) => {
      const res = await request(app.getHttpServer())
        .get("/v1/branding/public")
        .set("Host", `${label}.localhost`)
        .expect(200);

      expect(res.body.resolvedFrom).toBe("none");
    });

    it("returns none for a subdomain no school answers to", async () => {
      const res = await request(app.getHttpServer())
        .get("/v1/branding/public")
        .set("Host", `${FIXTURE_PREFIX}nobody.localhost`)
        .expect(200);

      expect(res.body.resolvedFrom).toBe("none");
    });

    it("falls back to an explicit slug when the host says nothing", async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/branding/public?schoolSlug=${school.slug}`)
        .set("Host", "localhost")
        .expect(200);

      expect(res.body.resolvedFrom).toBe("slug");
      expect(res.body.branding.schoolSlug).toBe(school.slug);
    });

    it("lets the host win over a query parameter naming a different school", async () => {
      // A page served from one school's address must not be talked into
      // wearing another school's name.
      const res = await request(app.getHttpServer())
        .get(`/v1/branding/public?schoolSlug=${other.slug}`)
        .set("Host", `${school.slug}.localhost`)
        .expect(200);

      expect(res.body.branding.schoolSlug).toBe(school.slug);
    });

    it("resolves a school by its own custom domain", async () => {
      await controlPrisma.school.update({
        where: { slug: school.slug },
        data: { customDomain: CUSTOM_DOMAIN },
      });

      const res = await request(app.getHttpServer())
        .get("/v1/branding/public")
        .set("Host", CUSTOM_DOMAIN)
        .expect(200);

      expect(res.body.resolvedFrom).toBe("host");
      expect(res.body.branding.schoolSlug).toBe(school.slug);
    });

    it("takes a suspended school's login page down at once, not a cache TTL later", async () => {
      const target = await controlPrisma.school.findUniqueOrThrow({ where: { slug: other.slug } });

      // Warm the host cache first — suspending something nobody has looked
      // at proves nothing, and the cache is exactly what could keep serving
      // a school that has just been cut off.
      await request(app.getHttpServer())
        .get("/v1/branding/public")
        .set("Host", `${other.slug}.localhost`)
        .expect(200);

      // Through the platform endpoint, not a direct row update: the
      // invalidation that makes this immediate lives in SchoolsService, and
      // writing the status straight to the database would skip the very
      // thing under test.
      await request(app.getHttpServer())
        .patch(`/v1/platform/schools/${target.id}/suspend`)
        .set("Authorization", `Bearer ${platformToken}`)
        .send({ reason: "e2e" })
        .expect(200);

      try {
        const res = await request(app.getHttpServer())
          .get("/v1/branding/public")
          .set("Host", `${other.slug}.localhost`)
          .expect(200);

        expect(res.body).toEqual({ resolvedFrom: "none", branding: null });
      } finally {
        await request(app.getHttpServer())
          .patch(`/v1/platform/schools/${target.id}/reactivate`)
          .set("Authorization", `Bearer ${platformToken}`)
          .send({ reason: "e2e" })
          .expect(200);
      }
    });

    it("brings it back the moment it is reactivated", async () => {
      const res = await request(app.getHttpServer())
        .get("/v1/branding/public")
        .set("Host", `${other.slug}.localhost`)
        .expect(200);

      expect(res.body.resolvedFrom).toBe("host");
    });
  });

  describe("what the public endpoint exposes", () => {
    it("returns exactly the branding fields and nothing else", async () => {
      const res = await request(app.getHttpServer())
        .get("/v1/branding/public")
        .set("Host", `${school.slug}.localhost`)
        .expect(200);

      expect(Object.keys(res.body.branding).sort()).toEqual([
        "accentColor",
        "logoUrl",
        "onPrimaryColor",
        "primaryColor",
        "schoolName",
        "schoolSlug",
        "tagline",
      ]);
    });

    it("needs no authentication at all, which is the whole point", async () => {
      await request(app.getHttpServer())
        .get("/v1/branding/public")
        .set("Host", `${school.slug}.localhost`)
        .expect(200);
    });
  });

  describe("editing branding", () => {
    it("refuses an unauthenticated read of the admin endpoint", async () => {
      await request(app.getHttpServer()).get("/v1/branding").expect(401);
    });

    it("lets a school admin set the name, tagline and colours", async () => {
      const res = await request(app.getHttpServer())
        .patch("/v1/branding")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          displayName: "St Mary's College",
          tagline: "Learning with purpose",
          primaryColor: "#B91C1C",
          accentColor: "#f59e0b",
        })
        .expect(200);

      expect(res.body).toMatchObject({
        schoolName: "St Mary's College",
        tagline: "Learning with purpose",
        primaryColor: "#b91c1c",
        accentColor: "#f59e0b",
      });
    });

    it("normalises the colour it stores rather than keeping the spelling it was given", async () => {
      const res = await request(app.getHttpServer())
        .patch("/v1/branding")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ primaryColor: "#ABC" })
        .expect(200);

      expect(res.body.primaryColor).toBe("#aabbcc");
    });

    it("computes a readable text colour instead of assuming white", async () => {
      const res = await request(app.getHttpServer())
        .patch("/v1/branding")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ primaryColor: "#fde047" })
        .expect(200);

      expect(res.body.onPrimaryColor).toBe("#000000");

      await request(app.getHttpServer())
        .patch("/v1/branding")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ primaryColor: "#b91c1c" })
        .expect(200);
    });

    it("falls back to the registered name when the display name is cleared", async () => {
      const res = await request(app.getHttpServer())
        .patch("/v1/branding")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ displayName: "   " })
        .expect(200);

      expect(res.body.schoolName).toBe(school.slug);

      await request(app.getHttpServer())
        .patch("/v1/branding")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ displayName: "St Mary's College" })
        .expect(200);
    });

    it.each(["red", "1d4ed8", "#12345", "rgb(0,0,0)", "#fff;} body{display:none}"])(
      "refuses %s as a colour",
      async (value) => {
        await request(app.getHttpServer())
          .patch("/v1/branding")
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ primaryColor: value })
          .expect(400);
      },
    );

    it("does not let a teacher change the school's branding", async () => {
      await request(app.getHttpServer())
        .patch("/v1/branding")
        .set("Authorization", `Bearer ${teacherToken}`)
        .send({ primaryColor: "#000000" })
        .expect(403);
    });

    it("lets a teacher read it, since the console they use is drawn from it", async () => {
      await request(app.getHttpServer())
        .get("/v1/branding")
        .set("Authorization", `Bearer ${teacherToken}`)
        .expect(200);
    });

    it("keeps one school's changes out of another's", async () => {
      const mine = await request(app.getHttpServer())
        .get("/v1/branding")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      const theirs = await request(app.getHttpServer())
        .get("/v1/branding")
        .set("Authorization", `Bearer ${otherAdminToken}`)
        .expect(200);

      expect(mine.body.primaryColor).toBe("#b91c1c");
      expect(theirs.body.primaryColor).toBe("#1d4ed8");
      expect(theirs.body.schoolName).toBe(other.slug);
    });
  });

  describe("the logo", () => {
    let logoUrl: string;

    it("accepts a PNG from a school admin and serves it back publicly", async () => {
      const uploaded = await request(app.getHttpServer())
        .post("/v1/branding/logo")
        .set("Authorization", `Bearer ${adminToken}`)
        .attach("file", PNG_1PX, { filename: "crest.png", contentType: "image/png" })
        .expect(201);

      logoUrl = uploaded.body.logoUrl;
      expect(logoUrl).toMatch(new RegExp(`^/v1/branding/logo/${school.slug}/[0-9a-f-]{36}\\.png$`));

      const served = await request(app.getHttpServer()).get(logoUrl).expect(200);
      expect(served.headers["content-type"]).toContain("image/png");
      expect(Buffer.from(served.body)).toEqual(PNG_1PX);
    });

    it("never exposes the storage key, only the URL", async () => {
      const res = await request(app.getHttpServer())
        .get("/v1/branding")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(JSON.stringify(res.body)).not.toContain("schools/");
      expect(res.body.logoKey).toBeUndefined();
    });

    it("refuses an SVG, which could carry a script onto the login page", async () => {
      const res = await request(app.getHttpServer())
        .post("/v1/branding/logo")
        .set("Authorization", `Bearer ${adminToken}`)
        .attach("file", SVG_LOGO, { filename: "logo.svg", contentType: "image/svg+xml" })
        .expect(400);

      expect(res.body.message).toMatch(/svg/i);
    });

    it("refuses a type that is not an image at all", async () => {
      await request(app.getHttpServer())
        .post("/v1/branding/logo")
        .set("Authorization", `Bearer ${adminToken}`)
        .attach("file", Buffer.from("<html></html>"), { filename: "x.html", contentType: "text/html" })
        .expect(400);
    });

    it("does not let a teacher replace it", async () => {
      await request(app.getHttpServer())
        .post("/v1/branding/logo")
        .set("Authorization", `Bearer ${teacherToken}`)
        .attach("file", PNG_1PX, { filename: "crest.png", contentType: "image/png" })
        .expect(403);
    });

    it("cannot be fetched under another school's slug", async () => {
      // The filename is real and the school is real — only the pairing is
      // wrong, which is exactly the request a curious user would construct.
      const name = logoUrl.split("/").pop();
      await request(app.getHttpServer()).get(`/v1/branding/logo/${other.slug}/${name}`).expect(404);
    });

    it("refuses a traversing filename", async () => {
      await request(app.getHttpServer())
        .get(`/v1/branding/logo/${school.slug}/..%2F..%2Fetc%2Fpasswd`)
        .expect(404);
    });

    it("stops serving the file once the logo is removed", async () => {
      await request(app.getHttpServer())
        .delete("/v1/branding/logo")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      await request(app.getHttpServer()).get(logoUrl).expect(404);

      const res = await request(app.getHttpServer())
        .get("/v1/branding/public")
        .set("Host", `${school.slug}.localhost`)
        .expect(200);
      expect(res.body.branding.logoUrl).toBeNull();
    });
  });
});
