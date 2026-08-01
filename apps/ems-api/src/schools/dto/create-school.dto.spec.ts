import { isValidSchoolSlug } from "./create-school.dto";

describe("isValidSchoolSlug", () => {
  it("accepts ordinary lowercase slugs", () => {
    expect(isValidSchoolSlug("demo-academy")).toBe(true);
    expect(isValidSchoolSlug("stmarys2026")).toBe(true);
  });

  it("rejects reserved words — these would collide with real infrastructure names", () => {
    expect(isValidSchoolSlug("control")).toBe(false);
    expect(isValidSchoolSlug("admin")).toBe(false);
    expect(isValidSchoolSlug("template")).toBe(false);
  });

  it("rejects anything that isn't a safe Postgres identifier fragment", () => {
    expect(isValidSchoolSlug("Not Valid!")).toBe(false);
    expect(isValidSchoolSlug("has_underscore")).toBe(false);
    expect(isValidSchoolSlug("-leading-hyphen")).toBe(false);
    expect(isValidSchoolSlug("trailing-hyphen-")).toBe(false);
    expect(isValidSchoolSlug("ab")).toBe(false);
  });
});
