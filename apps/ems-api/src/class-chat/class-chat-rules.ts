/**
 * Who may read a class conversation, who may write in it, and what a removed
 * message looks like to each of them.
 *
 * This file is about children talking to each other, so the rules are written
 * once, in one place, and tested — rather than spread across a service where
 * the third caller forgets one.
 *
 * The shape of the whole feature comes from one decision: **a class group is
 * supervisable and a private channel between two children is not.** There are
 * no one-to-one student messages here, and adding them later would be a
 * safeguarding design of its own rather than another endpoint.
 */

export type ChatRole = "STUDENT" | "TEACHER" | "SCHOOL_ADMIN" | "GUARDIAN";

export interface ChatViewer {
  userId: string;
  roles: string[];
  /** True when this viewer is a student actively enrolled in the class. */
  enrolled: boolean;
  /** True when this viewer teaches the class — homeroom or a subject. */
  teachesClass: boolean;
}

export interface StoredMessage {
  id: string;
  authorUserId: string;
  /** Snapshotted, so a message still says who wrote it after they leave. */
  authorName: string;
  authorRole: string;
  body: string;
  createdAt: Date;
  deletedAt: Date | null;
  deletedByUserId: string | null;
}

/** Staff can read any class conversation; students only their own. */
export function isStaff(viewer: Pick<ChatViewer, "roles">): boolean {
  return viewer.roles.includes("SCHOOL_ADMIN") || viewer.roles.includes("TEACHER");
}

/**
 * May this person read the conversation at all?
 *
 * Teachers and administrators can, whether or not they teach the class:
 * moderation that requires being a member first is moderation that arrives
 * too late. Guardians cannot. A parent reading their child's classmates'
 * messages is a different feature with different consent, and "the parent of
 * one child in the room" is not a supervisor of the other thirty.
 */
export function canReadConversation(viewer: ChatViewer): boolean {
  if (isStaff(viewer)) return true;
  // Stated here rather than left to the caller never setting `enrolled` on a
  // guardian. A safeguarding rule that depends on every caller getting a flag
  // right is a rule waiting for its first careless caller.
  if (viewer.roles.includes("GUARDIAN")) return false;
  return viewer.enrolled;
}

/**
 * May this person post?
 *
 * Only the students actually in the class and the teachers who teach it. An
 * administrator can read every conversation in the school and write in none
 * of them — reading is oversight, writing is being in the room, and the two
 * should not arrive together by accident.
 */
export function canPost(viewer: ChatViewer, conversation: { lockedAt: Date | null }): boolean {
  if (viewer.roles.includes("GUARDIAN")) return false;
  if (conversation.lockedAt && !viewer.teachesClass) return false;
  return viewer.enrolled || viewer.teachesClass;
}

/** Only a teacher of the class, or an administrator, may freeze it. */
export function canLock(viewer: ChatViewer): boolean {
  return viewer.roles.includes("SCHOOL_ADMIN") || viewer.teachesClass;
}

/**
 * May this person remove this message?
 *
 * A student may take back their own words; staff may remove anybody's. A
 * student cannot delete a classmate's message — otherwise the loudest child
 * in the class controls what the teacher gets to see.
 */
export function canDelete(viewer: ChatViewer, message: Pick<StoredMessage, "authorUserId">): boolean {
  if (isStaff(viewer)) return true;
  return message.authorUserId === viewer.userId;
}

export const MAX_MESSAGE_LENGTH = 2000;

/** The narrowest gap between two messages from the same person. */
export const MIN_INTERVAL_MS = 1500;

/** How many a person may send in a rolling window, and how long that window is. */
export const BURST_LIMIT = 20;
export const BURST_WINDOW_MS = 60_000;

export type MessageProblem = "empty" | "too-long" | "too-fast" | "too-many";

/**
 * Checks a message before it is stored.
 *
 * Rate limiting is here rather than in the global throttler because the limit
 * that matters is per person per conversation, and because the answer a child
 * should see is "slow down", not "429".
 */
export function checkMessage(input: {
  body: string;
  /** When this author last posted here, if ever. */
  lastPostedAt: Date | null;
  /** How many they have posted here within the burst window. */
  recentCount: number;
  now: Date;
}): MessageProblem | null {
  const trimmed = input.body.trim();
  if (!trimmed) return "empty";
  if (trimmed.length > MAX_MESSAGE_LENGTH) return "too-long";

  if (input.lastPostedAt && input.now.getTime() - input.lastPostedAt.getTime() < MIN_INTERVAL_MS) {
    return "too-fast";
  }
  if (input.recentCount >= BURST_LIMIT) return "too-many";
  return null;
}

export function explainProblem(problem: MessageProblem): string {
  switch (problem) {
    case "empty":
      return "Write something first.";
    case "too-long":
      return `Keep it under ${MAX_MESSAGE_LENGTH} characters.`;
    case "too-fast":
      return "Slow down a moment before sending another message.";
    case "too-many":
      return "That is a lot of messages in a minute. Take a short break.";
  }
}

export interface MessageView {
  id: string;
  authorUserId: string;
  authorName: string;
  authorRole: string;
  body: string;
  createdAt: Date;
  deleted: boolean;
  /** Present only for staff: what a removed message actually said. */
  removedBody?: string;
  mine: boolean;
}

/**
 * One message, as this viewer should see it.
 *
 * A removed message leaves a visible gap for students rather than vanishing:
 * a message that disappears without trace invites "I never said that", and
 * the class saw it anyway. Staff see the original text, because a moderation
 * record nobody can read is not a moderation record.
 */
export function toMessageView(message: StoredMessage, viewer: ChatViewer): MessageView {
  const deleted = message.deletedAt !== null;
  const staff = isStaff(viewer);

  return {
    id: message.id,
    authorUserId: message.authorUserId,
    authorName: message.authorName,
    authorRole: message.authorRole,
    // Rebuilt rather than spread-and-overwrite: a column added to the model
    // later must not appear in a student's view because nobody remembered to
    // delete it here.
    body: deleted ? "This message was removed." : message.body,
    createdAt: message.createdAt,
    deleted,
    ...(deleted && staff ? { removedBody: message.body } : {}),
    mine: message.authorUserId === viewer.userId,
  };
}

/** The banner every student sees above the conversation. Not fine print. */
export const SUPERVISION_NOTICE =
  "Your teachers can read everything in this class chat, including messages you remove.";
