/**
 * Account-level brute-force policy.
 *
 * IP rate limiting alone is not enough: an attacker with a botnet or a pool
 * of proxies spreads guesses across addresses and never trips a per-IP
 * counter. Counting failures against the *account* closes that, because the
 * account is the thing being attacked.
 *
 * The lock is deliberately time-boxed rather than permanent. A permanent lock
 * turns this control into a denial-of-service: anyone who knows a victim's
 * email could lock them out at will. A short lock costs an attacker orders of
 * magnitude in throughput while costing a real user a few minutes.
 *
 * Kept as pure functions so the thresholds can be tested without a database
 * or a clock.
 */

/** Consecutive failures tolerated before the account is locked. */
export const MAX_FAILED_ATTEMPTS = 5;

/** How long each lock lasts, by how many times the account has been locked. */
const LOCK_LADDER_MS = [
  1 * 60_000, // 1 minute
  5 * 60_000, // 5 minutes
  15 * 60_000, // 15 minutes
  60 * 60_000, // 1 hour
];

export interface LockoutState {
  failedLoginAttempts: number;
  lockedUntil: Date | null;
}

/**
 * True when the account is currently inside a lock window.
 *
 * The nullish comparison is deliberate. A caller that hands over a row
 * missing the column — a partial `select`, a stub — would otherwise take the
 * `undefined !== null` branch and be reported as *locked*, which fails in the
 * direction of locking people out of their own accounts. Absent means "no
 * lock recorded".
 */
export function isLockedOut(state: LockoutState, now: Date = new Date()): boolean {
  return state.lockedUntil != null && state.lockedUntil.getTime() > now.getTime();
}

/** Whole seconds remaining on the lock, for the retry message. Never negative. */
export function lockRemainingSeconds(state: LockoutState, now: Date = new Date()): number {
  if (!state.lockedUntil) return 0;
  return Math.max(0, Math.ceil((state.lockedUntil.getTime() - now.getTime()) / 1000));
}

/**
 * The state to persist after a failed password attempt.
 *
 * Attempts keep counting past the threshold so repeat offenders climb the
 * ladder: the 5th consecutive failure locks for a minute, the 10th for five,
 * and so on. Someone genuinely mistyping their password gets the short end of
 * that ladder; someone grinding through a wordlist gets the long end.
 */
export function registerFailure(state: LockoutState, now: Date = new Date()): LockoutState {
  // Same reasoning as isLockedOut: a missing count is zero, not NaN.
  const failedLoginAttempts = (state.failedLoginAttempts ?? 0) + 1;

  if (failedLoginAttempts % MAX_FAILED_ATTEMPTS !== 0) {
    return { failedLoginAttempts, lockedUntil: state.lockedUntil ?? null };
  }

  const lockNumber = failedLoginAttempts / MAX_FAILED_ATTEMPTS;
  const index = Math.min(lockNumber, LOCK_LADDER_MS.length) - 1;
  return {
    failedLoginAttempts,
    lockedUntil: new Date(now.getTime() + LOCK_LADDER_MS[index]),
  };
}

/** The state to persist after any successful authentication. */
export function clearedState(): LockoutState {
  return { failedLoginAttempts: 0, lockedUntil: null };
}
