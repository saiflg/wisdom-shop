import { isBenignRefreshRace } from "./refresh-race";

const NOW = new Date("2026-01-01T00:00:00.000Z");
const secondsAgo = (n: number) => new Date(NOW.getTime() - n * 1000);

const UA = "Mozilla/5.0 (Windows NT 10.0)";

function input(overrides: Partial<Parameters<typeof isBenignRefreshRace>[0]> = {}) {
  return {
    token: { revokedAt: secondsAgo(1), userAgent: UA },
    successor: { revokedAt: null },
    requestUserAgent: UA,
    graceMs: 15_000,
    now: NOW,
    ...overrides,
  };
}

describe("refresh token race tolerance", () => {
  it("tolerates a replay from one step behind, moments ago, same client", () => {
    // The two-tabs case this exists for.
    expect(isBenignRefreshRace(input())).toBe(true);
  });

  describe("refuses anything that is not that case", () => {
    it("refuses a replay outside the window", () => {
      expect(isBenignRefreshRace(input({ token: { revokedAt: secondsAgo(60), userAgent: UA } }))).toBe(false);
    });

    it("refuses when the chain has moved on", () => {
      // The successor was itself rotated, so this replay is more than one step
      // behind — no race produces that, but a captured token does.
      expect(isBenignRefreshRace(input({ successor: { revokedAt: secondsAgo(1) } }))).toBe(false);
    });

    it("refuses when the successor is unknown", () => {
      // Tokens rotated before the link existed cannot be shown to be one step
      // behind, so they get the strict treatment.
      expect(isBenignRefreshRace(input({ successor: null }))).toBe(false);
    });

    it("refuses a different browser, however recent", () => {
      expect(
        isBenignRefreshRace(input({ requestUserAgent: "curl/8.4.0", token: { revokedAt: NOW, userAgent: UA } })),
      ).toBe(false);
    });

    it("refuses a token that was never rotated out", () => {
      expect(isBenignRefreshRace(input({ token: { revokedAt: null, userAgent: UA } }))).toBe(false);
    });

    it("refuses everything when the grace is disabled", () => {
      // The escape hatch has to actually restore strict detection.
      expect(isBenignRefreshRace(input({ graceMs: 0 }))).toBe(false);
    });

    it("refuses a revocation timestamped in the future", () => {
      // A backwards clock must not turn into an unbounded window.
      expect(
        isBenignRefreshRace(input({ token: { revokedAt: new Date(NOW.getTime() + 60_000), userAgent: UA } })),
      ).toBe(false);
    });
  });

  describe("window boundary", () => {
    it("tolerates a replay exactly on the boundary", () => {
      expect(
        isBenignRefreshRace(input({ token: { revokedAt: secondsAgo(15), userAgent: UA }, graceMs: 15_000 })),
      ).toBe(true);
    });

    it("refuses one millisecond past it", () => {
      expect(
        isBenignRefreshRace(
          input({ token: { revokedAt: new Date(NOW.getTime() - 15_001), userAgent: UA }, graceMs: 15_000 }),
        ),
      ).toBe(false);
    });
  });

  describe("user agent handling", () => {
    it("treats both sides missing as the same client", () => {
      // Server-to-server callers send no user agent; that must not by itself
      // make every refresh look like theft.
      expect(
        isBenignRefreshRace(input({ token: { revokedAt: secondsAgo(1), userAgent: null }, requestUserAgent: undefined })),
      ).toBe(true);
    });

    it("refuses when only one side has a user agent", () => {
      expect(
        isBenignRefreshRace(input({ token: { revokedAt: secondsAgo(1), userAgent: null }, requestUserAgent: UA })),
      ).toBe(false);
      expect(
        isBenignRefreshRace(input({ token: { revokedAt: secondsAgo(1), userAgent: UA }, requestUserAgent: null })),
      ).toBe(false);
    });
  });
});
