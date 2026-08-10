import {
  MAX_PHOTO_BYTES,
  canChangePhoto,
  canSeePhoto,
  explainRejectedPhoto,
  isSchoolStaff,
  type PhotoSubject,
  type PhotoViewer,
} from "./photo-visibility";

function viewer(overrides: Partial<PhotoViewer> = {}): PhotoViewer {
  return { userId: "me", roles: ["STUDENT"], classIds: ["class-a"], childUserIds: [], ...overrides };
}

function subject(overrides: Partial<PhotoSubject> = {}): PhotoSubject {
  return { userId: "them", classIds: ["class-a"], ...overrides };
}

describe("canSeePhoto", () => {
  it("always lets someone see their own", () => {
    expect(canSeePhoto(viewer({ userId: "me" }), subject({ userId: "me", classIds: [] }))).toBe(true);
  });

  it("lets staff see any of them", () => {
    // They are responsible for these children and need to recognise them — a
    // register with faces is how a supply teacher knows who is missing.
    expect(canSeePhoto(viewer({ roles: ["TEACHER"], classIds: [] }), subject())).toBe(true);
    expect(canSeePhoto(viewer({ roles: ["SCHOOL_ADMIN"], classIds: [] }), subject())).toBe(true);
  });

  it("lets classmates see each other", () => {
    expect(canSeePhoto(viewer({ classIds: ["class-a"] }), subject({ classIds: ["class-a"] }))).toBe(true);
  });

  it("REFUSES a student in a different class", () => {
    // The rule this file exists for. Without it, any pupil could assemble a
    // gallery of every face in the school.
    expect(canSeePhoto(viewer({ classIds: ["class-a"] }), subject({ classIds: ["class-b"] }))).toBe(false);
  });

  it("refuses a student with no class at all", () => {
    expect(canSeePhoto(viewer({ classIds: [] }), subject({ classIds: ["class-a"] }))).toBe(false);
  });

  it("lets a guardian see their own child and nobody else's", () => {
    const parent = viewer({ userId: "parent", roles: ["GUARDIAN"], classIds: [], childUserIds: ["child-1"] });
    expect(canSeePhoto(parent, subject({ userId: "child-1" }))).toBe(true);
    expect(canSeePhoto(parent, subject({ userId: "child-2" }))).toBe(false);
  });

  it("does not let a guardian in on a shared class", () => {
    // A parent who somehow carries a class id must not thereby see thirty
    // other children's faces.
    const parent = viewer({
      userId: "parent",
      roles: ["GUARDIAN"],
      classIds: ["class-a"],
      childUserIds: ["child-1"],
    });
    expect(canSeePhoto(parent, subject({ userId: "someone-else", classIds: ["class-a"] }))).toBe(false);
  });

  it("refuses a person with no relationship of any kind", () => {
    expect(
      canSeePhoto(viewer({ userId: "stranger", roles: [], classIds: [] }), subject({ classIds: ["class-z"] })),
    ).toBe(false);
  });
});

describe("canChangePhoto", () => {
  it("lets staff and the person themselves", () => {
    expect(canChangePhoto(viewer({ roles: ["TEACHER"] }), subject())).toBe(true);
    expect(canChangePhoto(viewer({ userId: "me" }), subject({ userId: "me" }))).toBe(true);
  });

  it("REFUSES a classmate who can see it", () => {
    // Seeing and changing are different questions, and the second is
    // narrower. A classmate can see the face and must not be able to replace
    // it.
    const classmate = viewer({ userId: "me", classIds: ["class-a"] });
    const other = subject({ userId: "them", classIds: ["class-a"] });
    expect(canSeePhoto(classmate, other)).toBe(true);
    expect(canChangePhoto(classmate, other)).toBe(false);
  });

  it("refuses a guardian, even for their own child", () => {
    // The photograph on a school record is the school's identification of
    // that pupil. A parent replacing it is a records problem, not a
    // preference.
    const parent = viewer({ userId: "parent", roles: ["GUARDIAN"], childUserIds: ["child-1"] });
    expect(canSeePhoto(parent, subject({ userId: "child-1" }))).toBe(true);
    expect(canChangePhoto(parent, subject({ userId: "child-1" }))).toBe(false);
  });
});

describe("explainRejectedPhoto", () => {
  it("accepts an ordinary photograph", () => {
    expect(explainRejectedPhoto({ mimeType: "image/jpeg", bytes: 500_000 })).toBeNull();
  });

  it("refuses something too large, and says the limit", () => {
    const message = explainRejectedPhoto({ mimeType: "image/jpeg", bytes: MAX_PHOTO_BYTES + 1 });
    expect(message).toContain("2 MB");
  });

  it("accepts exactly the limit", () => {
    expect(explainRejectedPhoto({ mimeType: "image/png", bytes: MAX_PHOTO_BYTES })).toBeNull();
  });

  it("refuses a file with no type", () => {
    expect(explainRejectedPhoto({ mimeType: "", bytes: 10 })).toBeTruthy();
  });
});

describe("isSchoolStaff", () => {
  it("counts teachers and administrators only", () => {
    expect(isSchoolStaff({ roles: ["TEACHER"] })).toBe(true);
    expect(isSchoolStaff({ roles: ["SCHOOL_ADMIN"] })).toBe(true);
    expect(isSchoolStaff({ roles: ["STUDENT"] })).toBe(false);
    expect(isSchoolStaff({ roles: ["GUARDIAN"] })).toBe(false);
  });
});
