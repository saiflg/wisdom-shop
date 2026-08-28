import {
  alreadyEnded,
  describeDevice,
  isActive,
  revokeProblem,
  summariseSessions,
  type SessionLike,
} from "./session-rules";

const NOW = new Date("2026-08-28T10:00:00Z");
const later = new Date("2026-09-30T10:00:00Z");
const earlier = new Date("2026-08-01T10:00:00Z");

const session = (over: Partial<SessionLike> = {}): SessionLike => ({
  expiresAt: later,
  revokedAt: null,
  userAgent: null,
  createdAt: earlier,
  updatedAt: earlier,
  ...over,
});

describe("isActive", () => {
  it("is active when it has neither expired nor been revoked", () => {
    expect(isActive(session(), NOW)).toBe(true);
  });

  // The dangerous one.
  it("is not active once revoked, even though it has not expired", () => {
    // This is the session somebody ended deliberately. Treating "not expired"
    // as "active" would show it as live on the one screen whose purpose is
    // telling somebody what can still reach their account.
    expect(isActive(session({ revokedAt: NOW }), NOW)).toBe(false);
  });

  it("is not active once expired", () => {
    expect(isActive(session({ expiresAt: earlier }), NOW)).toBe(false);
  });

  it("treats expiry exactly now as over", () => {
    expect(isActive(session({ expiresAt: NOW }), NOW)).toBe(false);
  });
});

describe("describeDevice", () => {
  it("recognises the common browsers", () => {
    expect(
      describeDevice(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Safari/537.36",
      ),
    ).toBe("Chrome on Windows");

    expect(
      describeDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15"),
    ).toBe("Safari on macOS");

    expect(describeDevice("Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0")).toBe(
      "Firefox on Linux",
    );
  });

  // The ordering that every naive parser gets wrong.
  it("does not call Chrome 'Safari'", () => {
    // Every Chrome user-agent also says Safari. Testing Safari first would
    // mislabel most sessions in the school.
    const chrome =
      "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Mobile Safari/537.36";
    expect(describeDevice(chrome)).toBe("Chrome on Android");
  });

  it("does not call Edge 'Chrome'", () => {
    const edge =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Safari/537.36 Edg/138.0";
    expect(describeDevice(edge)).toBe("Edge on Windows");
  });

  // The honest fallback.
  it("says it does not know rather than guessing", () => {
    // A confident wrong label makes somebody dismiss a session they should
    // have looked at.
    expect(describeDevice(null)).toBe("Unknown device");
    expect(describeDevice("   ")).toBe("Unknown device");
    expect(describeDevice("curl/8.4.0")).toBe("Unknown device");
  });

  it("gives what it has when it only knows one half", () => {
    expect(describeDevice("Mozilla/5.0 (Windows NT 10.0)")).toBe("Windows");
  });
});

describe("summariseSessions", () => {
  it("separates active, revoked and expired", () => {
    const summary = summariseSessions(
      [
        session(),
        session(),
        session({ revokedAt: NOW }),
        session({ expiresAt: earlier }),
      ],
      NOW,
    );
    expect(summary).toEqual({ active: 2, revoked: 1, expired: 1 });
  });

  it("counts a revoked session as revoked even if it also expired", () => {
    // It was ended deliberately; that is the more useful fact about it.
    const summary = summariseSessions([session({ revokedAt: earlier, expiresAt: earlier })], NOW);
    expect(summary).toEqual({ active: 0, revoked: 1, expired: 0 });
  });

  it("summarises nothing as zeroes", () => {
    expect(summariseSessions([], NOW)).toEqual({ active: 0, revoked: 0, expired: 0 });
  });
});

describe("revokeProblem", () => {
  it("allows ending a live session", () => {
    expect(revokeProblem(session())).toBeNull();
  });

  // Not an error.
  it("allows ending one that has already ended", () => {
    // Somebody clicking twice because the first click seemed not to work
    // should be told it is already gone, not shown a failure that makes them
    // wonder whether their account is still reachable.
    expect(revokeProblem(session({ revokedAt: NOW }))).toBeNull();
  });

  it("refuses one that does not exist", () => {
    expect(revokeProblem(null)).toBe("That session does not exist");
  });
});

describe("alreadyEnded", () => {
  it("knows the difference between ending something and finding it ended", () => {
    expect(alreadyEnded(session(), NOW)).toBe(false);
    expect(alreadyEnded(session({ revokedAt: earlier }), NOW)).toBe(true);
    expect(alreadyEnded(session({ expiresAt: earlier }), NOW)).toBe(true);
  });
});
