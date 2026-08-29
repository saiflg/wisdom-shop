/**
 * Which students a viewer may see.
 *
 * This existed before as two conditions written inline, both phrased as
 * "GUARDIAN and not SCHOOL_ADMIN". That shape has a hole in it, and the hole
 * is the whole reason this file exists: a viewer who is neither of those two
 * things — a STUDENT — matched neither condition and fell through to the
 * branch that returns everybody.
 *
 * `GET /students` carries no @Roles, so any signed-in pupil could call it and
 * receive every child in the school: name, email address, classes, and every
 * linked guardian's name and email. A parent contact directory for the whole
 * roll, from a child's account.
 *
 * The lesson is the shape, not the missing case. A rule written as "everyone
 * except X is trusted" grants access to roles nobody had thought about yet,
 * silently, the moment they are added. So this is deny-by-default: every role
 * is named, and anything unrecognised gets nothing.
 */
export type StudentAudience =
  /** Staff: the register is their job. */
  | "ALL"
  /** A guardian: the children they are linked to, and no others. */
  | "LINKED_CHILDREN"
  /** A pupil: themselves. */
  | "SELF"
  /** Anyone else. */
  | "NONE";

export function studentAudienceFor(roles: readonly string[]): StudentAudience {
  // Staff first, and deliberately before GUARDIAN.
  //
  // A teacher who is also a parent at the school is an ordinary situation, and
  // the old condition ("GUARDIAN and not SCHOOL_ADMIN") caught them: it cut a
  // teacher-guardian down to their own children, so they could not see their
  // own class register. Staff duties do not stop because a member of staff
  // also has a child on the roll.
  if (roles.includes("SCHOOL_ADMIN") || roles.includes("TEACHER")) return "ALL";
  if (roles.includes("GUARDIAN")) return "LINKED_CHILDREN";
  if (roles.includes("STUDENT")) return "SELF";
  return "NONE";
}

/**
 * Whether this viewer may see one particular student.
 *
 * The caller answers with 404 rather than 403 in every refusing case: "that
 * child exists but is not yours" is itself a fact about another family.
 */
export function canSeeStudent(
  audience: StudentAudience,
  subject: { studentProfileId: string; studentUserId: string; guardianUserIds: readonly string[] },
  viewer: { userId: string },
): boolean {
  switch (audience) {
    case "ALL":
      return true;
    case "LINKED_CHILDREN":
      return subject.guardianUserIds.includes(viewer.userId);
    case "SELF":
      return subject.studentUserId === viewer.userId;
    case "NONE":
      return false;
  }
}
