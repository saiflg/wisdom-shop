/**
 * How much tutoring one student may consume.
 *
 * These exist because the API key belongs to the platform operator and every
 * turn is billed to them. Without a ceiling, one student leaning on the send
 * button is an unbounded bill, and the first sign of it is the invoice.
 *
 * The numbers are deliberately generous for real study and hostile to abuse:
 * a genuine session is a dozen or two exchanges, not two hundred.
 */
export const MAX_TURNS_PER_SESSION = 40;
export const MAX_TURNS_PER_STUDENT_PER_DAY = 120;

/** Length ceiling on one question, so a pasted textbook cannot become one request. */
export const MAX_QUESTION_LENGTH = 1000;

export type TurnDecision = { allowed: true } | { allowed: false; reason: string };

export interface TurnUsage {
  /**
   * Billable turns already in this session.
   *
   * Counted as tutor replies rather than student questions, because an
   * automatic class advances a lesson without anyone typing a question and
   * that costs exactly the same as one.
   */
  turnsInSession: number;
  /** Billable turns by this student across all their sessions since midnight. */
  turnsToday: number;
}

/**
 * Whether one more provider call may be made.
 *
 * Checked before the provider is called, not after: a refusal that still cost
 * money defeats the point of having a limit.
 *
 * A PAUSED session is allowed through — resuming is the expected way back in,
 * and refusing it would make pausing a trap.
 */
export function checkTurnAllowed(
  usage: TurnUsage,
  sessionStatus: "ACTIVE" | "PAUSED" | "ENDED",
): TurnDecision {
  if (sessionStatus === "ENDED") {
    return { allowed: false, reason: "This session has ended. Start a new one to keep learning." };
  }

  if (usage.turnsInSession >= MAX_TURNS_PER_SESSION) {
    return {
      allowed: false,
      reason: `This session has reached its ${MAX_TURNS_PER_SESSION}-question limit. Start a new session to carry on.`,
    };
  }

  if (usage.turnsToday >= MAX_TURNS_PER_STUDENT_PER_DAY) {
    return {
      allowed: false,
      reason: `You have reached today's limit of ${MAX_TURNS_PER_STUDENT_PER_DAY} questions. It resets tomorrow.`,
    };
  }

  return { allowed: true };
}

/** Midnight local to the server, which is what "today" means to a school. */
export function startOfDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
