/**
 * Turning guardian links into a list of families.
 *
 * The database stores one row per (guardian, child) pair, which is the right
 * shape for asking "who may see this child" and the wrong shape for a
 * directory: a mother of three appears three times, and an office scanning for
 * her phone number finds three half-answers instead of one whole one.
 *
 * Pure, so the collapsing can be argued with in a test rather than clicked at
 * in a browser.
 */

import { describeReachability } from "./guardian-contact";

export interface GuardianLinkRow {
  id: string;
  relationship: string;
  guardianUser: {
    id: string;
    firstName: string;
    lastName: string;
    /**
     * Nullable, and not a technicality: a parent recorded from a paper
     * admission form may have only a phone number. They cannot sign into the
     * portal or be emailed, so the directory has to be able to say so rather
     * than render an empty cell.
     */
    email: string | null;
    /**
     * The number the office actually rings. Shown because the overview has
     * always judged a family unreachable on email *and* phone, while the
     * directory displayed only the first of the two — so a parent with a
     * perfectly good telephone number looked like a gap in the records.
     */
    phone?: string | null;
    /**
     * Whether a password is set. The hash itself never reaches this module —
     * only whether one exists, so an office can see who still cannot sign in
     * and send them an invitation.
     */
    hasPassword?: boolean;
  };
  studentProfile: {
    id: string;
    user: { firstName: string; lastName: string };
    enrollments: { class: { name: string } | null }[];
  };
}

export interface GuardianChild {
  linkId: string;
  studentProfileId: string;
  name: string;
  className: string | null;
  relationship: string;
}

export interface GuardianEntry {
  guardianUserId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  /** Set, never set — the office needs to know which, to know whom to invite. */
  hasPassword: boolean;
  /** "Email and phone on file", "No way to reach them" — words, for scanning. */
  reachability: string;
  children: GuardianChild[];
}

/** "Adewale, Segun" — surname first, because that is how a roster is scanned. */
function sortKey(entry: GuardianEntry): string {
  return `${entry.lastName} ${entry.firstName}`.toLowerCase();
}

/**
 * One entry per guardian, each carrying every child they are linked to.
 *
 * A child's class comes from their current enrollment. Taking the last rather
 * than the first: enrollments accumulate as a child moves up the school, and
 * the newest is the one an office means by "which class is she in".
 * A child with no enrollment yet gets null rather than being dropped — a
 * newly admitted pupil still has parents somebody needs to phone.
 */
export function groupGuardians(links: GuardianLinkRow[]): GuardianEntry[] {
  const byGuardian = new Map<string, GuardianEntry>();

  for (const link of links) {
    const user = link.guardianUser;
    let entry = byGuardian.get(user.id);
    if (!entry) {
      entry = {
        guardianUserId: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone ?? null,
        hasPassword: user.hasPassword ?? false,
        reachability: describeReachability({ email: user.email, phone: user.phone ?? null }),
        children: [],
      };
      byGuardian.set(user.id, entry);
    }

    const enrollments = link.studentProfile.enrollments;
    const current = enrollments.length > 0 ? enrollments[enrollments.length - 1] : undefined;

    entry.children.push({
      linkId: link.id,
      studentProfileId: link.studentProfile.id,
      name: `${link.studentProfile.user.firstName} ${link.studentProfile.user.lastName}`,
      className: current?.class?.name ?? null,
      relationship: link.relationship,
    });
  }

  const entries = [...byGuardian.values()];
  for (const entry of entries) {
    entry.children.sort((a, b) => a.name.localeCompare(b.name));
  }
  return entries.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}
