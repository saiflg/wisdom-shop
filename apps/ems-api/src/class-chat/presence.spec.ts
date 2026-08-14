import {
  canSeePresence,
  describePresence,
  isOnline,
  ONLINE_WINDOW_MS,
  presenceLabel,
  presenceOf,
  RECENT_WINDOW_MS,
} from "./presence";

const NOW = new Date("2026-08-14T12:00:00Z");
const agoMs = (ms: number) => new Date(NOW.getTime() - ms);

describe("presenceOf", () => {
  it("is ONLINE for somebody active moments ago", () => {
    expect(presenceOf(agoMs(30_000), NOW)).toBe("ONLINE");
  });

  it("stays ONLINE to the edge of the window", () => {
    // A child who closed the tab to think about a reply has not left.
    expect(presenceOf(agoMs(ONLINE_WINDOW_MS), NOW)).toBe("ONLINE");
  });

  it("becomes RECENTLY just past it", () => {
    expect(presenceOf(agoMs(ONLINE_WINDOW_MS + 1_000), NOW)).toBe("RECENTLY");
  });

  it("stays RECENTLY to the edge of the hour", () => {
    expect(presenceOf(agoMs(RECENT_WINDOW_MS), NOW)).toBe("RECENTLY");
  });

  it("is AWAY beyond that", () => {
    expect(presenceOf(agoMs(RECENT_WINDOW_MS + 1_000), NOW)).toBe("AWAY");
  });

  it("is AWAY for somebody who has never signed in", () => {
    expect(presenceOf(null, NOW)).toBe("AWAY");
    expect(presenceOf(undefined, NOW)).toBe("AWAY");
  });

  it("treats a future timestamp as present rather than as an error", () => {
    // Clock skew must not make a teacher look away to their whole class.
    expect(presenceOf(new Date(NOW.getTime() + 60_000), NOW)).toBe("ONLINE");
  });
});

describe("isOnline", () => {
  it("is true only for the online state", () => {
    expect(isOnline(agoMs(10_000), NOW)).toBe(true);
    expect(isOnline(agoMs(RECENT_WINDOW_MS - 1_000), NOW)).toBe(false);
    expect(isOnline(null, NOW)).toBe(false);
  });
});

describe("presenceLabel", () => {
  it("uses words, never a time", () => {
    // "last seen 22:41" answers a question nobody asked, and one a child
    // should not have to explain to a classmate.
    expect(presenceLabel("ONLINE")).toBe("Online");
    expect(presenceLabel("RECENTLY")).toBe("Here recently");
  });

  it("says nothing at all for somebody away", () => {
    expect(presenceLabel("AWAY")).toBe("");
  });
});

describe("describePresence", () => {
  it("reports state, flag and label together", () => {
    expect(describePresence(agoMs(1_000), NOW)).toEqual({
      presence: "ONLINE",
      online: true,
      label: "Online",
    });
  });

  it("never exposes the underlying timestamp", () => {
    const view = describePresence(agoMs(1_000), NOW);
    expect(Object.keys(view).sort()).toEqual(["label", "online", "presence"]);
  });
});

describe("canSeePresence", () => {
  it("lets students and staff see who is about", () => {
    expect(canSeePresence({ roles: ["STUDENT"] })).toBe(true);
    expect(canSeePresence({ roles: ["TEACHER"] })).toBe(true);
    expect(canSeePresence({ roles: ["SCHOOL_ADMIN"] })).toBe(true);
  });

  it("does NOT let a guardian see who is online", () => {
    // Which of their child's classmates is online at nine in the evening is
    // somebody else's family's business.
    expect(canSeePresence({ roles: ["GUARDIAN"] })).toBe(false);
  });

  it("refuses a guardian who also holds another role", () => {
    expect(canSeePresence({ roles: ["GUARDIAN", "STUDENT"] })).toBe(false);
  });
});
