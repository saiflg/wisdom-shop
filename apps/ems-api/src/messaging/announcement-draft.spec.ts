import { draftProblem, draftsFirst, editProblem, sendProblem } from "./announcement-draft";

const VALID = {
  title: "Half term",
  body: "School closes on Friday.",
  audience: "ALL_PARENTS",
  channels: ["EMAIL"],
};

describe("draftProblem", () => {
  it("accepts a complete draft", () => {
    expect(draftProblem(VALID)).toBeNull();
  });

  // The point of a draft.
  it("saves a half-written one", () => {
    // Somebody starts it on Monday with a title and finishes on Thursday.
    // Requiring an audience and a channel first would mean losing the
    // paragraph they had already written.
    expect(draftProblem({ title: "Half term", body: "", audience: "", channels: [] })).toBeNull();
    expect(draftProblem({ title: "Half term", body: "Some of it…", audience: "", channels: [] })).toBeNull();
  });

  it("still wants a title, so the list is readable", () => {
    expect(draftProblem({ ...VALID, title: "   " })).toBe("Give it a title, even a rough one.");
  });

  it("rejects an audience or channel that is not real, now rather than later", () => {
    // At send time the person who typed it may be somebody else.
    expect(draftProblem({ ...VALID, audience: "EVERYONE_EVERYWHERE" })).toBe("Choose who this is for.");
    expect(draftProblem({ ...VALID, channels: ["CARRIER_PIGEON"] })).toBe(
      "Announcements can be sent by email or text message.",
    );
  });
});

describe("editProblem", () => {
  it("allows editing a draft", () => {
    expect(editProblem("DRAFT")).toBeNull();
  });

  // The rule that matters.
  it("freezes an announcement once it has gone out", () => {
    // It is already in people's inboxes. Editing the school's record would
    // make that record disagree with what families actually received — and
    // theirs is the version that matters in the conversation where it comes
    // up.
    expect(editProblem("SENT")).toBe(
      "This has already gone out. Sent announcements cannot be changed — write a new one.",
    );
  });
});

describe("sendProblem", () => {
  it("allows sending a draft", () => {
    expect(sendProblem("DRAFT")).toBeNull();
  });

  it("refuses to send the same announcement twice", () => {
    // The dedupe key already stops a duplicate arriving. This stops the
    // school's own log showing one notice sent on two days, which is a
    // different kind of wrong.
    expect(sendProblem("SENT")).toBe("This has already been sent.");
  });
});

describe("draftsFirst", () => {
  const at = (iso: string) => new Date(`${iso}T09:00:00Z`);

  it("puts drafts above sent ones", () => {
    const rows = [
      { status: "SENT" as const, sentAt: at("2026-09-10"), createdAt: at("2026-09-10"), id: "sent" },
      { status: "DRAFT" as const, sentAt: null, createdAt: at("2026-09-01"), id: "draft" },
    ];
    expect(draftsFirst(rows).map((r) => r.id)).toEqual(["draft", "sent"]);
  });

  it("orders sent ones by when they were sent, newest first", () => {
    const rows = [
      { status: "SENT" as const, sentAt: at("2026-09-01"), createdAt: at("2026-09-01"), id: "old" },
      { status: "SENT" as const, sentAt: at("2026-09-20"), createdAt: at("2026-09-19"), id: "new" },
    ];
    expect(draftsFirst(rows).map((r) => r.id)).toEqual(["new", "old"]);
  });

  it("falls back to when a draft was written, since it has no sent date", () => {
    const rows = [
      { status: "DRAFT" as const, sentAt: null, createdAt: at("2026-09-01"), id: "older" },
      { status: "DRAFT" as const, sentAt: null, createdAt: at("2026-09-05"), id: "newer" },
    ];
    expect(draftsFirst(rows).map((r) => r.id)).toEqual(["newer", "older"]);
  });

  it("does not modify what it was given", () => {
    const rows = [
      { status: "SENT" as const, sentAt: at("2026-09-10"), createdAt: at("2026-09-10"), id: "sent" },
      { status: "DRAFT" as const, sentAt: null, createdAt: at("2026-09-01"), id: "draft" },
    ];
    draftsFirst(rows);
    expect(rows[0].id).toBe("sent");
  });
});
