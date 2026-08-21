import { schoolNameFor } from "./school-name";

describe("schoolNameFor", () => {
  it("prefers the name an administrator chose", () => {
    expect(
      schoolNameFor({ displayName: "Demo Academy", registeredName: "Demo Academy Ltd", slug: "demo-academy" }),
    ).toBe("Demo Academy");
  });

  it("falls back to the registered name when no display name is set", () => {
    expect(schoolNameFor({ displayName: null, registeredName: "Demo Academy Ltd", slug: "demo-academy" })).toBe(
      "Demo Academy Ltd",
    );
  });

  it("treats a cleared display name as absent rather than as an empty signature", () => {
    expect(schoolNameFor({ displayName: "   ", registeredName: "Demo Academy Ltd", slug: "demo-academy" })).toBe(
      "Demo Academy Ltd",
    );
  });

  it("uses the slug only when there is nothing else", () => {
    expect(schoolNameFor({ displayName: null, registeredName: null, slug: "demo-academy" })).toBe("demo-academy");
  });

  it("never returns an empty string", () => {
    expect(schoolNameFor({})).toBe("Your school");
    expect(schoolNameFor({ displayName: "", registeredName: "", slug: "" })).toBe("Your school");
  });

  it("trims, so a stray space does not shift the signature", () => {
    expect(schoolNameFor({ displayName: "  Demo Academy  " })).toBe("Demo Academy");
  });

  // The bug this was written for: a receipt signed with the URL slug.
  it("does not sign a message with the slug when a real name exists", () => {
    const signature = schoolNameFor({ registeredName: "Demo Academy", slug: "demo-academy" });
    expect(signature).not.toBe("demo-academy");
    expect(signature).toBe("Demo Academy");
  });
});
