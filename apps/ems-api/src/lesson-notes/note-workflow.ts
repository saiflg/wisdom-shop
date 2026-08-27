export type LessonNoteStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "RETURNED";

export interface Actor {
  isAdmin: boolean;
  /** Whether this is the person who wrote the note. */
  isAuthor: boolean;
}

/**
 * Whether a note may move from one state to another, and why not if it may
 * not.
 *
 * The rule this exists for is the one in the middle: **a teacher cannot
 * approve their own note.** Vetting that the author can perform on themselves
 * is not vetting, and it is the single thing a head teacher is relying on
 * this screen for. It is expressed here, once, as a pure function, rather
 * than as a role check on a route — a route can be reached by an admin who
 * also happens to be the author, and `@Roles("SCHOOL_ADMIN")` would wave that
 * through.
 *
 * Returns null when the move is allowed, or a sentence explaining the refusal.
 */
export function checkTransition(from: LessonNoteStatus, to: LessonNoteStatus, actor: Actor): string | null {
  if (from === to) return "That note is already in that state";

  switch (to) {
    case "SUBMITTED":
      if (from !== "DRAFT" && from !== "RETURNED") {
        return "Only a draft or a returned note can be sent for vetting";
      }
      if (!actor.isAuthor && !actor.isAdmin) return "Only the teacher who wrote it can send it for vetting";
      return null;

    case "APPROVED":
      if (from !== "SUBMITTED") return "A note has to be sent for vetting before it can be approved";
      if (!actor.isAdmin) return "Only an administrator can approve a lesson note";
      // The rule the whole screen exists for.
      if (actor.isAuthor) return "A note cannot be approved by the person who wrote it";
      return null;

    case "RETURNED":
      if (from !== "SUBMITTED" && from !== "APPROVED") {
        return "Only a submitted or approved note can be returned";
      }
      if (!actor.isAdmin) return "Only an administrator can return a lesson note";
      if (actor.isAuthor) return "A note cannot be vetted by the person who wrote it";
      return null;

    case "DRAFT":
      if (from !== "RETURNED") return "Only a returned note can go back to being a draft";
      if (!actor.isAuthor && !actor.isAdmin) return "Only the teacher who wrote it can take it back to draft";
      return null;

    default:
      return "That is not a state a lesson note can be in";
  }
}

/**
 * The moves this person can make from here.
 *
 * Derived from checkTransition rather than listed separately, so a screen can
 * never offer a button the API will refuse. The last time this project had a
 * control that looked real and did nothing, it was aimed at the people least
 * able to interpret the failure.
 */
export function availableTransitions(from: LessonNoteStatus, actor: Actor): LessonNoteStatus[] {
  const all: LessonNoteStatus[] = ["DRAFT", "SUBMITTED", "APPROVED", "RETURNED"];
  return all.filter((to) => checkTransition(from, to, actor) === null);
}

/**
 * Whether a student or a family may read this note.
 *
 * Only an approved one. A note still being written, or one a head teacher has
 * sent back because it was wrong, must not be what a child revises from.
 */
export function isReadableByFamily(status: LessonNoteStatus): boolean {
  return status === "APPROVED";
}
