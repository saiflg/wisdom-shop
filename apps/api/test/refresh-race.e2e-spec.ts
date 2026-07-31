import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";
import { REFRESH_COOKIE_NAME } from "../src/auth/auth.constants";

const FIXTURE_PREFIX = "refreshrace-fixture-";
const UA = "Mozilla/5.0 (WisdomShopTest)";

async function purgeFixtures(prisma: PrismaService): Promise<void> {
  await prisma.user.deleteMany({ where: { email: { startsWith: FIXTURE_PREFIX } } });
}

/** Pulls the refresh cookie value out of a Set-Cookie header. */
function refreshCookieFrom(res: request.Response): string {
  const raw = res.headers["set-cookie"] as unknown as string[] | undefined;
  const cookie = (raw ?? []).find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
  if (!cookie) throw new Error("No refresh cookie was set");
  return cookie.split(";")[0];
}

describe("Refresh token races vs theft (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const suffix = Date.now();
  const email = `${FIXTURE_PREFIX}user-${suffix}@wisdomshop.example`;
  const password = "Sup3rSecret!Pass";

  const http = () => request(app.getHttpServer());

  async function signIn(): Promise<string> {
    const res = await http()
      .post("/v1/auth/login")
      .set("User-Agent", UA)
      .send({ email, password })
      .expect(200);
    return refreshCookieFrom(res);
  }

  const refreshWith = (cookie: string, userAgent = UA) =>
    http().post("/v1/auth/refresh").set("Cookie", cookie).set("User-Agent", userAgent).set("x-wisdom-shop-csrf", "1");

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.init();

    // Bound once so the parallel refreshes below don't tear down supertest's
    // per-request listener under each other.
    const server = app.getHttpServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));

    prisma = app.get(PrismaService);
    await purgeFixtures(prisma);

    await http()
      .post("/v1/auth/register")
      .set("User-Agent", UA)
      .send({ email, password, firstName: "Ra", lastName: "Ce" })
      .expect(201);
  });

  afterAll(async () => {
    if (prisma) await purgeFixtures(prisma).catch(() => undefined);
    if (app) await app.close();
  });

  it("keeps the session when two tabs refresh the same cookie at once", async () => {
    const cookie = await signIn();

    // Exactly the two-tabs case: one cookie, two simultaneous refreshes.
    const [first, second] = await Promise.all([refreshWith(cookie), refreshWith(cookie)]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    // The point is not merely that both got a 200 — it is that the account
    // still has live sessions afterwards. The old behaviour revoked them all.
    const live = await prisma.refreshToken.count({
      where: { user: { email }, revokedAt: null },
    });
    expect(live).toBeGreaterThan(0);

    // ...and the newest token actually works.
    const survivor = refreshCookieFrom(second.status === 200 ? second : first);
    await refreshWith(survivor).expect(200);
  });

  it("records a race as a race, not as theft", async () => {
    const cookie = await signIn();
    // Sequential rather than parallel: this must deterministically exercise
    // the replay-of-a-rotated-token path. With Promise.all the two requests
    // can both read the token as live and neither reaches it, which is a
    // different case (covered by the compare-and-swap test below).
    await refreshWith(cookie).expect(200);
    await refreshWith(cookie).expect(200);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const [race, theft] = await Promise.all([
      prisma.auditLog.count({
        where: { userId: user.id, action: "auth.refresh_token_race_tolerated" },
      }),
      prisma.auditLog.count({
        where: { userId: user.id, action: "auth.refresh_token_reuse_detected" },
      }),
    ]);

    expect(race).toBeGreaterThan(0);
    // A tolerated race must not also be logged as a theft, or the signal is
    // useless for spotting a real one.
    expect(theft).toBe(0);
  });

  it("lets only one concurrent request rotate a token", async () => {
    const cookie = await signIn();

    // Before the compare-and-swap, two concurrent refreshes could both read
    // the token as live and both rotate it — so a stolen token used at the
    // same moment as the real one succeeded silently and was never detected.
    // Exactly one may now claim the rotation.
    // Counted as a delta: earlier tests in this file rotate tokens for the
    // same user, so an absolute count measures the suite, not this test.
    const rotationsWhere = { user: { email }, replacedById: { not: null } };
    const before = await prisma.refreshToken.count({ where: rotationsWhere });

    await Promise.all([refreshWith(cookie), refreshWith(cookie), refreshWith(cookie)]);

    const after = await prisma.refreshToken.count({ where: rotationsWhere });
    expect(after - before).toBe(1);
  });

  it("STILL burns every session for a replay from further back in the chain", async () => {
    const cookie = await signIn();

    // Rotate twice, so the first cookie is two steps behind — the shape a
    // captured token has, and one no tab race produces.
    const second = await refreshWith(cookie).expect(200);
    const third = await refreshWith(refreshCookieFrom(second)).expect(200);
    const newest = refreshCookieFrom(third);

    await refreshWith(cookie).expect(401);

    const live = await prisma.refreshToken.count({
      where: { user: { email }, revokedAt: null },
    });
    expect(live).toBe(0);

    // The containment is real: the newest token is dead too.
    await refreshWith(newest).expect(401);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const theft = await prisma.auditLog.count({
      where: { userId: user.id, action: "auth.refresh_token_reuse_detected" },
    });
    expect(theft).toBeGreaterThan(0);
  });

  it("STILL burns every session when the replay comes from another client", async () => {
    const cookie = await signIn();
    const rotated = await refreshWith(cookie).expect(200);

    // Same instant, one step behind — a race in every respect except that it
    // is a different browser. That is theft.
    await refreshWith(cookie, "curl/8.4.0").expect(401);

    const live = await prisma.refreshToken.count({
      where: { user: { email }, revokedAt: null },
    });
    expect(live).toBe(0);
    await refreshWith(refreshCookieFrom(rotated)).expect(401);
  });

  it("STILL rejects a replay of a token that was never valid", async () => {
    await signIn();
    await refreshWith(`${REFRESH_COOKIE_NAME}=not-a-real-token`).expect(401);
  });
});
