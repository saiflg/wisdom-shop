import {
  BURST_LIMIT,
  MAX_MESSAGE_LENGTH,
  MIN_INTERVAL_MS,
  SUPERVISION_NOTICE,
  canDelete,
  canLock,
  canPost,
  canReadConversation,
  checkMessage,
  explainProblem,
  isStaff,
  toMessageView,
  type ChatViewer,
  type StoredMessage,
} from "./class-chat-rules";

function viewer(overrides: Partial<ChatViewer> = {}): ChatViewer {
  return { userId: "u1", roles: ["STUDENT"], enrolled: true, teachesClass: false, ...overrides };
}

function message(overrides: Partial<StoredMessage> = {}): StoredMessage {
  return {
    id: "m1",
    authorUserId: "u1",
    authorName: "Zainab Bello",
    authorRole: "STUDENT",
    body: "Does anyone have the maths homework?",
    createdAt: new Date("2026-08-10T09:00:00.000Z"),
    deletedAt: null,
    deletedByUserId: null,
    ...overrides,
  };
}

describe("who may read a class conversation", () => {
  it("lets an enrolled student read their own class", () => {
    expect(canReadConversation(viewer({ enrolled: true }))).toBe(true);
  });

  it("REFUSES a student who is not in the class", () => {
    // The invariant this module exists for. A class chat is a room, and
    // being in the school is not being in the room.
    expect(canReadConversation(viewer({ enrolled: false }))).toBe(false);
  });

  it("lets any teacher or administrator read, whether or not they teach it", () => {
    // Moderation that requires being a member first arrives too late.
    expect(canReadConversation(viewer({ roles: ["TEACHER"], enrolled: false, teachesClass: false }))).toBe(true);
    expect(canReadConversation(viewer({ roles: ["SCHOOL_ADMIN"], enrolled: false }))).toBe(true);
  });

  it("REFUSES a guardian, even a parent of a child in the class", () => {
    // A different feature with different consent. The parent of one child in
    // the room is not a supervisor of the other thirty.
    expect(canReadConversation(viewer({ roles: ["GUARDIAN"], enrolled: false }))).toBe(false);
  });

  it("REFUSES a guardian even if something upstream marks them enrolled", () => {
    // Fail-safe rather than trusting every caller to set the flag correctly.
    // A safeguarding rule that depends on that is waiting for its first
    // careless caller.
    expect(canReadConversation(viewer({ roles: ["GUARDIAN"], enrolled: true }))).toBe(false);
  });
});

describe("who may post", () => {
  const open = { lockedAt: null };

  it("lets an enrolled student and a teacher of the class post", () => {
    expect(canPost(viewer({ enrolled: true }), open)).toBe(true);
    expect(canPost(viewer({ roles: ["TEACHER"], enrolled: false, teachesClass: true }), open)).toBe(true);
  });

  it("lets an administrator read but NOT write", () => {
    // Reading is oversight; writing is being in the room. The two should not
    // arrive together by accident.
    const admin = viewer({ roles: ["SCHOOL_ADMIN"], enrolled: false, teachesClass: false });
    expect(canReadConversation(admin)).toBe(true);
    expect(canPost(admin, open)).toBe(false);
  });

  it("refuses a guardian outright", () => {
    expect(canPost(viewer({ roles: ["GUARDIAN"], enrolled: true }), open)).toBe(false);
  });

  it("stops students posting once a teacher freezes the chat, but not teachers", () => {
    const locked = { lockedAt: new Date("2026-08-10T10:00:00.000Z") };
    expect(canPost(viewer({ enrolled: true }), locked)).toBe(false);
    expect(canPost(viewer({ roles: ["TEACHER"], teachesClass: true }), locked)).toBe(true);
  });
});

describe("locking and deleting", () => {
  it("lets a teacher of the class or an admin freeze it", () => {
    expect(canLock(viewer({ roles: ["TEACHER"], teachesClass: true }))).toBe(true);
    expect(canLock(viewer({ roles: ["SCHOOL_ADMIN"] }))).toBe(true);
    expect(canLock(viewer({ roles: ["TEACHER"], teachesClass: false }))).toBe(false);
    expect(canLock(viewer())).toBe(false);
  });

  it("lets a student take back their own words but not a classmate's", () => {
    // Otherwise the loudest child in the class controls what the teacher sees.
    expect(canDelete(viewer({ userId: "u1" }), message({ authorUserId: "u1" }))).toBe(true);
    expect(canDelete(viewer({ userId: "u2" }), message({ authorUserId: "u1" }))).toBe(false);
  });

  it("lets staff remove anybody's", () => {
    expect(canDelete(viewer({ userId: "t1", roles: ["TEACHER"] }), message({ authorUserId: "u1" }))).toBe(true);
  });
});

describe("checkMessage", () => {
  const now = new Date("2026-08-10T09:00:10.000Z");

  it("accepts an ordinary message", () => {
    expect(checkMessage({ body: "Hello everyone", lastPostedAt: null, recentCount: 0, now })).toBeNull();
  });

  it("refuses nothing dressed up as something", () => {
    expect(checkMessage({ body: "   ", lastPostedAt: null, recentCount: 0, now })).toBe("empty");
    expect(checkMessage({ body: "", lastPostedAt: null, recentCount: 0, now })).toBe("empty");
    expect(checkMessage({ body: "\n\n\t", lastPostedAt: null, recentCount: 0, now })).toBe("empty");
  });

  it("caps the length", () => {
    expect(
      checkMessage({ body: "x".repeat(MAX_MESSAGE_LENGTH + 1), lastPostedAt: null, recentCount: 0, now }),
    ).toBe("too-long");
    expect(checkMessage({ body: "x".repeat(MAX_MESSAGE_LENGTH), lastPostedAt: null, recentCount: 0, now })).toBeNull();
  });

  it("measures the length after trimming, not before", () => {
    const body = `  ${"x".repeat(MAX_MESSAGE_LENGTH)}  `;
    expect(checkMessage({ body, lastPostedAt: null, recentCount: 0, now })).toBeNull();
  });

  it("slows down a flood from one person", () => {
    const justNow = new Date(now.getTime() - (MIN_INTERVAL_MS - 100));
    expect(checkMessage({ body: "spam", lastPostedAt: justNow, recentCount: 1, now })).toBe("too-fast");

    const longEnough = new Date(now.getTime() - MIN_INTERVAL_MS);
    expect(checkMessage({ body: "fine", lastPostedAt: longEnough, recentCount: 1, now })).toBeNull();
  });

  it("stops a burst even when each message is slow enough on its own", () => {
    const old = new Date(now.getTime() - 60_000);
    expect(checkMessage({ body: "hi", lastPostedAt: old, recentCount: BURST_LIMIT, now })).toBe("too-many");
    expect(checkMessage({ body: "hi", lastPostedAt: old, recentCount: BURST_LIMIT - 1, now })).toBeNull();
  });

  it("explains every problem in words a child can act on", () => {
    for (const problem of ["empty", "too-long", "too-fast", "too-many"] as const) {
      const text = explainProblem(problem);
      expect(text.length).toBeGreaterThan(10);
      expect(text).not.toMatch(/error|invalid|forbidden|4\d\d/i);
    }
  });
});

describe("toMessageView", () => {
  const student = viewer({ userId: "u2", roles: ["STUDENT"] });
  const teacher = viewer({ userId: "t1", roles: ["TEACHER"], enrolled: false, teachesClass: true });

  it("shows an ordinary message to everyone the same way", () => {
    const view = toMessageView(message(), student);
    expect(view.body).toBe("Does anyone have the maths homework?");
    expect(view.deleted).toBe(false);
    expect(view.removedBody).toBeUndefined();
  });

  it("marks a student's own messages as theirs", () => {
    expect(toMessageView(message({ authorUserId: "u2" }), student).mine).toBe(true);
    expect(toMessageView(message({ authorUserId: "u1" }), student).mine).toBe(false);
  });

  it("leaves a visible gap for a removed message rather than vanishing it", () => {
    // A message that disappears without trace invites "I never said that",
    // and the class saw it anyway.
    const removed = message({ deletedAt: new Date(), deletedByUserId: "t1" });
    const view = toMessageView(removed, student);
    expect(view.deleted).toBe(true);
    expect(view.body).toBe("This message was removed.");
  });

  it("NEVER shows a student what a removed message said", () => {
    const removed = message({ body: "something unkind", deletedAt: new Date(), deletedByUserId: "t1" });
    const view = toMessageView(removed, student);
    expect(JSON.stringify(view)).not.toContain("something unkind");
  });

  it("shows staff what it said, because a record nobody can read is not a record", () => {
    const removed = message({ body: "something unkind", deletedAt: new Date(), deletedByUserId: "t1" });
    expect(toMessageView(removed, teacher).removedBody).toBe("something unkind");
  });

  it("does not leak a removed message to a student who happens to have written it", () => {
    // Their own removed message is still removed. Re-reading it changes
    // nothing for them and complicates what "removed" means.
    const removed = message({ authorUserId: "u2", body: "regretted", deletedAt: new Date() });
    expect(JSON.stringify(toMessageView(removed, student))).not.toContain("regretted");
  });
});

describe("the supervision notice", () => {
  it("says plainly that teachers can read it, including removed messages", () => {
    // Supervision a child knows about is a classroom. Supervision they do not
    // know about is surveillance, and this product will not do that quietly.
    expect(SUPERVISION_NOTICE).toMatch(/teacher/i);
    expect(SUPERVISION_NOTICE).toMatch(/remove/i);
  });
});

describe("isStaff", () => {
  it("counts teachers and administrators, nobody else", () => {
    expect(isStaff({ roles: ["TEACHER"] })).toBe(true);
    expect(isStaff({ roles: ["SCHOOL_ADMIN"] })).toBe(true);
    expect(isStaff({ roles: ["STUDENT"] })).toBe(false);
    expect(isStaff({ roles: ["GUARDIAN"] })).toBe(false);
    expect(isStaff({ roles: [] })).toBe(false);
  });
});
