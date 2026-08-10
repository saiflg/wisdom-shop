/**
 * Who may see whose photograph, and who may change it.
 *
 * A photograph of a child is not the same kind of data as their name. The
 * name is on the register; the face is the thing that makes a stranger able
 * to recognise them in the street. So this is a deliberate, tested rule
 * rather than "whoever can read the record".
 *
 * Pure, so the rule can be argued with without a database.
 */

export interface PhotoViewer {
  userId: string;
  roles: string[];
  /** Class ids this viewer is in — enrolled in, or teaching. */
  classIds: string[];
  /** For a guardian: the user ids of the children they are linked to. */
  childUserIds: string[];
}

export interface PhotoSubject {
  userId: string;
  /** Class ids this person is in. */
  classIds: string[];
}

export function isSchoolStaff(viewer: Pick<PhotoViewer, "roles">): boolean {
  return viewer.roles.includes("SCHOOL_ADMIN") || viewer.roles.includes("TEACHER");
}

/**
 * May this viewer see this person's photograph?
 *
 * - Staff: yes. They are responsible for these children and need to recognise
 *   them — a register with faces is how a supply teacher knows who is missing.
 * - Yourself: always.
 * - A classmate: yes, but only someone in a class you share. Children knowing
 *   the faces of the people they sit with all day is the ordinary situation a
 *   school already creates; a whole-school face directory is not.
 * - A guardian: their own children, and nobody else's.
 *
 * Everything else is refused. Note the *absence* of "any student in the
 * school" — that would be a searchable gallery of every child's face, which
 * is the thing this rule exists to prevent.
 */
export function canSeePhoto(viewer: PhotoViewer, subject: PhotoSubject): boolean {
  if (viewer.userId === subject.userId) return true;
  if (isSchoolStaff(viewer)) return true;
  if (viewer.childUserIds.includes(subject.userId)) return true;

  const sharesAClass = subject.classIds.some((classId) => viewer.classIds.includes(classId));
  if (sharesAClass && !viewer.roles.includes("GUARDIAN")) return true;

  return false;
}

/**
 * May this viewer set or remove this person's photograph?
 *
 * Narrower than seeing it, and deliberately so. Staff maintain the records;
 * a person may change their own. A classmate may not, a guardian may not —
 * not even for their own child, because the photograph on a school record is
 * the school's identification of that pupil, and a parent replacing it with
 * something else is a records problem rather than a preference.
 */
export function canChangePhoto(viewer: PhotoViewer, subject: PhotoSubject): boolean {
  if (isSchoolStaff(viewer)) return true;
  return viewer.userId === subject.userId;
}

/** Bytes we will accept. Kept small: this is a face, not a poster. */
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

export function explainRejectedPhoto(input: { mimeType: string; bytes: number }): string | null {
  if (input.bytes > MAX_PHOTO_BYTES) {
    return `That image is too large. Keep it under ${Math.round(MAX_PHOTO_BYTES / (1024 * 1024))} MB.`;
  }
  // The allowlist itself lives in storage.ts; this only phrases the refusal.
  if (!input.mimeType) return "That file has no type we can read.";
  return null;
}
