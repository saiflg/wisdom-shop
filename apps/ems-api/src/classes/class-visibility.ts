/**
 * Who may see the list of children in a class.
 *
 * `GET /classes/:id` carried no @Roles and took no viewer, and it returns
 * every active enrolment with the pupil's name. `GET /classes` is open too,
 * so class ids are enumerable — which meant any signed-in person could walk
 * every class in turn and rebuild a roster of every child in the school,
 * each one labelled with their class.
 *
 * That is the same category of thing as the student-list leak next door, and
 * it survived the fix for it: closing `GET /students` while leaving this open
 * only changes which endpoint you assemble the list from.
 *
 * The rule is deliberately the same one photo-visibility.ts already settled,
 * because it is the same question about the same children:
 *
 * - **Staff** see the roster. It is the register; it is their job.
 * - **A pupil in that class** sees it. Children knowing the names of the
 *   people they sit with all day is the ordinary situation a school already
 *   creates. A directory of every child in every class is not.
 * - **A guardian** does not — not even for their own child's class. A parent
 *   is entitled to their own child, not to a list of the other children in
 *   the room. photo-visibility.ts draws this exact line for faces.
 * - **Anyone else** does not.
 *
 * Refusing means returning the class without its roster, not 404: the class
 * itself — its name, year and homeroom teacher — is the school describing its
 * own shape, and a timetable screen needs to name it.
 */
export interface ClassViewer {
  roles: readonly string[];
  /** Class ids this viewer is enrolled in or teaches. */
  classIds: readonly string[];
}

export function isSchoolStaff(viewer: Pick<ClassViewer, "roles">): boolean {
  return viewer.roles.includes("SCHOOL_ADMIN") || viewer.roles.includes("TEACHER");
}

export function canSeeClassRoster(viewer: ClassViewer, classId: string): boolean {
  // Staff first, so a teacher who is also a parent keeps their register —
  // the same ordering, and the same reason, as studentAudienceFor.
  if (isSchoolStaff(viewer)) return true;
  if (viewer.roles.includes("GUARDIAN")) return false;
  // Named explicitly, not left as a fallback. Written as
  // `return viewer.classIds.includes(classId)` this would hand the roster to
  // any unrecognised role that happens to carry a class id — which is the
  // "everyone except X is trusted" shape that caused the student-list leak in
  // the first place. The test for an unknown role catches it.
  if (viewer.roles.includes("STUDENT")) return viewer.classIds.includes(classId);
  return false;
}
