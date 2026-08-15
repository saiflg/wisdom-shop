/**
 * A parent's contact details: what may be changed, by whom, and what must
 * never be allowed to happen by accident.
 *
 * The parents overview has always been able to say "this family has no email
 * or phone on file". Until now nothing could act on that — the directory
 * showed an email and no telephone number, and there was no route anywhere
 * that could edit either. This is the half that does something about it.
 *
 * Pure, so the rules can be argued with in a test rather than clicked at in
 * a browser.
 */

export interface ContactInput {
  email?: string | null;
  phone?: string | null;
}

export interface GuardianContactState {
  email: string | null;
  phone: string | null;
  /** Whether they can sign in today. Clearing the email of someone who can
   *  is how a parent is locked out of their child's record for good. */
  hasPassword: boolean;
}

/**
 * Trimmed and lower-cased; blank becomes null.
 *
 * Lower-cased because it is the login identifier and a parent who typed
 * "Ade@..." on Monday will type "ade@..." on Friday. Blank becomes null
 * rather than an empty string so the unique index keeps treating absent
 * addresses as distinct — an empty string would collide on the second
 * parent who has none.
 */
export function cleanEmail(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

/**
 * Trimmed, and otherwise left exactly as it was typed.
 *
 * Deliberately not normalised to E.164 or any other shape. The schema makes
 * the same choice for the same reason: what counts as a valid number depends
 * on whatever SMS vendor the school uses, and a guess here would silently
 * mangle numbers that worked — a leading zero dropped from a local number is
 * a parent nobody can reach in an emergency.
 */
export function cleanPhone(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Somewhere between "looks like an address" and "is deliverable". */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * A number worth storing.
 *
 * Digit count rather than a format, because the format is the vendor's
 * business. Anything with fewer than seven digits is a typo or a room
 * extension, not a number anybody can ring from outside.
 */
export function looksLikePhone(value: string): boolean {
  return (value.match(/\d/g)?.length ?? 0) >= 7;
}

/**
 * Why a proposed change must be refused, or null.
 *
 * The one that matters: removing the email address of a parent who can sign
 * in. Email is the login identifier here, so clearing it does not tidy a
 * record — it silently destroys an account, and the parent discovers it the
 * next time they try to look at their child's marks.
 */
export function contactProblem(current: GuardianContactState, next: ContactInput): string | null {
  const email = "email" in next ? cleanEmail(next.email) : current.email;
  const phone = "phone" in next ? cleanPhone(next.phone) : current.phone;

  if (email && !looksLikeEmail(email)) return "That does not look like an email address";
  if (phone && !looksLikePhone(phone)) return "That does not look like a phone number";

  if (current.email && !email && current.hasPassword) {
    return "This parent signs in with that email address. Removing it would lock them out of the portal.";
  }

  return null;
}

/**
 * What a parent may change about themselves.
 *
 * Their telephone number, and nothing else. Email is the login identifier,
 * and letting an account rewrite its own identifier is how a session that
 * should not have been open becomes a permanent one. Changing it goes
 * through the office, who can see who they are talking to.
 */
export const PARENT_EDITABLE: readonly (keyof ContactInput)[] = ["phone"];

export function parentChangeProblem(next: ContactInput): string | null {
  const asked = Object.keys(next) as (keyof ContactInput)[];
  const refused = asked.filter((field) => !PARENT_EDITABLE.includes(field));
  if (refused.length > 0) {
    return "Ask the school office to change the email address you sign in with.";
  }
  return null;
}

/**
 * The fields that would actually change.
 *
 * So that saving a form nobody edited writes nothing, and so an office is
 * not told "saved" when it changed only the capitalisation of an address.
 */
export function changedFields(current: GuardianContactState, next: ContactInput): (keyof ContactInput)[] {
  const changed: (keyof ContactInput)[] = [];
  if ("email" in next && cleanEmail(next.email) !== current.email) changed.push("email");
  if ("phone" in next && cleanPhone(next.phone) !== current.phone) changed.push("phone");
  return changed;
}

/** In words, for an office scanning a list. */
export function describeReachability(contact: { email: string | null; phone: string | null }): string {
  if (contact.email && contact.phone) return "Email and phone on file";
  if (contact.email) return "Email only";
  if (contact.phone) return "Phone only";
  return "No way to reach them";
}

/**
 * Whether losing this address costs them the portal.
 *
 * Used to warn *before* the office presses save, rather than refusing after
 * — a warning that arrives only as an error teaches somebody to expect the
 * form to be broken.
 */
export function clearingEmailLocksThemOut(current: GuardianContactState, next: ContactInput): boolean {
  return Boolean("email" in next && current.email && !cleanEmail(next.email) && current.hasPassword);
}
