import {
  canDeleteMessage,
  canPostToThread,
  canReadThread,
  inboxRank,
  sideFor,
  toThreadMessageView,
  type ThreadMessage,
  type ThreadViewer,
} from "./parent-message-rules";

function viewer(overrides: Partial<ThreadViewer> = {}): ThreadViewer {
  return { userId: "parent-1", roles: ["GUARDIAN"], guardianOf: ["child-1"], isSchoolStaff: false, ...overrides };
}

function message(overrides: Partial<ThreadMessage> = {}): ThreadMessage {
  return {
    id: "m1",
    authorUserId: "parent-1",
    authorName: "Bola Adewale",
    side: "FAMILY",
    body: "Tunde was unwell yesterday",
    createdAt: new Date("2026-08-10T09:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
}

describe("who is in a thread", () => {
  it("lets a guardian read their own child's thread", () => {
    expect(canReadThread(viewer({ guardianOf: ["child-1"] }), "child-1")).toBe(true);
  });

  it("REFUSES a guardian another family's thread", () => {
    // The invariant. A parent messaging the school about their child must
    // not thereby see what another family said about theirs.
    expect(canReadThread(viewer({ guardianOf: ["child-1"] }), "child-2")).toBe(false);
  });

  it("lets school staff read any of them", () => {
    // Teachers change, and a concern raised in September must not vanish
    // when its recipient leaves at Christmas.
    expect(canReadThread(viewer({ isSchoolStaff: true, guardianOf: [] }), "child-9")).toBe(true);
  });

  it("gives a guardian with no children nothing", () => {
    expect(canReadThread(viewer({ guardianOf: [] }), "child-1")).toBe(false);
  });

  it("lets exactly the people who can read it also post", () => {
    const parent = viewer();
    const staff = viewer({ isSchoolStaff: true });
    const stranger = viewer({ guardianOf: ["child-9"] });

    expect(canPostToThread(parent, "child-1")).toBe(canReadThread(parent, "child-1"));
    expect(canPostToThread(staff, "child-1")).toBe(canReadThread(staff, "child-1"));
    expect(canPostToThread(stranger, "child-1")).toBe(false);
  });

  it("has no branch that could admit the student", () => {
    // A parent raising a worry about their child is not writing to the
    // child. A student is neither staff nor a guardian of themselves, so
    // there is nothing here to forget.
    const student = { userId: "child-user", roles: ["STUDENT"], guardianOf: [], isSchoolStaff: false };
    expect(canReadThread(student, "child-1")).toBe(false);
    expect(canPostToThread(student, "child-1")).toBe(false);
  });
});

describe("deleting", () => {
  it("lets an author withdraw their own message", () => {
    expect(canDeleteMessage(viewer({ userId: "parent-1" }), message({ authorUserId: "parent-1" }))).toBe(true);
  });

  it("refuses a guardian removing the school's reply", () => {
    expect(canDeleteMessage(viewer({ userId: "parent-1" }), message({ authorUserId: "teacher-1" }))).toBe(false);
  });

  it("lets staff remove anything", () => {
    expect(canDeleteMessage(viewer({ isSchoolStaff: true }), message({ authorUserId: "parent-1" }))).toBe(true);
  });
});

describe("sideFor", () => {
  it("puts staff on the school side and everyone else on the family side", () => {
    expect(sideFor(viewer({ isSchoolStaff: true }))).toBe("SCHOOL");
    expect(sideFor(viewer())).toBe("FAMILY");
  });
});

describe("toThreadMessageView", () => {
  it("shows an ordinary message", () => {
    const view = toThreadMessageView(message(), viewer({ userId: "teacher-1", isSchoolStaff: true }));
    expect(view.body).toBe("Tunde was unwell yesterday");
    expect(view.deleted).toBe(false);
    expect(view.mine).toBe(false);
  });

  it("marks the viewer's own messages", () => {
    expect(toThreadMessageView(message({ authorUserId: "parent-1" }), viewer({ userId: "parent-1" })).mine).toBe(true);
  });

  it("leaves a marker for a withdrawn message rather than vanishing it", () => {
    const view = toThreadMessageView(message({ deletedAt: new Date() }), viewer());
    expect(view.deleted).toBe(true);
    expect(view.body).toBe("This message was withdrawn.");
  });

  it("does NOT let staff read back a withdrawn message", () => {
    // Deliberately unlike the class chat. That is children being supervised;
    // this is two adults, and a parent who withdraws a sentence written in
    // anger should not find it quoted back at them later.
    const withdrawn = message({ body: "something said in temper", deletedAt: new Date() });
    const staffView = toThreadMessageView(withdrawn, viewer({ isSchoolStaff: true }));
    expect(JSON.stringify(staffView)).not.toContain("temper");
  });
});

describe("inboxRank", () => {
  it("puts threads waiting on the school above answered ones", () => {
    // A parent's unanswered question is what a school office most needs to
    // see; chronological order buries it.
    const waiting = inboxRank({ lastSide: "FAMILY", lastAt: new Date("2026-01-01") });
    const answered = inboxRank({ lastSide: "SCHOOL", lastAt: new Date("2026-08-10") });
    expect(waiting).toBeLessThan(answered);
  });

  it("orders by recency within each group", () => {
    const older = inboxRank({ lastSide: "FAMILY", lastAt: new Date("2026-01-01") });
    const newer = inboxRank({ lastSide: "FAMILY", lastAt: new Date("2026-08-10") });
    expect(newer).toBeLessThan(older);
  });

  it("survives an empty thread", () => {
    expect(Number.isFinite(inboxRank({ lastSide: null, lastAt: null }))).toBe(true);
  });
});
