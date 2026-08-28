export interface SessionLike {
  expiresAt: Date;
  revokedAt: Date | null;
  userAgent: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Is this session still usable?
 *
 * Both conditions, not either. A revoked token that has not yet expired is
 * the dangerous one — it is the session somebody ended deliberately, and
 * treating "not expired" as "active" would show it as live on a screen whose
 * whole purpose is telling somebody what can still reach their account.
 */
export function isActive(session: SessionLike, now: Date): boolean {
  if (session.revokedAt !== null) return false;
  return session.expiresAt.getTime() > now.getTime();
}

/**
 * A user agent as something a person can recognise.
 *
 * Deliberately shallow. User-agent strings lie, and every browser claims to
 * be several others; a confident "Chrome 138 on Windows 11" would be wrong
 * often enough to make somebody dismiss a session they should have looked
 * at. This aims only to be recognisable enough to answer "is that me?", and
 * says "Unknown device" rather than guessing when it cannot tell.
 */
export function describeDevice(userAgent: string | null): string {
  const ua = userAgent?.trim();
  if (!ua) return "Unknown device";

  const browser =
    /\bEdg\//.test(ua) ? "Edge"
    : /\bOPR\/|\bOpera\b/.test(ua) ? "Opera"
    : /\bFirefox\//.test(ua) ? "Firefox"
    // Chrome must be tested before Safari: every Chrome UA also says Safari.
    : /\bChrome\/|\bCriOS\//.test(ua) ? "Chrome"
    : /\bSafari\//.test(ua) ? "Safari"
    : null;

  const platform =
    /\bAndroid\b/.test(ua) ? "Android"
    : /\biPhone\b|\biPad\b|\biOS\b/.test(ua) ? "iOS"
    : /\bWindows\b/.test(ua) ? "Windows"
    : /\bMac OS X\b|\bMacintosh\b/.test(ua) ? "macOS"
    : /\bLinux\b/.test(ua) ? "Linux"
    : null;

  if (browser && platform) return `${browser} on ${platform}`;
  if (browser) return browser;
  if (platform) return platform;
  return "Unknown device";
}

export interface SessionSummary {
  active: number;
  /** Ended deliberately. */
  revoked: number;
  /** Ran out on their own. */
  expired: number;
}

export function summariseSessions(sessions: SessionLike[], now: Date): SessionSummary {
  let active = 0;
  let revoked = 0;
  let expired = 0;

  for (const session of sessions) {
    if (session.revokedAt !== null) revoked += 1;
    else if (session.expiresAt.getTime() <= now.getTime()) expired += 1;
    else active += 1;
  }

  return { active, revoked, expired };
}

/**
 * Why this session cannot be ended, or null.
 *
 * Ending one that is already ended is NOT an error. Somebody who clicks twice
 * on a security screen because the first click seemed not to work should be
 * told it is already gone, not shown a failure that makes them wonder whether
 * their account is still reachable.
 */
export function revokeProblem(session: SessionLike | null): string | null {
  if (!session) return "That session does not exist";
  return null;
}

/** True when the session was already over before anybody pressed anything. */
export function alreadyEnded(session: SessionLike, now: Date): boolean {
  return !isActive(session, now);
}
