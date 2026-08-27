import { isDuplicateName } from "./duplicate-name";

describe("isDuplicateName", () => {
  it("recognises a duplicate reported as an expression index name", () => {
    // What Postgres actually returns for a partial index on lower("name"):
    // there is no column to name, so the index is named instead.
    expect(isDuplicateName({ code: "P2002", meta: { target: "sections_name_active_key" } })).toBe(true);
  });

  it("recognises a duplicate reported as a column list", () => {
    expect(isDuplicateName({ code: "P2002", meta: { target: ["name"] } })).toBe(true);
  });

  it("treats a P2002 with no usable target as the name", () => {
    // sections has no other unique constraint beyond the primary key, and a
    // primary-key collision on a generated cuid is not a case worth guessing
    // a different message for.
    expect(isDuplicateName({ code: "P2002" })).toBe(true);
  });

  it("does not swallow a different constraint failure", () => {
    // The point of the check. A foreign-key violation on headId reported as a
    // duplicate name would send an admin looking for a section that is not
    // there, which is exactly the kind of wrong-but-plausible error message
    // that costs an afternoon.
    expect(isDuplicateName({ code: "P2003", meta: { field_name: "headId" } })).toBe(false);
  });

  it("is not confused by anything that is not an error object", () => {
    expect(isDuplicateName(null)).toBe(false);
    expect(isDuplicateName(undefined)).toBe(false);
    expect(isDuplicateName("P2002")).toBe(false);
    expect(isDuplicateName(new Error("P2002"))).toBe(false);
  });
});
