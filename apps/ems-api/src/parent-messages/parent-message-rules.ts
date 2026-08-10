/**
 * A conversation between a family and the school, about one child.
 *
 * Deliberately **not** a private line to one teacher. The thread belongs to
 * the child: every guardian linked to them is in it, and any teacher of their
 * class plus any administrator can read and answer. That shape is chosen for
 * three reasons —
 *
 *   1. Teachers change. A parent who messaged "Mr Bello" in September should
 *      not have their concern disappear when he leaves at Christmas.
 *   2. A private channel between one adult and one child's parent is exactly
 *      the arrangement safeguarding policies exist to prevent.
 *   3. A message about a child is school business, and the person who picks
 *      it up on Monday is whoever is on duty.
 *
 * The rules live here, pure and tested, for the same reason the class chat's
 * do: this is about children, and a rule the third caller forgets is not a
 * rule.
 */

export interface ThreadViewer {
  userId: string;
  roles: string[];
  /** Student profile ids this viewer is a guardian of. */
  guardianOf: string[];
  /** True when this viewer teaches the child's class, or is an administrator. */
  isSchoolStaff: boolean;
}

export function canReadThread(viewer: ThreadViewer, studentProfileId: string): boolean {
  if (viewer.isSchoolStaff) return true;
  return viewer.guardianOf.includes(studentProfileId);
}

/**
 * Who may write.
 *
 * The same set that may read, with one deliberate exception: **the student
 * themselves is in neither.** A parent raising a worry about their child —
 * about bullying, about a diagnosis, about something at home — is not writing
 * to the child, and a thread the child can read is a thread the parent will
 * not use honestly. Students are not given access anywhere in this module,
 * which is why there is no "student" branch to forget.
 */
export function canPostToThread(viewer: ThreadViewer, studentProfileId: string): boolean {
  return canReadThread(viewer, studentProfileId);
}

/** Only the author may take their own words back; staff may remove anything. */
export function canDeleteMessage(
  viewer: ThreadViewer,
  message: { authorUserId: string },
): boolean {
  if (viewer.isSchoolStaff) return true;
  return message.authorUserId === viewer.userId;
}

export type ParticipantSide = "FAMILY" | "SCHOOL";

/**
 * Which side of the conversation somebody is on.
 *
 * Stored on each message so a thread still reads correctly years later, when
 * the teacher has left and the guardian link has been removed — the same
 * snapshot reasoning as a payslip's staff name.
 */
export function sideFor(viewer: ThreadViewer): ParticipantSide {
  return viewer.isSchoolStaff ? "SCHOOL" : "FAMILY";
}

export interface ThreadMessage {
  id: string;
  authorUserId: string;
  authorName: string;
  side: string;
  body: string;
  createdAt: Date;
  deletedAt: Date | null;
}

export interface ThreadMessageView {
  id: string;
  authorName: string;
  side: string;
  body: string;
  createdAt: Date;
  deleted: boolean;
  mine: boolean;
}

/**
 * One message as this viewer should see it.
 *
 * A removed message leaves a marker rather than vanishing — the other person
 * saw it, and pretending otherwise is how "I never said that" arguments
 * start. Unlike the class chat, staff do **not** get to read back the removed
 * text here: this is a conversation between adults, and a parent who
 * withdraws a sentence written in anger should not find it quoted later.
 */
export function toThreadMessageView(message: ThreadMessage, viewer: ThreadViewer): ThreadMessageView {
  const deleted = message.deletedAt !== null;
  return {
    id: message.id,
    authorName: message.authorName,
    side: message.side,
    body: deleted ? "This message was withdrawn." : message.body,
    createdAt: message.createdAt,
    deleted,
    mine: message.authorUserId === viewer.userId,
  };
}

/**
 * How a thread should be sorted in an inbox.
 *
 * Threads waiting on the school come first — a parent's unanswered question
 * is the thing a school office most needs to see, and burying it under
 * chronological order is how it goes unanswered for a week.
 */
export function inboxRank(thread: { lastSide: string | null; lastAt: Date | null }): number {
  const waiting = thread.lastSide === "FAMILY" ? 0 : 1;
  const recency = thread.lastAt ? -thread.lastAt.getTime() : 0;
  // Waiting dominates; recency orders within each group.
  return waiting * 1e15 + recency;
}
