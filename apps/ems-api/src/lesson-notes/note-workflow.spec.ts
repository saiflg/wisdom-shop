import { availableTransitions, checkTransition, isReadableByFamily } from "./note-workflow";

const AUTHOR = { isAdmin: false, isAuthor: true };
const OTHER_TEACHER = { isAdmin: false, isAuthor: false };
const HEAD = { isAdmin: true, isAuthor: false };
const HEAD_WHO_WROTE_IT = { isAdmin: true, isAuthor: true };

describe("checkTransition", () => {
  it("lets the author send a draft for vetting", () => {
    expect(checkTransition("DRAFT", "SUBMITTED", AUTHOR)).toBeNull();
  });

  it("lets a head approve somebody else's submitted note", () => {
    expect(checkTransition("SUBMITTED", "APPROVED", HEAD)).toBeNull();
  });

  // The rule the whole screen exists for.
  it("refuses to let anyone approve their own note, even an administrator", () => {
    // A head teacher who also teaches is the ordinary case in a small school,
    // and @Roles("SCHOOL_ADMIN") on the route would wave this straight
    // through. Vetting the author can perform on themselves is not vetting.
    expect(checkTransition("SUBMITTED", "APPROVED", HEAD_WHO_WROTE_IT)).toBe(
      "A note cannot be approved by the person who wrote it",
    );
    expect(checkTransition("SUBMITTED", "RETURNED", HEAD_WHO_WROTE_IT)).toBe(
      "A note cannot be vetted by the person who wrote it",
    );
  });

  it("refuses to let a teacher approve anything", () => {
    expect(checkTransition("SUBMITTED", "APPROVED", OTHER_TEACHER)).toBe(
      "Only an administrator can approve a lesson note",
    );
  });

  it("refuses to approve a note that was never submitted", () => {
    // Otherwise a note could go from half-written to signed off without
    // anybody having read it.
    expect(checkTransition("DRAFT", "APPROVED", HEAD)).toBe(
      "A note has to be sent for vetting before it can be approved",
    );
  });

  it("lets a returned note be fixed and sent back", () => {
    expect(checkTransition("RETURNED", "SUBMITTED", AUTHOR)).toBeNull();
    expect(checkTransition("RETURNED", "DRAFT", AUTHOR)).toBeNull();
  });

  it("lets a head withdraw an approval", () => {
    // Something approved in error must be retractable, or the only remedy is
    // deleting a note children may already be reading.
    expect(checkTransition("APPROVED", "RETURNED", HEAD)).toBeNull();
  });

  it("refuses to send an approved note back for vetting again", () => {
    expect(checkTransition("APPROVED", "SUBMITTED", AUTHOR)).toBe(
      "Only a draft or a returned note can be sent for vetting",
    );
  });

  it("refuses a move to the state it is already in", () => {
    expect(checkTransition("DRAFT", "DRAFT", AUTHOR)).toBe("That note is already in that state");
  });

  it("does not let another teacher submit somebody else's draft", () => {
    expect(checkTransition("DRAFT", "SUBMITTED", OTHER_TEACHER)).toBe(
      "Only the teacher who wrote it can send it for vetting",
    );
  });
});

describe("availableTransitions", () => {
  it("offers the author exactly what they can do", () => {
    expect(availableTransitions("DRAFT", AUTHOR)).toEqual(["SUBMITTED"]);
    expect(availableTransitions("RETURNED", AUTHOR).sort()).toEqual(["DRAFT", "SUBMITTED"]);
  });

  it("offers a head approve or return on a submitted note", () => {
    expect(availableTransitions("SUBMITTED", HEAD).sort()).toEqual(["APPROVED", "RETURNED"]);
  });

  it("offers a head who wrote it nothing on their own submitted note", () => {
    // So the screen cannot show an Approve button that the API will refuse.
    expect(availableTransitions("SUBMITTED", HEAD_WHO_WROTE_IT)).toEqual([]);
  });

  it("never offers a move checkTransition would refuse", () => {
    const states = ["DRAFT", "SUBMITTED", "APPROVED", "RETURNED"] as const;
    for (const actor of [AUTHOR, OTHER_TEACHER, HEAD, HEAD_WHO_WROTE_IT]) {
      for (const from of states) {
        for (const to of availableTransitions(from, actor)) {
          expect(checkTransition(from, to, actor)).toBeNull();
        }
      }
    }
  });
});

describe("isReadableByFamily", () => {
  it("shows only approved notes to a child", () => {
    // A note still being written, or one sent back because it was wrong, is
    // not what a child should be revising from.
    expect(isReadableByFamily("APPROVED")).toBe(true);
    expect(isReadableByFamily("DRAFT")).toBe(false);
    expect(isReadableByFamily("SUBMITTED")).toBe(false);
    expect(isReadableByFamily("RETURNED")).toBe(false);
  });
});
