import {
  changedFields,
  cleanEmail,
  cleanPhone,
  clearingEmailLocksThemOut,
  contactProblem,
  describeReachability,
  looksLikeEmail,
  looksLikePhone,
  parentChangeProblem,
} from "./guardian-contact";

const signedUp = { email: "ade@example.com", phone: "0803 123 4567", hasPassword: true };
const onPaper = { email: null, phone: "0803 123 4567", hasPassword: false };

describe("cleanEmail", () => {
  it("trims and lower-cases, because it is the login identifier", () => {
    expect(cleanEmail("  Ade@Example.COM ")).toBe("ade@example.com");
  });

  it("turns blank into null rather than an empty string", () => {
    // An empty string collides on the unique index the moment a second
    // parent also has no address; null does not.
    expect(cleanEmail("   ")).toBeNull();
    expect(cleanEmail("")).toBeNull();
    expect(cleanEmail(null)).toBeNull();
    expect(cleanEmail(undefined)).toBeNull();
  });
});

describe("cleanPhone", () => {
  it("trims and otherwise leaves the number exactly as typed", () => {
    // Reformatting is how a leading zero disappears from a local number and
    // a parent becomes unreachable in an emergency.
    expect(cleanPhone("  0803 123 4567 ")).toBe("0803 123 4567");
    expect(cleanPhone("+234 (0) 803-123-4567")).toBe("+234 (0) 803-123-4567");
  });

  it("does not strip a leading zero", () => {
    expect(cleanPhone("08031234567")).toBe("08031234567");
  });

  it("turns blank into null", () => {
    expect(cleanPhone("  ")).toBeNull();
  });
});

describe("looksLikePhone", () => {
  it("counts digits rather than insisting on a format", () => {
    expect(looksLikePhone("0803 123 4567")).toBe(true);
    expect(looksLikePhone("+234-803-123-4567")).toBe(true);
  });

  it("rejects a room extension or a typo", () => {
    expect(looksLikePhone("204")).toBe(false);
    expect(looksLikePhone("n/a")).toBe(false);
  });
});

describe("looksLikeEmail", () => {
  it("accepts an ordinary address and rejects obvious rubbish", () => {
    expect(looksLikeEmail("ade@example.com")).toBe(true);
    expect(looksLikeEmail("ade at example")).toBe(false);
    expect(looksLikeEmail("ade@example")).toBe(false);
  });
});

describe("contactProblem", () => {
  it("allows an ordinary edit", () => {
    expect(contactProblem(signedUp, { phone: "0805 999 1111" })).toBeNull();
  });

  it("REFUSES to clear the email of a parent who signs in with it", () => {
    // The whole reason this function exists. Clearing it does not tidy a
    // record, it destroys an account, and the parent finds out the next time
    // they try to look at their child's marks.
    expect(contactProblem(signedUp, { email: "" })).toMatch(/lock them out/i);
    expect(contactProblem(signedUp, { email: null })).toMatch(/lock them out/i);
  });

  it("allows clearing the email of somebody who never had a password", () => {
    // A record typed off a paper form, corrected later. Nothing is lost.
    const paperWithEmail = { email: "typo@example.com", phone: null, hasPassword: false };
    expect(contactProblem(paperWithEmail, { email: "" })).toBeNull();
  });

  it("rejects a malformed address or number", () => {
    expect(contactProblem(signedUp, { email: "not-an-address" })).toMatch(/email address/i);
    expect(contactProblem(signedUp, { phone: "12" })).toMatch(/phone number/i);
  });

  it("leaves a field alone when it was not mentioned at all", () => {
    // Absent must mean "unchanged", not "set to null" — otherwise editing a
    // phone number silently deletes an email address.
    expect(contactProblem(signedUp, { phone: "0805 999 1111" })).toBeNull();
    expect(contactProblem(onPaper, {})).toBeNull();
  });

  it("allows a parent to end up with no contact details at all if they truly have none", () => {
    // Unreachable is a real state a school records and then chases. It is
    // flagged on the overview, not forbidden here.
    expect(contactProblem(onPaper, { phone: "" })).toBeNull();
  });
});

describe("parentChangeProblem", () => {
  it("lets a parent correct their own phone number", () => {
    expect(parentChangeProblem({ phone: "0805 999 1111" })).toBeNull();
  });

  it("refuses to let an account rewrite its own login identifier", () => {
    // Letting a session change the email it signs in with turns a session
    // that should not have been open into a permanent one.
    expect(parentChangeProblem({ email: "attacker@example.com" })).toMatch(/school office/i);
    expect(parentChangeProblem({ email: "a@b.com", phone: "0805 999 1111" })).toMatch(/school office/i);
  });

  it("tells them who can do it instead of only saying no", () => {
    expect(parentChangeProblem({ email: "a@b.com" })).toMatch(/office/i);
  });
});

describe("changedFields", () => {
  it("reports nothing when a form is saved untouched", () => {
    expect(changedFields(signedUp, { email: "ade@example.com", phone: "0803 123 4567" })).toEqual([]);
  });

  it("ignores a difference that is only capitalisation or spacing", () => {
    expect(changedFields(signedUp, { email: " ADE@example.com " })).toEqual([]);
  });

  it("reports a real change", () => {
    expect(changedFields(signedUp, { phone: "0805 999 1111" })).toEqual(["phone"]);
  });

  it("counts clearing a field as a change", () => {
    expect(changedFields(signedUp, { phone: "" })).toEqual(["phone"]);
  });

  it("does not report a field that was never mentioned", () => {
    expect(changedFields(signedUp, {})).toEqual([]);
  });
});

describe("clearingEmailLocksThemOut", () => {
  it("is true only when they can actually sign in today", () => {
    expect(clearingEmailLocksThemOut(signedUp, { email: "" })).toBe(true);
    expect(clearingEmailLocksThemOut({ ...signedUp, hasPassword: false }, { email: "" })).toBe(false);
  });

  it("is false when the email is not being cleared", () => {
    expect(clearingEmailLocksThemOut(signedUp, { email: "new@example.com" })).toBe(false);
    expect(clearingEmailLocksThemOut(signedUp, { phone: "" })).toBe(false);
  });
});

describe("describeReachability", () => {
  it("says which of the two the school actually has", () => {
    expect(describeReachability({ email: "a@b.com", phone: "0803" })).toBe("Email and phone on file");
    expect(describeReachability({ email: "a@b.com", phone: null })).toBe("Email only");
    expect(describeReachability({ email: null, phone: "0803" })).toBe("Phone only");
  });

  it("says plainly when there is no way to reach them", () => {
    expect(describeReachability({ email: null, phone: null })).toBe("No way to reach them");
  });
});
