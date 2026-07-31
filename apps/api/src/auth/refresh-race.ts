/**
 * Telling a benign double-refresh apart from a stolen refresh token.
 *
 * Refresh tokens rotate, and presenting a rotated-out one is normally proof
 * of theft: the legitimate holder would have the replacement. The containment
 * response — revoking every session for that user — is correct and stays.
 *
 * But two tabs opened at the same moment both send the same cookie. One
 * rotates it; the other arrives holding a token that was valid when it was
 * sent and rotated out microseconds later. Treating that as theft signs the
 * user out of a browser they are actively using, and no amount of care on the
 * client can prevent it: the tabs share a cookie jar and cannot coordinate.
 *
 * So a replay is tolerated only when *all* of the following hold. Each one
 * exists to keep the exception from becoming a hole an attacker can drive
 * through:
 *
 *  1. **It happened just now.** Outside a short window this is not a race.
 *  2. **The chain has not moved on.** The token's direct successor must still
 *     be live. If the successor has itself been rotated, the caller is
 *     replaying from deeper in the chain than one step, which no race
 *     produces — that is a replay of a captured token.
 *  3. **It is the same client.** A replay from a different browser is theft
 *     whatever the timing.
 *
 * IP address is deliberately *not* compared. Mobile clients change IP between
 * requests routinely, so matching on it would sign real users out constantly
 * while barely inconveniencing an attacker who is usually replaying from a
 * captured session anyway.
 *
 * Note what tolerating a race does NOT do: it does not resurrect the replayed
 * token, and it does not hand back the successor (tokens are stored hashed,
 * so the original string is not recoverable). It issues a fresh pair, leaving
 * the other tab's token untouched. Both tabs end up with their own token,
 * which is the same state two devices would be in.
 */

export interface RotatedTokenState {
  revokedAt: Date | null;
  userAgent: string | null;
}

export interface SuccessorTokenState {
  revokedAt: Date | null;
}

export interface RefreshRaceInput {
  /** The rotated-out token being presented again. */
  token: RotatedTokenState;
  /** The token issued when it was rotated, if the link is known. */
  successor: SuccessorTokenState | null;
  requestUserAgent?: string | null;
  /** Zero disables tolerance entirely and restores strict detection. */
  graceMs: number;
  now?: Date;
}

/** Treats a missing user agent on either side as an empty string, so two
 *  requests that both omit it still count as the same client. */
function sameClient(stored: string | null, incoming: string | null | undefined): boolean {
  return (stored ?? "") === (incoming ?? "");
}

export function isBenignRefreshRace(input: RefreshRaceInput): boolean {
  const { token, successor, requestUserAgent, graceMs } = input;
  const now = input.now ?? new Date();

  if (graceMs <= 0) return false;
  if (!token.revokedAt) return false;

  const age = now.getTime() - token.revokedAt.getTime();
  // A negative age means the clock moved backwards; refuse rather than treat
  // an unbounded future window as "just now".
  if (age < 0 || age > graceMs) return false;

  // Unknown successor (tokens rotated before this link existed) cannot be
  // shown to be one step behind, so it is not tolerated.
  if (!successor || successor.revokedAt !== null) return false;

  return sameClient(token.userAgent, requestUserAgent);
}
