/**
 * Scheduled live lessons.
 *
 * This schedules a link to a meeting the school already runs somewhere else —
 * Zoom, Meet, Teams. It does not host video, and nothing here pretends to.
 * A screen that implied the school had its own classroom would have people
 * turning up to something that does not exist.
 */

export interface MeetingLike {
  startsAt: Date;
  endsAt: Date;
  cancelledAt: Date | null;
}

/** Hosts whose meeting links are worth putting in front of a child. */
const ALLOWED_HOSTS = [
  "zoom.us",
  "meet.google.com",
  "teams.microsoft.com",
  "teams.live.com",
  "whereby.com",
  "meet.jit.si",
];

/**
 * Why this meeting link cannot be used, or null.
 *
 * An allow-list, not a pattern. This link is given to children and they will
 * click it, so "looks like a URL" is not a good enough standard — an
 * arbitrary address put in front of a class by anybody who can edit a lesson
 * is exactly the shape of a phishing link. A school using something else can
 * have it added deliberately.
 *
 * http is refused as well as unknown hosts: a plaintext meeting link is one
 * anybody on the network can read on the way past.
 */
export function validateMeetingUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return "A live lesson needs a link";

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return "That is not a link";
  }

  if (parsed.protocol !== "https:") return "The link has to start with https";

  const host = parsed.hostname.toLowerCase();
  const allowed = ALLOWED_HOSTS.some((candidate) => host === candidate || host.endsWith(`.${candidate}`));
  if (!allowed) {
    return `Links have to be from ${ALLOWED_HOSTS.join(", ")}. Ask for another to be added.`;
  }

  return null;
}

/** Why these times make no sense, or null. */
export function validateTimes(startsAt: Date, endsAt: Date): string | null {
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return "Those times are not valid";
  if (endsAt.getTime() <= startsAt.getTime()) return "A lesson cannot end before it starts";
  const hours = (endsAt.getTime() - startsAt.getTime()) / 3_600_000;
  if (hours > 8) return "That is longer than a school day";
  return null;
}

export type MeetingState = "CANCELLED" | "FINISHED" | "LIVE" | "SOON" | "SCHEDULED";

/**
 * Where a meeting stands right now.
 *
 * SOON exists because the useful question a child has is "can I join yet",
 * and a link that appears exactly on the hour is a link half the class misses.
 * Fifteen minutes before is early enough to be there and late enough that a
 * lesson tomorrow does not look joinable today.
 */
export function stateOf(meeting: MeetingLike, now: Date): MeetingState {
  if (meeting.cancelledAt) return "CANCELLED";

  const start = meeting.startsAt.getTime();
  const end = meeting.endsAt.getTime();
  const at = now.getTime();

  if (at >= end) return "FINISHED";
  if (at >= start) return "LIVE";
  if (start - at <= 15 * 60 * 1000) return "SOON";
  return "SCHEDULED";
}

/** Whether the join button should do anything yet. */
export function canJoin(meeting: MeetingLike, now: Date): boolean {
  const state = stateOf(meeting, now);
  return state === "LIVE" || state === "SOON";
}

/**
 * Meetings in the order somebody wants them.
 *
 * What is happening now first, then what is coming, then what is over —
 * rather than strictly by time, which would bury a lesson that is live under
 * everything scheduled earlier in the day.
 */
export function forDisplay<T extends MeetingLike>(meetings: T[], now: Date): T[] {
  const rank: Record<MeetingState, number> = {
    LIVE: 0,
    SOON: 1,
    SCHEDULED: 2,
    FINISHED: 3,
    CANCELLED: 4,
  };
  return [...meetings].sort((a, b) => {
    const byState = rank[stateOf(a, now)] - rank[stateOf(b, now)];
    if (byState !== 0) return byState;
    return a.startsAt.getTime() - b.startsAt.getTime();
  });
}
