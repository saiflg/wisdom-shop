import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";
import { CSRF_HEADER_NAME } from "../src/auth/auth.constants";

function extractRefreshCookie(res: request.Response): string {
  const raw = res.headers["set-cookie"] as unknown as string[] | undefined;
  const cookie = raw?.find((c) => c.startsWith("wisdom_shop_rt="));
  if (!cookie) throw new Error("No refresh cookie set on response");
  return cookie.split(";")[0];
}

describe("Auth (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e-${Date.now()}@wisdomshop.example`;
  const password = "Sup3rSecret!Pass";

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  // Guarded because Jest still runs afterAll when beforeAll fails. Without
  // these checks, teardown throws on an undefined prisma/app and that error
  // replaces the real beforeAll failure in the output.
  afterAll(async () => {
    if (prisma) await prisma.user.deleteMany({ where: { email } }).catch(() => undefined);
    if (app) await app.close();
  });

  it("rejects unauthenticated access to a protected route", async () => {
    await request(app.getHttpServer()).get("/v1/auth/me").expect(401);
  });

  it("serves an unauthenticated, unversioned health check", async () => {
    const res = await request(app.getHttpServer()).get("/health").expect(200);
    expect(res.body.status).toBeDefined();
  });

  let accessToken: string;
  let refreshCookie: string;

  it("registers a new account and returns tokens", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/auth/register")
      .send({ email, password, firstName: "E2E", lastName: "Test" })
      .expect(201);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.email).toBe(email);
    accessToken = res.body.accessToken;
    refreshCookie = extractRefreshCookie(res);
  });

  it("rejects duplicate registration", async () => {
    await request(app.getHttpServer())
      .post("/v1/auth/register")
      .send({ email, password, firstName: "E2E", lastName: "Test" })
      .expect(409);
  });

  it("returns the current user for a valid access token", async () => {
    const res = await request(app.getHttpServer())
      .get("/v1/auth/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.email).toBe(email);
    expect(res.body.roles).toContain("CUSTOMER");
  });

  it("rejects login with the wrong password", async () => {
    await request(app.getHttpServer())
      .post("/v1/auth/login")
      .send({ email, password: "wrong-password" })
      .expect(401);
  });

  it("rejects a refresh request missing the CSRF header", async () => {
    await request(app.getHttpServer())
      .post("/v1/auth/refresh")
      .set("Cookie", refreshCookie)
      .expect(403);
  });

  it("rotates tokens on refresh, and tolerates an immediate same-client replay", async () => {
    const res = await request(app.getHttpServer())
      .post("/v1/auth/refresh")
      .set("Cookie", refreshCookie)
      .set(CSRF_HEADER_NAME, "1")
      .expect(200);

    expect(res.body.accessToken).toBeDefined();
    const rotatedCookie = extractRefreshCookie(res);
    expect(rotatedCookie).not.toBe(refreshCookie);

    // This used to assert 401. It now asserts 200, deliberately: an immediate
    // replay from the same client, one step behind, is two browser tabs
    // sharing a cookie — not theft. Treating it as theft signed people out of
    // a browser they were actively using.
    //
    // Stolen-token containment is unchanged and is covered in depth by
    // refresh-race.e2e-spec.ts: a replay from further back in the chain, from
    // a different client, or outside the grace window still burns every
    // session. Those cases are not asserted here because they revoke the
    // session this suite goes on to use.
    const replay = await request(app.getHttpServer())
      .post("/v1/auth/refresh")
      .set("Cookie", refreshCookie)
      .set(CSRF_HEADER_NAME, "1")
      .expect(200);

    // The replay gets its own token rather than a copy of the other tab's.
    expect(extractRefreshCookie(replay)).not.toBe(rotatedCookie);

    refreshCookie = extractRefreshCookie(replay);
  });

  it("logs out and invalidates the refresh cookie", async () => {
    await request(app.getHttpServer())
      .post("/v1/auth/logout")
      .set("Cookie", refreshCookie)
      .set(CSRF_HEADER_NAME, "1")
      .expect(204);

    await request(app.getHttpServer())
      .post("/v1/auth/refresh")
      .set("Cookie", refreshCookie)
      .set(CSRF_HEADER_NAME, "1")
      .expect(401);
  });
});
