import { loginAttemptKey } from "./login-attempt-key";

describe("loginAttemptKey", () => {
  it("counts two people at the same school separately", () => {
    const head = loginAttemptKey({ schoolSlug: "demo-academy", email: "head@demo.ng" });
    const bursar = loginAttemptKey({ schoolSlug: "demo-academy", email: "bursar@demo.ng" });

    // The whole point: forty staff on one school connection are forty
    // counters, not one shared allowance that the first arrivals exhaust.
    expect(head).not.toBe(bursar);
  });

  it("counts the same address at two schools separately", () => {
    const here = loginAttemptKey({ schoolSlug: "demo-academy", email: "head@demo.ng" });
    const there = loginAttemptKey({ schoolSlug: "other-school", email: "head@demo.ng" });

    expect(here).not.toBe(there);
  });

  it("does not hand out a fresh allowance for a different capitalisation", () => {
    // Without normalising, a guesser gets a new counter per spelling and the
    // limit means nothing at all.
    const plain = loginAttemptKey({ schoolSlug: "demo-academy", email: "head@demo.ng" });

    expect(loginAttemptKey({ schoolSlug: "demo-academy", email: "Head@Demo.NG" })).toBe(plain);
    expect(loginAttemptKey({ schoolSlug: "demo-academy", email: "  head@demo.ng  " })).toBe(plain);
    expect(loginAttemptKey({ schoolSlug: "DEMO-ACADEMY", email: "head@demo.ng" })).toBe(plain);
  });

  it("keeps a school account and a platform operator apart", () => {
    // A platform operator sends no slug. If the empty scope collided with a
    // school's, one could spend the other's allowance.
    const operator = loginAttemptKey({ email: "ops@wisdom.ng" });
    const atSchool = loginAttemptKey({ schoolSlug: "demo-academy", email: "ops@wisdom.ng" });

    expect(operator).not.toBe(atSchool);
    expect(operator).toBe(loginAttemptKey({ schoolSlug: "", email: "ops@wisdom.ng" }));
  });

  it("does not leak the address into the key", () => {
    const key = loginAttemptKey({ schoolSlug: "demo-academy", email: "head@demo.ng" });

    expect(key).not.toBeNull();
    expect(key).not.toContain("head");
    expect(key).not.toContain("demo");
    expect(key).toMatch(/^[0-9a-f]{32}$/);
  });

  it("returns null when there is nothing to attribute the attempt to", () => {
    // The caller falls back to the address. A body with no email is not an
    // attempt on any account, and inventing a shared key for all of them would
    // let one malformed request exhaust everybody's allowance.
    expect(loginAttemptKey(undefined)).toBeNull();
    expect(loginAttemptKey(null)).toBeNull();
    expect(loginAttemptKey("head@demo.ng")).toBeNull();
    expect(loginAttemptKey({})).toBeNull();
    expect(loginAttemptKey({ email: 42 })).toBeNull();
    expect(loginAttemptKey({ email: "   " })).toBeNull();
  });

  it("is not confused by a slug that is not a string", () => {
    // forbidNonWhitelisted rejects these at the pipe, but the guard runs
    // BEFORE the pipe — this function sees whatever was posted.
    expect(loginAttemptKey({ schoolSlug: { $ne: null }, email: "head@demo.ng" })).toBe(
      loginAttemptKey({ email: "head@demo.ng" }),
    );
  });
});
