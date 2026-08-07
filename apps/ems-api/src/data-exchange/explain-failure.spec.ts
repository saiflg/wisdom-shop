import { explainFailure } from "./data-exchange.service";

describe("explainFailure", () => {
  it("names the clashing field for a duplicate", () => {
    // Prisma's own text names a column in our schema, which tells a school
    // administrator nothing about what to change in their spreadsheet.
    const problem = explainFailure({ code: "P2002", meta: { target: ["email"] } });
    expect(problem).toBe("Another record already uses that email");
    expect(problem).not.toMatch(/constraint/i);
  });

  it("handles a duplicate across several fields", () => {
    expect(explainFailure({ code: "P2002", meta: { target: ["name", "gradeLevel"] } })).toContain(
      "name, gradeLevel",
    );
  });

  it("still says something useful when Prisma names no field", () => {
    expect(explainFailure({ code: "P2002" })).toMatch(/already uses one of these values/i);
  });

  it("explains a missing relation and a missing record", () => {
    expect(explainFailure({ code: "P2003" })).toMatch(/does not exist/i);
    expect(explainFailure({ code: "P2025" })).toMatch(/not found/i);
  });

  it("passes through a message we wrote ourselves", () => {
    // The entity appliers throw plain Errors with sentences already aimed at
    // the person holding the file.
    expect(explainFailure(new Error("No student with admission number ADM999"))).toBe(
      "No student with admission number ADM999",
    );
  });

  it("never returns an empty string for an unrecognised failure", () => {
    for (const thrown of [null, undefined, "", 0, {}]) {
      expect(explainFailure(thrown).length).toBeGreaterThan(0);
    }
  });
});
