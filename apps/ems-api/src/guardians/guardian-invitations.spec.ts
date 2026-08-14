import {
  INVITATION_TTL_DAYS,
  canAccept,
  daysRemaining,
  describeExpiry,
  expiryFor,
  invitationState,
  invitationUrl,
  needsInvitation,
  refusalReason,
  supersedes,
} from "./guardian-invitations";

const NOW = new Date("2026-08-14T09:00:00.000Z");

function invitation(overrides: Partial<Parameters<typeof invitationState>[0]> = {}) {
  return {
    expiresAt: new Date("2026-08-21T09:00:00.000Z"),
    acceptedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

describe("invitationState", () => {
  it("is pending while it is still in date and untouched", () => {
    expect(invitationState(invitation(), NOW)).toBe("PENDING");
  });

  it("is expired once the moment passes", () => {
    expect(invitationState(invitation({ expiresAt: new Date("2026-08-14T08:59:59.000Z") }), NOW)).toBe("EXPIRED");
  });

  it("expires exactly on the boundary rather than a millisecond later", () => {
    // A link that works "until 9am" must not still work at 9am.
    expect(invitationState(invitation({ expiresAt: NOW }), NOW)).toBe("EXPIRED");
  });

  it("reports an accepted invitation as accepted even after it would have expired", () => {
    // Otherwise the office is told to re-invite a parent who is already in.
    const used = invitation({
      acceptedAt: new Date("2026-08-15T09:00:00.000Z"),
      expiresAt: new Date("2026-08-16T09:00:00.000Z"),
    });
    expect(invitationState(used, new Date("2026-09-01T09:00:00.000Z"))).toBe("ACCEPTED");
  });

  it("reports a revoked invitation as revoked even after it would have expired", () => {
    const killed = invitation({
      revokedAt: new Date("2026-08-15T09:00:00.000Z"),
      expiresAt: new Date("2026-08-16T09:00:00.000Z"),
    });
    expect(invitationState(killed, new Date("2026-09-01T09:00:00.000Z"))).toBe("REVOKED");
  });

  it("counts acceptance ahead of revocation when somehow both are set", () => {
    // A parent who got in before the office cancelled it did get in, and
    // saying otherwise would hide a real access grant.
    const both = invitation({ acceptedAt: NOW, revokedAt: NOW });
    expect(invitationState(both, NOW)).toBe("ACCEPTED");
  });
});

describe("canAccept", () => {
  it("allows only a pending invitation", () => {
    expect(canAccept(invitation(), NOW)).toBe(true);
    expect(canAccept(invitation({ acceptedAt: NOW }), NOW)).toBe(false);
    expect(canAccept(invitation({ revokedAt: NOW }), NOW)).toBe(false);
    expect(canAccept(invitation({ expiresAt: NOW }), NOW)).toBe(false);
  });
});

describe("refusalReason", () => {
  it("says nothing about a usable invitation", () => {
    expect(refusalReason(invitation(), NOW)).toBeNull();
  });

  it("distinguishes used, cancelled and expired for whoever holds the token", () => {
    expect(refusalReason(invitation({ acceptedAt: NOW }), NOW)).toMatch(/already been used/i);
    expect(refusalReason(invitation({ revokedAt: NOW }), NOW)).toMatch(/cancelled/i);
    expect(refusalReason(invitation({ expiresAt: NOW }), NOW)).toMatch(/expired/i);
  });

  it("points a superseded link at the newer email rather than at the school", () => {
    // The likeliest real failure: two emails, and they opened the older one.
    // Telling them to ring the office for a link already in their inbox
    // wastes a call on both sides.
    const superseded = invitation({ revokedAt: NOW, revokedReason: "SUPERSEDED" });
    expect(refusalReason(superseded, NOW)).toMatch(/newer invitation|most recent/i);
    expect(refusalReason(superseded, NOW)).not.toMatch(/cancelled/i);
  });

  it("still sends a genuinely cancelled link back to the school", () => {
    const cancelled = invitation({ revokedAt: NOW, revokedReason: "CANCELLED" });
    expect(refusalReason(cancelled, NOW)).toMatch(/cancelled/i);
  });

  it("treats a revocation with no recorded reason as a cancellation", () => {
    // Rows written before the reason existed must not claim a newer
    // invitation was sent when none was.
    expect(refusalReason(invitation({ revokedAt: NOW }), NOW)).toMatch(/cancelled/i);
  });

  it("tells the parent what to do next in every refusal", () => {
    // A dead end that does not say "ask the school" leaves a parent stuck.
    for (const dead of [{ acceptedAt: NOW }, { revokedAt: NOW }, { expiresAt: NOW }]) {
      expect(refusalReason(invitation(dead), NOW)).toMatch(/school|signing in/i);
    }
  });
});

describe("daysRemaining", () => {
  it("rounds a part day up rather than down", () => {
    // Four hours left is honestly a day, not zero.
    const soon = invitation({ expiresAt: new Date("2026-08-14T13:00:00.000Z") });
    expect(daysRemaining(soon, NOW)).toBe(1);
  });

  it("never goes negative", () => {
    expect(daysRemaining(invitation({ expiresAt: new Date("2026-08-01T09:00:00.000Z") }), NOW)).toBe(0);
  });

  it("gives the full span for a fresh invitation", () => {
    expect(daysRemaining(invitation({ expiresAt: expiryFor(NOW) }), NOW)).toBe(INVITATION_TTL_DAYS);
  });
});

describe("describeExpiry", () => {
  it("uses words rather than a timestamp", () => {
    expect(describeExpiry(invitation(), NOW)).toBe("Expires in 6 days");
    expect(describeExpiry(invitation({ expiresAt: new Date("2026-08-15T20:00:00.000Z") }), NOW)).toBe(
      "Expires tomorrow",
    );
    expect(describeExpiry(invitation({ expiresAt: new Date("2026-08-14T20:00:00.000Z") }), NOW)).toBe(
      "Expires today",
    );
  });

  it("names a finished invitation by what happened to it", () => {
    expect(describeExpiry(invitation({ acceptedAt: NOW }), NOW)).toBe("Used");
    expect(describeExpiry(invitation({ revokedAt: NOW }), NOW)).toBe("Cancelled");
    expect(describeExpiry(invitation({ expiresAt: NOW }), NOW)).toBe("Expired");
  });

  it("distinguishes a replaced invitation from a cancelled one in the office's list", () => {
    expect(describeExpiry(invitation({ revokedAt: NOW, revokedReason: "SUPERSEDED" }), NOW)).toBe(
      "Replaced by a newer one",
    );
    expect(describeExpiry(invitation({ revokedAt: NOW, revokedReason: "CANCELLED" }), NOW)).toBe("Cancelled");
  });

  it("never puts a date or a time in front of the office", () => {
    const described = describeExpiry(invitation(), NOW);
    expect(described).not.toMatch(/\d{4}-\d{2}-\d{2}|:\d{2}|GMT|Z$/);
  });
});

describe("needsInvitation", () => {
  it("is true for an account that exists on paper and has never been set up", () => {
    expect(needsInvitation({ email: "mum@example.com", hasPassword: false })).toBe(true);
  });

  it("is false once they have a password", () => {
    expect(needsInvitation({ email: "mum@example.com", hasPassword: true })).toBe(false);
  });

  it("is false with no email, because there is nowhere to send it", () => {
    // That family is a different problem — unreachable — and counting them
    // here would tell the office to send an invitation into the void.
    expect(needsInvitation({ email: null, hasPassword: false })).toBe(false);
  });
});

describe("supersedes", () => {
  it("cancels a pending predecessor", () => {
    expect(supersedes(invitation(), NOW)).toBe(true);
  });

  it("leaves an accepted one alone as history", () => {
    expect(supersedes(invitation({ acceptedAt: NOW }), NOW)).toBe(false);
  });

  it("does not bother re-cancelling something already dead", () => {
    expect(supersedes(invitation({ revokedAt: NOW }), NOW)).toBe(false);
    expect(supersedes(invitation({ expiresAt: NOW }), NOW)).toBe(false);
  });
});

describe("invitationUrl", () => {
  it("puts the token in the path, never the query string", () => {
    // Query strings turn up in server logs, proxy logs and Referer headers.
    const url = invitationUrl("https://school.example", "demo-academy", "abc123");
    expect(url).toBe("https://school.example/invite/demo-academy/abc123");
    expect(url).not.toContain("?");
  });

  it("does not double the slash when the base url has a trailing one", () => {
    expect(invitationUrl("https://school.example/", "demo-academy", "abc123")).toBe(
      "https://school.example/invite/demo-academy/abc123",
    );
  });

  it("escapes a token so it cannot break out of its path segment", () => {
    expect(invitationUrl("https://school.example", "demo-academy", "a/b?c")).toBe(
      "https://school.example/invite/demo-academy/a%2Fb%3Fc",
    );
  });
});
