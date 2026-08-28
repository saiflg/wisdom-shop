import { AUDIENCES, type Audience } from "./announcement-audience";

export type AnnouncementStatus = "DRAFT" | "SENT";

/**
 * A draft in progress.
 *
 * Only the title is required. Everything else is genuinely absent while
 * somebody is still writing, and typing it as required would force the
 * service to invent empty strings before it could even ask whether the draft
 * was valid.
 */
export interface DraftInput {
  title: string;
  body?: string | null;
  audience?: string | null;
  classId?: string | null;
  channels?: string[] | null;
}

/**
 * Why this draft cannot be saved, or null.
 *
 * Deliberately laxer than `announcementProblem`, which decides whether
 * something can be SENT. A half-written notice is the entire point of a
 * draft: somebody starts it on Monday with a title and finishes it on
 * Thursday. Requiring an audience and a channel before it can be saved would
 * mean losing the paragraph they had already written.
 *
 * What is still checked is anything that would be silently wrong later — an
 * audience or channel that is not a real one gets rejected now rather than
 * at send time, when the person who typed it may be somebody else.
 */
export function draftProblem(input: DraftInput): string | null {
  if (!input.title.trim()) return "Give it a title, even a rough one.";

  if (input.audience && !AUDIENCES.includes(input.audience as Audience)) {
    return "Choose who this is for.";
  }
  if ((input.channels ?? []).some((channel) => channel !== "EMAIL" && channel !== "SMS")) {
    return "Announcements can be sent by email or text message.";
  }
  return null;
}

/**
 * Why this announcement cannot be edited, or null.
 *
 * A sent announcement is frozen. It is already in people's inboxes, and
 * editing the school's record of it would make that record disagree with what
 * families actually received — which is the version that matters in the
 * conversation where it comes up.
 */
export function editProblem(status: AnnouncementStatus): string | null {
  if (status === "SENT") {
    return "This has already gone out. Sent announcements cannot be changed — write a new one.";
  }
  return null;
}

/**
 * Why this announcement cannot be sent, or null.
 *
 * Sending twice is refused here as well as being made harmless by the dedupe
 * key. The key stops a duplicate arriving; this stops the school's own log
 * showing one notice sent on two days, which is a different kind of wrong.
 */
export function sendProblem(status: AnnouncementStatus): string | null {
  if (status === "SENT") return "This has already been sent.";
  return null;
}

/** Drafts first, then most recently sent — the order somebody works in. */
export function draftsFirst<T extends { status: string; sentAt: Date | null; createdAt: Date }>(
  announcements: T[],
): T[] {
  return [...announcements].sort((a, b) => {
    if (a.status !== b.status) return a.status === "DRAFT" ? -1 : 1;
    const aTime = (a.sentAt ?? a.createdAt).getTime();
    const bTime = (b.sentAt ?? b.createdAt).getTime();
    return bTime - aTime;
  });
}
