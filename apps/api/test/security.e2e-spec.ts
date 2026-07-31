import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.service";
import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../src/config/env.validation";
import { MAX_FAILED_ATTEMPTS } from "../src/auth/login-lockout";

const FIXTURE_PREFIX = "security-fixture-";

async function purgeFixtures(prisma: PrismaService): Promise<void> {
  await prisma.user.deleteMany({ where: { email: { startsWith: FIXTURE_PREFIX } } });
}

/**
 * The longest rate-limit window this suite is willing to wait out between
 * tests. `.env` sets a one-second window for exactly this reason.
 *
 * Without a cap the suite silently becomes a sleep: pointed at production
 * settings it would wait a full minute before each test and look like a hang
 * rather than a misconfiguration. Past that ceiling the burst tests report
 * why they were skipped instead.
 */
const MAX_DRAINABLE_WINDOW_MS = 5_000;

/**
 * Waits out the current rate-limit window so one test's burst cannot spill
 * into the next.
 */
async function drainRateLimitWindow(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, Math.min(ms, MAX_DRAINABLE_WINDOW_MS) + 250));
}

describe("Security hardening (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ttlMs: number;
  let authLimit: number;
  let globalLimit: number;

  const suffix = Date.now();
  const victimEmail = `${FIXTURE_PREFIX}victim-${suffix}@wisdomshop.example`;
  const password = "Sup3rSecret!Pass";

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.init();

    // Bind the server once, up front. supertest otherwise calls listen(0) per
    // request and closes it when that request finishes — with the parallel
    // bursts below, the first response to land tears the listener down under
    // the others and they fail with ECONNRESET rather than the 429 the test
    // is about. Pre-listening makes supertest reuse the existing address.
    const server = app.getHttpServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));

    prisma = app.get(PrismaService);

    const config = app.get<ConfigService<EnvConfig, true>>(ConfigService);
    ttlMs = config.get("RATE_LIMIT_TTL_MS", { infer: true });
    authLimit = config.get("AUTH_RATE_LIMIT_LIMIT", { infer: true });
    globalLimit = config.get("RATE_LIMIT_LIMIT", { infer: true });

    await purgeFixtures(prisma);
    await http()
      .post("/v1/auth/register")
      .send({ email: victimEmail, password, firstName: "Vic", lastName: "Tim" })
      .expect(201);
  });

  afterAll(async () => {
    if (prisma) await purgeFixtures(prisma).catch(() => undefined);
    if (app) await app.close();
  });

  beforeEach(async () => {
    // Every test here is about limits, so each starts from a clean window.
    await drainRateLimitWindow(ttlMs);
  });

  describe("account lockout", () => {
    afterEach(async () => {
      await prisma.user.updateMany({
        where: { email: victimEmail },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    });

    it("locks an account after repeated wrong passwords, then refuses even the right one", async () => {
      for (let i = 0; i < MAX_FAILED_ATTEMPTS; i += 1) {
        await http()
          .post("/v1/auth/login")
          .send({ email: victimEmail, password: "definitely-not-the-password" })
          .expect(401);
      }

      // The correct password now fails too — that is the whole point. If this
      // returned 200 the counter would be decorative.
      const blocked = await http()
        .post("/v1/auth/login")
        .send({ email: victimEmail, password })
        .expect(403);
      expect(JSON.stringify(blocked.body)).toMatch(/too many failed sign-in attempts/i);

      const locked = await prisma.user.findUniqueOrThrow({ where: { email: victimEmail } });
      expect(locked.failedLoginAttempts).toBeGreaterThanOrEqual(MAX_FAILED_ATTEMPTS);
      expect(locked.lockedUntil).not.toBeNull();
    });

    it("lets the right password through once the lock has expired", async () => {
      for (let i = 0; i < MAX_FAILED_ATTEMPTS; i += 1) {
        await http()
          .post("/v1/auth/login")
          .send({ email: victimEmail, password: "definitely-not-the-password" })
          .expect(401);
      }

      // Move the lock into the past rather than sleeping out a real minute.
      await prisma.user.update({
        where: { email: victimEmail },
        data: { lockedUntil: new Date(Date.now() - 1000) },
      });

      const res = await http().post("/v1/auth/login").send({ email: victimEmail, password }).expect(200);
      expect(res.body.accessToken).toBeDefined();

      // ...and the successful login wiped the counter, so the next mistake
      // starts from one rather than instantly re-locking.
      const after = await prisma.user.findUniqueOrThrow({ where: { email: victimEmail } });
      expect(after.failedLoginAttempts).toBe(0);
      expect(after.lockedUntil).toBeNull();
    });

    it("resets the counter on a successful login before the threshold", async () => {
      for (let i = 0; i < MAX_FAILED_ATTEMPTS - 1; i += 1) {
        await http()
          .post("/v1/auth/login")
          .send({ email: victimEmail, password: "wrong" })
          .expect(401);
      }

      await http().post("/v1/auth/login").send({ email: victimEmail, password }).expect(200);

      const after = await prisma.user.findUniqueOrThrow({ where: { email: victimEmail } });
      expect(after.failedLoginAttempts).toBe(0);
    });

    it("does not lock a different account", async () => {
      for (let i = 0; i < MAX_FAILED_ATTEMPTS; i += 1) {
        await http()
          .post("/v1/auth/login")
          .send({ email: victimEmail, password: "wrong" })
          .expect(401);
      }
      // Locked from here on — the next attempt is refused before the password
      // is even looked at.
      await http().post("/v1/auth/login").send({ email: victimEmail, password: "wrong" }).expect(403);

      // An unrelated account must still be able to sign in — the lock is
      // scoped to the account under attack, not to the whole login route.
      const otherEmail = `${FIXTURE_PREFIX}bystander-${suffix}@wisdomshop.example`;
      await http()
        .post("/v1/auth/register")
        .send({ email: otherEmail, password, firstName: "By", lastName: "Stander" })
        .expect(201);
      await http().post("/v1/auth/login").send({ email: otherEmail, password }).expect(200);
    });

    it("reveals nothing about whether an unknown account exists", async () => {
      const unknown = `${FIXTURE_PREFIX}nobody-${suffix}@wisdomshop.example`;
      for (let i = 0; i < MAX_FAILED_ATTEMPTS + 2; i += 1) {
        const res = await http().post("/v1/auth/login").send({ email: unknown, password: "wrong" });
        // Always 401, never the 403 that would confirm an account exists to
        // be locked.
        expect(res.status).toBe(401);
      }
    });
  });

  describe("malformed input", () => {
    it("rejects a NUL byte in the path instead of letting it reach the database", async () => {
      // Previously a 500: Postgres refuses 0x00 in a text column, so the
      // driver threw and the request was reported as a server fault.
      await http().get("/v1/products/%00").expect(400);
      await http().get("/v1/products/abc%00def").expect(400);
    });

    it("still serves ordinary slugs", async () => {
      // The guard must not reject anything that merely looks similar.
      const res = await http().get("/v1/products/definitely-not-a-real-slug-000");
      expect(res.status).toBe(404);
    });

    it("does not disclose internals when something does fail", async () => {
      const res = await http().get("/v1/products/%00");
      expect(JSON.stringify(res.body)).not.toMatch(/prisma|postgres|\/workspace\//i);
    });
  });

  describe("rate limiting", () => {
    // Bursting against a production-length window would poison every later
    // request from this IP for a quarter of an hour, so these only run when
    // the configured window is short enough to wait out.
    const burstable = () => ttlMs <= MAX_DRAINABLE_WINDOW_MS;

    it("throttles credential routes harder than ordinary ones", async () => {
      if (!burstable()) {
        // Not silently passing: the assertion below is the point of the test.
        expect(authLimit).toBeLessThan(globalLimit);
        console.warn(`Skipped burst: RATE_LIMIT_TTL_MS=${ttlMs}ms exceeds the drainable window.`);
        return;
      }
      // Retried for the same reason as the global-bucket test below: a burst
      // that straddles a window boundary is split across two allowances and
      // legitimately sees no 429. On a loaded machine the requests spread out
      // far enough for that to happen, which made this fail intermittently in
      // a full run while passing on its own.
      //
      // The email does not exist, so this exercises the limiter without
      // touching any account's lockout counter.
      let statuses: number[] = [];
      for (let round = 0; round < 5 && !statuses.includes(429); round += 1) {
        const attempts = Array.from({ length: authLimit + 5 }, () =>
          http()
            .post("/v1/auth/login")
            .send({ email: `${FIXTURE_PREFIX}flood-${suffix}@wisdomshop.example`, password: "wrong" }),
        );
        statuses = (await Promise.all(attempts)).map((r) => r.status);
        if (!statuses.includes(429)) await drainRateLimitWindow(ttlMs);
      }

      expect(statuses).toContain(429);
      // The strict bucket is stricter than the global one — otherwise it is
      // not adding anything.
      expect(authLimit).toBeLessThan(globalLimit);
    });

    it("leaves ordinary routes on the looser global bucket", async () => {
      if (!burstable()) return;
      // Comfortably above the strict limit but below the global one: if the
      // strict bucket were leaking onto unmarked routes, this would 429.
      const burst = Array.from({ length: authLimit + 5 }, () => http().get("/v1/categories"));
      const statuses = (await Promise.all(burst)).map((r) => r.status);

      expect(statuses).not.toContain(429);
      expect(statuses.every((s) => s === 200)).toBe(true);
    });

    it("throttles ordinary routes once the global limit is passed", async () => {
      if (!burstable()) return;

      // Retried rather than fired once: a burst that happens to straddle a
      // window boundary is split across two allowances and legitimately sees
      // no 429. That is a property of the clock, not of the limiter, so the
      // test retries instead of encoding a lucky burst size.
      let sawRejection = false;
      for (let round = 0; round < 5 && !sawRejection; round += 1) {
        const burst = Array.from({ length: globalLimit + 15 }, () => http().get("/v1/categories"));
        const statuses = (await Promise.all(burst)).map((r) => r.status);
        sawRejection = statuses.includes(429);
        if (!sawRejection) await drainRateLimitWindow(ttlMs);
      }

      expect(sawRejection).toBe(true);
    });
  });
});
