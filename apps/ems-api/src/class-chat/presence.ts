/**
 * Whether somebody is here right now.
 *
 * A class chat is more useful when a child can see that a classmate — or
 * better, their teacher — is actually present, rather than shouting into a
 * room that may be empty. That is the whole ambition of this module, and it
 * is deliberately small.
 *
 * What it must NOT become is an attendance record. "Ada was online at 22:41"
 * is a fact about a child's evening that a school has no business keeping, so
 * presence is reported as a coarse state and never as a timestamp a viewer can
 * read back. The window is generous for the same reason: a child who closed
 * the tab to think about a reply has not left.
 */

export type Presence = "ONLINE" | "RECENTLY" | "AWAY";

/** Five minutes. Long enough to survive reading a message before replying. */
export const ONLINE_WINDOW_MS = 5 * 60_000;
/** Within the hour: "was here earlier", useful for deciding whether to wait. */
export const RECENT_WINDOW_MS = 60 * 60_000;

export function presenceOf(lastSeenAt: Date | null | undefined, now: Date): Presence {
  if (!lastSeenAt) return "AWAY";
  const elapsed = now.getTime() - lastSeenAt.getTime();
  // A clock skew that puts somebody in the future is treated as present
  // rather than as an error: the alternative is a teacher appearing away to
  // a class because a server drifted.
  if (elapsed < 0) return "ONLINE";
  if (elapsed <= ONLINE_WINDOW_MS) return "ONLINE";
  if (elapsed <= RECENT_WINDOW_MS) return "RECENTLY";
  return "AWAY";
}

export function isOnline(lastSeenAt: Date | null | undefined, now: Date): boolean {
  return presenceOf(lastSeenAt, now) === "ONLINE";
}

/**
 * What to show beside a name.
 *
 * Words rather than a time. "Online" and "Earlier today" answer the question;
 * "last seen 22:41" answers a different one that nobody asked and that a
 * child should not have to explain to a classmate.
 */
export function presenceLabel(presence: Presence): string {
  switch (presence) {
    case "ONLINE":
      return "Online";
    case "RECENTLY":
      return "Here recently";
    case "AWAY":
      return "";
  }
}

export interface PresenceView {
  presence: Presence;
  online: boolean;
  label: string;
}

export function describePresence(lastSeenAt: Date | null | undefined, now: Date): PresenceView {
  const presence = presenceOf(lastSeenAt, now);
  return { presence, online: presence === "ONLINE", label: presenceLabel(presence) };
}

/**
 * Whether this viewer may see anybody's presence at all.
 *
 * A guardian may not. They can already see their own child's work and
 * messages; knowing which of their child's classmates is online at nine in
 * the evening is somebody else's family's business.
 */
export function canSeePresence(viewer: { roles: string[] }): boolean {
  return !viewer.roles.includes("GUARDIAN");
}
