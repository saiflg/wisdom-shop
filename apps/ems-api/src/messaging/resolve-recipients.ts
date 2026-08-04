import type { MessageChannel } from "ems-tenant-client";

/**
 * Who gets told, and on which channel.
 *
 * Split out from the service and kept pure because this is the function that
 * decides whether one family learns something about another family's child.
 * The scoping rule is the same one attendance and grading enforce on reads —
 * a guardian is only ever a recipient for a student they are actually linked
 * to — and it is worth being able to test that directly, with no database in
 * the way to make a mistake look like a query bug.
 */

export interface GuardianLinkInput {
  guardianUserId: string;
  studentProfileId: string;
  guardianName: string;
  email?: string | null;
  phone?: string | null;
  notifyByEmail: boolean;
  notifyBySms: boolean;
}

export interface Recipient {
  userId: string;
  name: string;
  address: string;
  channel: MessageChannel;
}

export interface SkippedRecipient {
  userId: string;
  name: string;
  channel: MessageChannel;
  reason: string;
}

export interface ResolveResult {
  recipients: Recipient[];
  skipped: SkippedRecipient[];
}

/**
 * Resolves the guardians of one student for one channel.
 *
 * Links for other students are not filtered later or de-duplicated after the
 * fact — they are never considered. Passing the whole school's links is
 * therefore safe, which matters because that is exactly what a careless
 * caller will do.
 *
 * Opted-out guardians and those with no address for the channel are returned
 * as `skipped` with a reason rather than silently dropped: a school looking at
 * an outbox needs to see that a parent was deliberately not contacted, and
 * why. Silence is indistinguishable from a bug.
 */
export function resolveRecipients(
  links: GuardianLinkInput[],
  studentProfileId: string,
  channel: MessageChannel,
): ResolveResult {
  const recipients: Recipient[] = [];
  const skipped: SkippedRecipient[] = [];

  for (const link of links) {
    // The invariant. Everything else in this function is presentation.
    if (link.studentProfileId !== studentProfileId) continue;

    const optedIn = channel === "EMAIL" ? link.notifyByEmail : channel === "SMS" ? link.notifyBySms : true;
    if (!optedIn) {
      skipped.push({
        userId: link.guardianUserId,
        name: link.guardianName,
        channel,
        reason: "This guardian has opted out of these messages",
      });
      continue;
    }

    const address = addressFor(link, channel);
    if (!address) {
      skipped.push({
        userId: link.guardianUserId,
        name: link.guardianName,
        channel,
        reason: `No ${channel === "EMAIL" ? "email address" : "phone number"} on file`,
      });
      continue;
    }

    // A guardian linked twice to the same child would otherwise be messaged
    // twice; the send-once index would catch it, but reporting a duplicate
    // recipient as a failure would be misleading.
    if (recipients.some((existing) => existing.address === address)) continue;

    recipients.push({ userId: link.guardianUserId, name: link.guardianName, address, channel });
  }

  return { recipients, skipped };
}

function addressFor(link: GuardianLinkInput, channel: MessageChannel): string | null {
  const raw = channel === "EMAIL" ? link.email : link.phone;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}
