/**
 * Invitations to the parent portal.
 *
 * The school office creates one; the parent follows the link and chooses
 * their own password. That the office never learns it is the entire point:
 * until now a new guardian could only be created by an administrator typing
 * a password on their behalf, which means somebody in the office knows how
 * to sign in as that family and read their child's record.
 *
 * Pure, so the rules can be argued with in a test rather than clicked at in
 * a browser.
 */

/** Long enough for a parent to act on over a weekend, short enough that a
 *  forwarded email is not a standing key to a child's record. */
export const INVITATION_TTL_DAYS = 7;

export type InvitationState = "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";

/**
 * Why an invitation was revoked.
 *
 * SUPERSEDED and CANCELLED are both "revoked" to the system and completely
 * different to the parent holding the link: one means a newer email is
 * already in their inbox, the other means there is nothing to look for and
 * they should ask the school.
 */
export type RevokedReason = "SUPERSEDED" | "CANCELLED";

export interface InvitationLike {
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  revokedReason?: RevokedReason | string | null;
}

/**
 * Accepted and revoked both beat expiry.
 *
 * An invitation that was used on Monday and lapsed on Friday is *accepted* —
 * reporting it as expired would tell an office to send another one to a
 * parent who is already signed in.
 */
export function invitationState(invitation: InvitationLike, now: Date): InvitationState {
  if (invitation.acceptedAt) return "ACCEPTED";
  if (invitation.revokedAt) return "REVOKED";
  if (invitation.expiresAt.getTime() <= now.getTime()) return "EXPIRED";
  return "PENDING";
}

export function canAccept(invitation: InvitationLike, now: Date): boolean {
  return invitationState(invitation, now) === "PENDING";
}

export function expiryFor(now: Date, days: number = INVITATION_TTL_DAYS): Date {
  return new Date(now.getTime() + days * 86_400_000);
}

/**
 * Why a link will not work, in words a parent can act on.
 *
 * Distinguishing expired from already-used is not a leak: you need the token
 * to get either answer, and holding it means you were the intended
 * recipient. An unknown token never reaches this function — that one gets a
 * single flat "not valid", so guessing tokens teaches nothing.
 */
export function refusalReason(invitation: InvitationLike, now: Date): string | null {
  switch (invitationState(invitation, now)) {
    case "PENDING":
      return null;
    case "ACCEPTED":
      return "This invitation has already been used. Try signing in instead, or ask the school for a new link.";
    case "REVOKED":
      // The overwhelmingly likely case: two emails, and they opened the
      // older one. Sending them back to the school for a link they already
      // have would waste a telephone call on both sides.
      return invitation.revokedReason === "SUPERSEDED"
        ? "The school has sent you a newer invitation. Please open the most recent one — it will be the latest email from them."
        : "The school cancelled this invitation. Ask them for a new link.";
    case "EXPIRED":
      return "This invitation has expired. Ask the school to send you a new one.";
  }
}

/**
 * How long a parent has left, in whole days.
 *
 * Rounded up, and never negative: an invitation with four hours left is
 * honestly "1 day", and one that lapsed on Tuesday has no time left rather
 * than minus three days.
 */
export function daysRemaining(invitation: InvitationLike, now: Date): number {
  const ms = invitation.expiresAt.getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}

/** Words, never a timestamp — an office reads "expires tomorrow", not an ISO date. */
export function describeExpiry(invitation: InvitationLike, now: Date): string {
  const state = invitationState(invitation, now);
  if (state === "ACCEPTED") return "Used";
  if (state === "REVOKED") {
    return invitation.revokedReason === "SUPERSEDED" ? "Replaced by a newer one" : "Cancelled";
  }

  const days = daysRemaining(invitation, now);
  if (days === 0) return "Expired";
  if (days === 1) return "Expires today";
  if (days === 2) return "Expires tomorrow";
  return `Expires in ${days - 1} days`;
}

export interface GuardianAccessLike {
  email: string | null;
  hasPassword: boolean;
}

/**
 * A parent the school could invite but has not.
 *
 * Mirrors lacksPortalAccess in parents-overview, which raises the alert this
 * feature exists to answer: an account that exists on paper, has an email
 * address, and has never been set up.
 */
export function needsInvitation(guardian: GuardianAccessLike): boolean {
  return Boolean(guardian.email) && !guardian.hasPassword;
}

/**
 * Whether creating another invitation supersedes an existing one.
 *
 * Two live links for one parent means one of them stops working the moment
 * the other is used, and the office cannot tell which they sent. So a new
 * invitation cancels any pending predecessor, and accepted ones are left
 * exactly as they are — history, not clutter to tidy away.
 */
export function supersedes(existing: InvitationLike, now: Date): boolean {
  return invitationState(existing, now) === "PENDING";
}

/**
 * The link a parent is sent.
 *
 * Built here rather than in the service so the shape is testable and there
 * is exactly one definition of it. The token rides in the path rather than
 * the query string: query strings are the part of a URL that ends up in
 * server logs, proxy logs and Referer headers.
 */
export function invitationUrl(baseUrl: string, schoolSlug: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/invite/${encodeURIComponent(schoolSlug)}/${encodeURIComponent(token)}`;
}
