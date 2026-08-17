/**
 * Who an announcement reaches.
 *
 * Unlike every other message this system sends, an announcement is not about
 * one child. It goes to a crowd, it costs money per head on SMS, and it
 * cannot be recalled — so the interesting work here is counting honestly
 * *before* anything is sent, and never sending one person the same thing
 * twice.
 *
 * The duplicate problem is real and specific: a parent with three children in
 * the school appears three times in the guardian links, and a staff member
 * who is also a parent appears in both halves of "whole school". Naively
 * resolving the audience sends that person three or four copies of a school
 * closure notice.
 *
 * Pure, so all of this can be argued with in a test rather than discovered by
 * four hundred families at once.
 */

export type Audience = "WHOLE_SCHOOL" | "ALL_PARENTS" | "ALL_STAFF" | "CLASS";
export type Channel = "EMAIL" | "SMS";

export const AUDIENCES: readonly Audience[] = ["WHOLE_SCHOOL", "ALL_PARENTS", "ALL_STAFF", "CLASS"];

const AUDIENCE_LABELS: Record<Audience, string> = {
  WHOLE_SCHOOL: "Everyone — all parents and all staff",
  ALL_PARENTS: "All parents",
  ALL_STAFF: "All staff",
  CLASS: "The parents of one class",
};

export function audienceLabel(audience: Audience): string {
  return AUDIENCE_LABELS[audience] ?? "Unknown";
}

/** A guardian, once per child they are linked to. */
export interface GuardianCandidate {
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
  notifyByEmail: boolean;
  notifyBySms: boolean;
  /** Used only to filter a CLASS announcement. */
  classIds: string[];
}

export interface StaffCandidate {
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
}

export interface AudienceInput {
  guardians: GuardianCandidate[];
  staff: StaffCandidate[];
  /** Required when the audience is CLASS. */
  classId?: string | null;
}

export interface ResolvedRecipient {
  userId: string;
  name: string;
  address: string;
  channel: Channel;
  kind: "GUARDIAN" | "STAFF";
}

export interface SkippedRecipient {
  userId: string;
  name: string;
  reason: string;
}

export interface AudiencePlan {
  channel: Channel;
  audience: Audience;
  recipients: ResolvedRecipient[];
  skipped: SkippedRecipient[];
  /** People reached. Never the number of links, which double-counts parents. */
  reach: number;
  summary: string;
}

function addressFor(person: { email: string | null; phone: string | null }, channel: Channel): string | null {
  const raw = channel === "EMAIL" ? person.email : person.phone;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Whether this guardian has muted this channel.
 *
 * Respected even for a school-wide announcement. The temptation is to say a
 * closure notice is too important to mute — but a parent who opted out did so
 * deliberately, and a system that overrides that whenever the sender feels
 * strongly has no opt-out at all. They are reported as skipped so the office
 * can telephone if it truly matters.
 */
function optedIn(guardian: GuardianCandidate, channel: Channel): boolean {
  return channel === "EMAIL" ? guardian.notifyByEmail : guardian.notifyBySms;
}

function includesGuardian(guardian: GuardianCandidate, audience: Audience, classId?: string | null): boolean {
  if (audience === "ALL_STAFF") return false;
  if (audience === "CLASS") return Boolean(classId) && guardian.classIds.includes(classId!);
  return true;
}

/**
 * Resolve one channel's audience, once per person.
 *
 * De-duplicated on the ADDRESS rather than the user id: a mother and father
 * sharing one mailbox are two users with one inbox, and two copies of the
 * same notice in it is the thing a parent notices and mentions. The database
 * enforces the same rule on write — see the (dedupeKey, channel,
 * recipientAddress) index — so this is the honest preview of what that
 * constraint will allow through, not a second, softer version of it.
 */
export function planAudience(
  input: AudienceInput,
  audience: Audience,
  channel: Channel,
): AudiencePlan {
  const recipients: ResolvedRecipient[] = [];
  const skipped: SkippedRecipient[] = [];
  const seenAddresses = new Set<string>();
  const seenUsers = new Set<string>();

  const take = (
    person: { userId: string; name: string },
    address: string,
    kind: "GUARDIAN" | "STAFF",
  ) => {
    const key = address.trim().toLowerCase();
    if (seenAddresses.has(key)) return;
    seenAddresses.add(key);
    recipients.push({ userId: person.userId, name: person.name, address: address.trim(), channel, kind });
  };

  for (const guardian of input.guardians) {
    if (!includesGuardian(guardian, audience, input.classId)) continue;

    // One decision per person, not per child. Without this a parent of three
    // is skipped-and-reported three times as well as messaged three times.
    if (seenUsers.has(guardian.userId)) continue;
    seenUsers.add(guardian.userId);

    if (!optedIn(guardian, channel)) {
      skipped.push({
        userId: guardian.userId,
        name: guardian.name,
        reason: `Has opted out of ${channel === "EMAIL" ? "emails" : "text messages"}`,
      });
      continue;
    }

    const address = addressFor(guardian, channel);
    if (!address) {
      skipped.push({
        userId: guardian.userId,
        name: guardian.name,
        reason: `No ${channel === "EMAIL" ? "email address" : "phone number"} on file`,
      });
      continue;
    }

    take(guardian, address, "GUARDIAN");
  }

  if (audience === "WHOLE_SCHOOL" || audience === "ALL_STAFF") {
    for (const member of input.staff) {
      // Somebody who is both staff and a parent has already been counted.
      if (seenUsers.has(member.userId)) continue;
      seenUsers.add(member.userId);

      const address = addressFor(member, channel);
      if (!address) {
        skipped.push({
          userId: member.userId,
          name: member.name,
          reason: `No ${channel === "EMAIL" ? "email address" : "phone number"} on file`,
        });
        continue;
      }
      take(member, address, "STAFF");
    }
  }

  return {
    channel,
    audience,
    recipients,
    skipped,
    reach: recipients.length,
    summary: describeReach(recipients.length, skipped.length, channel),
  };
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function describeReach(reach: number, skippedCount: number, channel: Channel): string {
  const medium = channel === "EMAIL" ? "email" : "text message";
  if (reach === 0) {
    return skippedCount > 0
      ? `Nobody would receive this ${medium} — all ${skippedCount} were skipped`
      : `Nobody would receive this ${medium}`;
  }
  const base = `${plural(reach, "person", "people")} would receive this ${medium}`;
  return skippedCount > 0 ? `${base}, ${skippedCount} skipped` : base;
}

/**
 * A warning to show before sending, or null.
 *
 * Text messages cost money per head and cannot be recalled. A school about to
 * spend on four hundred of them should be told the number before it presses
 * the button, not discover it on an invoice.
 */
export function sendWarning(plan: AudiencePlan): string | null {
  if (plan.reach === 0) return null;
  if (plan.channel === "SMS") {
    return `This will send ${plural(plan.reach, "text message", "text messages")}. Text messages cost money and cannot be recalled.`;
  }
  if (plan.reach >= 100) {
    return `This will email ${plural(plan.reach, "person", "people")} and cannot be recalled.`;
  }
  return null;
}

/** Why this announcement cannot be sent at all, or null. */
export function announcementProblem(input: {
  title: string;
  body: string;
  audience: string;
  classId?: string | null;
  channels: string[];
}): string | null {
  if (!input.title.trim()) return "Give the announcement a title.";
  if (!input.body.trim()) return "Write the announcement first.";
  if (!AUDIENCES.includes(input.audience as Audience)) return "Choose who this is for.";
  if (input.audience === "CLASS" && !input.classId) return "Choose which class this is for.";
  if (input.channels.length === 0) return "Choose at least one way to send it.";
  if (input.channels.some((channel) => channel !== "EMAIL" && channel !== "SMS")) {
    return "Announcements can be sent by email or text message.";
  }
  return null;
}

/**
 * The key that makes sending twice harmless.
 *
 * One announcement, one key. The outbox's unique index on (dedupeKey,
 * channel, recipientAddress) then guarantees a person cannot receive the same
 * announcement twice however many times the button is pressed — the same
 * approach payroll takes to a re-run.
 */
export function announcementDedupeKey(announcementId: string): string {
  return `announcement:${announcementId}`;
}
