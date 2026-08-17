/**
 * Whether the school's messages are actually arriving.
 *
 * The outbox has always recorded every failure faithfully, and nothing ever
 * read it back. A school whose SMTP password is wrong keeps pressing send,
 * every row lands as FAILED, and the first person to notice is a parent who
 * says they were never told about the closure. The system knew, on the very
 * first message, and did not say.
 *
 * Pure, so "is this school's email broken" can be argued with in a test
 * rather than reproduced by breaking a mail server.
 */

export type Health = "HEALTHY" | "DEGRADED" | "BROKEN" | "NOT_SET_UP" | "IDLE";

export interface MessageOutcome {
  channel: "EMAIL" | "SMS";
  status: string;
  statusReason: string | null;
}

export interface ChannelHealth {
  channel: "EMAIL" | "SMS";
  health: Health;
  sent: number;
  failed: number;
  /** The commonest failure, in the gateway's own words. */
  topReason: string | null;
  /** What is wrong, in a sentence an administrator can act on. */
  headline: string;
  /** Where to go and fix it. Null when there is nothing to fix. */
  action: string | null;
}

/**
 * Failures a person can do something about, named.
 *
 * Providers phrase these differently and none of them are worded for a
 * bursar. Mapping the handful that actually occur is the difference between
 * "check the outbox" and "your password is wrong".
 */
export function explainFailure(reason: string | null): string | null {
  if (!reason) return null;
  const text = reason.toLowerCase();

  // Checked before the general auth failure below, which it also matches:
  // both mention "invalid login", and only this one needs "then wait".
  // Specific before general, or the specific case is never reached.
  if (/too many failed login|rate limit|throttl/.test(text)) {
    return "The mail server has started refusing us for repeated failed logins. Fix the password, then wait a few minutes.";
  }
  if (/invalid login|535|authentication failed|auth.*fail|unauthorized|invalid credentials/.test(text)) {
    return "The username or password for the mail server is being rejected.";
  }
  if (/enotfound|eai_again|getaddrinfo|dns/.test(text)) {
    return "The mail server's address cannot be found. Check the host name.";
  }
  if (/econnrefused|connect|etimedout|timeout/.test(text)) {
    return "Nothing is answering at that server and port.";
  }
  if (/certificate|self.signed|tls|ssl/.test(text)) {
    return "The server's security certificate was rejected. Check the encryption setting.";
  }
  if (/no email gateway|no sms gateway|not configured/.test(text)) {
    return null;
  }
  return null;
}

function commonest(reasons: (string | null)[]): string | null {
  const counts = new Map<string, number>();
  for (const reason of reasons) {
    if (!reason) continue;
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  let best: string | null = null;
  let most = 0;
  for (const [reason, count] of counts) {
    if (count > most) {
      most = count;
      best = reason;
    }
  }
  return best;
}

const CHANNEL_WORD: Record<"EMAIL" | "SMS", string> = { EMAIL: "email", SMS: "text message" };

/**
 * One channel's health from its recent outcomes.
 *
 * "Not set up" is deliberately not a problem. Plenty of schools never
 * configure SMS, and shouting about it every day would train everyone to
 * ignore the banner that matters.
 */
export function channelHealth(
  channel: "EMAIL" | "SMS",
  outcomes: MessageOutcome[],
  configured: boolean,
): ChannelHealth {
  const mine = outcomes.filter((outcome) => outcome.channel === channel);
  const sent = mine.filter((outcome) => outcome.status === "SENT").length;
  const failed = mine.filter((outcome) => outcome.status === "FAILED").length;
  const word = CHANNEL_WORD[channel];

  if (!configured) {
    return {
      channel,
      health: "NOT_SET_UP",
      sent,
      failed,
      topReason: null,
      headline: `No ${word} gateway is set up`,
      action: null,
    };
  }

  if (mine.length === 0) {
    return { channel, health: "IDLE", sent, failed, topReason: null, headline: `No ${word}s sent recently`, action: null };
  }

  if (failed === 0) {
    return {
      channel,
      health: "HEALTHY",
      sent,
      failed,
      topReason: null,
      headline: `${word.charAt(0).toUpperCase()}${word.slice(1)}s are being delivered`,
      action: null,
    };
  }

  const topReason = commonest(mine.map((outcome) => outcome.statusReason));
  const explained = explainFailure(topReason);

  // Everything failing is a different problem from some failing: one is a
  // broken gateway, the other is bad addresses. They need different actions
  // and must not be reported the same way.
  const broken = sent === 0;

  return {
    channel,
    health: broken ? "BROKEN" : "DEGRADED",
    sent,
    failed,
    topReason,
    headline: broken
      ? `No ${word}s are getting through — the last ${failed} all failed`
      : `${failed} of the last ${mine.length} ${word}s failed`,
    action: explained ?? `Check the ${word} gateway under Settings → Communication.`,
  };
}

export interface GatewayHealth {
  channels: ChannelHealth[];
  /** True when somebody needs to do something today. */
  needsAttention: boolean;
  /** One line for a dashboard banner, or null when all is well. */
  banner: string | null;
}

export function gatewayHealth(
  outcomes: MessageOutcome[],
  configured: { email: boolean; sms: boolean },
): GatewayHealth {
  const channels = [
    channelHealth("EMAIL", outcomes, configured.email),
    channelHealth("SMS", outcomes, configured.sms),
  ];

  // Only genuine breakage raises a banner. A school with no SMS gateway and
  // no SMS traffic is not having a bad day.
  const bad = channels.filter((c) => c.health === "BROKEN" || c.health === "DEGRADED");

  return {
    channels,
    needsAttention: bad.length > 0,
    banner: bad.length === 0 ? null : bad.map((c) => `${c.headline}. ${c.action ?? ""}`.trim()).join(" "),
  };
}
