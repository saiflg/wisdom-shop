import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ThrottlerStorageService } from "@nestjs/throttler";
import { LoginThrottlerGuard } from "./login-throttler.guard";

/**
 * A rate limit is worth nothing if it does not bite, and worse than nothing if
 * it bites the wrong person. Both halves are checked here.
 *
 * These drive the real guard against the real in-memory store — no mock of the
 * counting itself, because the counting is the part that could be wrong.
 */

function contextFor(body: unknown, ip = "10.0.0.1"): ExecutionContext {
  const req = { body, ip, headers: {} };
  const res = { header: () => undefined, setHeader: () => undefined };

  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    getHandler: () => function login() {},
    getClass: () => class AuthController {},
  } as unknown as ExecutionContext;
}

async function buildGuard(): Promise<{ guard: LoginThrottlerGuard; storage: ThrottlerStorageService }> {
  const storage = new ThrottlerStorageService();
  const guard = new LoginThrottlerGuard(
    // No throttlers configured here on purpose: the guard supplies its own in
    // onModuleInit, which is the behaviour that keeps the global limiter's
    // settings and these from contaminating each other.
    { throttlers: [] },
    storage,
    new Reflector(),
  );
  await guard.onModuleInit();
  return { guard, storage };
}

/** Attempts until one is refused, capped so a broken limit cannot hang the run. */
async function attemptsUntilRefused(
  guard: LoginThrottlerGuard,
  context: ExecutionContext,
  cap = 50,
): Promise<number> {
  for (let attempt = 1; attempt <= cap; attempt++) {
    try {
      await guard.canActivate(context);
    } catch {
      return attempt;
    }
  }
  return Infinity;
}

describe("LoginThrottlerGuard", () => {
  let guard: LoginThrottlerGuard;
  let storage: ThrottlerStorageService;

  beforeEach(async () => {
    ({ guard, storage } = await buildGuard());
  });

  afterEach(() => storage.onApplicationShutdown());

  it("stops guessing at one account", async () => {
    const attacker = contextFor({ schoolSlug: "demo-academy", email: "head@demo.ng", password: "x" });

    // The eleventh is refused: ten got through.
    expect(await attemptsUntilRefused(guard, attacker)).toBe(LoginThrottlerGuard.LIMIT + 1);
  });

  it("does not lock out the rest of the staffroom on the same connection", async () => {
    /*
     * The failure this guards against is not a security hole, it is a Monday
     * morning. A school is one building on one connection: if the counter were
     * keyed by address, the eleventh person to sign in before assembly would be
     * refused, having done nothing wrong and with nothing to tell them why.
     */
    const ip = "197.210.0.9";
    const exhausted = contextFor({ schoolSlug: "demo-academy", email: "head@demo.ng" }, ip);
    for (let i = 0; i < LoginThrottlerGuard.LIMIT; i++) await guard.canActivate(exhausted);

    // Same building, same address, different person. Must be waved through.
    for (const who of ["bursar", "year3", "matron", "sports", "imam"]) {
      const colleague = contextFor({ schoolSlug: "demo-academy", email: `${who}@demo.ng` }, ip);
      await expect(guard.canActivate(colleague)).resolves.toBe(true);
    }
  });

  it("does not let a different spelling buy a fresh allowance", async () => {
    const plain = contextFor({ schoolSlug: "demo-academy", email: "head@demo.ng" });
    for (let i = 0; i < LoginThrottlerGuard.LIMIT; i++) await guard.canActivate(plain);

    const shouted = contextFor({ schoolSlug: "demo-academy", email: "HEAD@DEMO.NG" });
    await expect(guard.canActivate(shouted)).rejects.toBeDefined();
  });

  it("keeps the same address at two schools apart", async () => {
    const here = contextFor({ schoolSlug: "demo-academy", email: "head@demo.ng" });
    for (let i = 0; i < LoginThrottlerGuard.LIMIT; i++) await guard.canActivate(here);

    const there = contextFor({ schoolSlug: "other-school", email: "head@demo.ng" });
    await expect(guard.canActivate(there)).resolves.toBe(true);
  });

  it("falls back to the address when there is no account to count against", async () => {
    // A body with no email still has to be counted as something, or it is a
    // free channel. It counts against the machine that sent it.
    const nameless = contextFor({ password: "x" }, "203.0.113.5");
    expect(await attemptsUntilRefused(guard, nameless)).toBe(LoginThrottlerGuard.LIMIT + 1);

    const elsewhere = contextFor({ password: "x" }, "203.0.113.6");
    await expect(guard.canActivate(elsewhere)).resolves.toBe(true);
  });

  it("ignores throttler settings from the module, including the global limit", async () => {
    /*
     * The guard must not inherit the application-wide throttler. If it did,
     * the global 100-per-minute would be applied here with a PER-ACCOUNT key
     * and the account limit would never be reached first.
     */
    const storage2 = new ThrottlerStorageService();
    const generous = new LoginThrottlerGuard(
      { throttlers: [{ name: "default", limit: 100_000, ttl: 60_000 }] },
      storage2,
      new Reflector(),
    );
    await generous.onModuleInit();

    const attacker = contextFor({ schoolSlug: "demo-academy", email: "head@demo.ng" });
    expect(await attemptsUntilRefused(generous, attacker)).toBe(LoginThrottlerGuard.LIMIT + 1);

    storage2.onApplicationShutdown();
  });
});
