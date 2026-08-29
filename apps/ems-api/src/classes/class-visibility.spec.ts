import { canSeeClassRoster, isSchoolStaff } from "./class-visibility";

const CLASS = "class-6a";
const OTHER = "class-7b";

describe("canSeeClassRoster", () => {
  it("lets staff see the register", () => {
    expect(canSeeClassRoster({ roles: ["TEACHER"], classIds: [] }, CLASS)).toBe(true);
    expect(canSeeClassRoster({ roles: ["SCHOOL_ADMIN"], classIds: [] }, CLASS)).toBe(true);
  });

  it("lets a pupil see their own classmates", () => {
    expect(canSeeClassRoster({ roles: ["STUDENT"], classIds: [CLASS] }, CLASS)).toBe(true);
  });

  it("does not let a pupil read another class's roster", () => {
    /*
     * The leak this file closes. GET /classes is open and lists every class
     * id, so without this a pupil could walk each one and assemble the name
     * of every child in the school, labelled with their class — reaching the
     * same directory that closing GET /students was meant to prevent.
     */
    expect(canSeeClassRoster({ roles: ["STUDENT"], classIds: [CLASS] }, OTHER)).toBe(false);
  });

  it("does not give a guardian the other children in the room", () => {
    // A parent is entitled to their own child, not to a list of that child's
    // classmates. photo-visibility.ts draws the same line for faces.
    expect(canSeeClassRoster({ roles: ["GUARDIAN"], classIds: [CLASS] }, CLASS)).toBe(false);
  });

  it("keeps the register for a teacher who is also a parent", () => {
    // Staff is checked first, so having a child at the school does not cost a
    // teacher their own class list.
    expect(canSeeClassRoster({ roles: ["TEACHER", "GUARDIAN"], classIds: [CLASS] }, OTHER)).toBe(true);
  });

  it("gives nothing to a role nobody has thought about", () => {
    expect(canSeeClassRoster({ roles: [], classIds: [] }, CLASS)).toBe(false);
    expect(canSeeClassRoster({ roles: ["LIBRARIAN"], classIds: [CLASS] }, CLASS)).toBe(false);
  });
});

describe("isSchoolStaff", () => {
  it("is admins and teachers, and nobody else", () => {
    expect(isSchoolStaff({ roles: ["SCHOOL_ADMIN"] })).toBe(true);
    expect(isSchoolStaff({ roles: ["TEACHER"] })).toBe(true);
    expect(isSchoolStaff({ roles: ["STUDENT"] })).toBe(false);
    expect(isSchoolStaff({ roles: ["GUARDIAN"] })).toBe(false);
  });
});
