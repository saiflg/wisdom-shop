import type { SubscriptionStatus } from "ems-control-client";

/**
 * Decides what the billing cycle should act on, as a pure function of the
 * subscriptions and the clock. Kept separate from the scheduler so the
 * "who gets billed" rules are testable without a timer, a database or a
 * fake system clock.
 */

export interface CycleCandidate {
  id: string;
  schoolId: string;
  status: SubscriptionStatus;
  currentPeriodEnd: Date;
  trialEndsAt: Date | null;
  cancelAtPeriodEnd: boolean;
}

export interface CycleWork {
  /** Trials whose end has passed and which should become ACTIVE. */
  trialsToActivate: CycleCandidate[];
  /** Subscriptions whose period has ended and which should renew + be invoiced. */
  toRenew: CycleCandidate[];
  /** Subscriptions set to cancel at period end, whose period has now ended. */
  toCancel: CycleCandidate[];
}

/**
 * A subscription is due when its period has *ended* — `>=` not `>`, so a
 * period boundary landing exactly on the tick isn't skipped until the next
 * run.
 *
 * CANCELED is never billed. That is the rule that stops the scheduler
 * charging someone who already left, and it is asserted directly in the
 * tests rather than left implicit in a query filter.
 */
export function selectCycleWork(candidates: CycleCandidate[], now: Date): CycleWork {
  const trialsToActivate: CycleCandidate[] = [];
  const toRenew: CycleCandidate[] = [];
  const toCancel: CycleCandidate[] = [];

  for (const candidate of candidates) {
    if (candidate.status === "CANCELED") continue;

    if (candidate.status === "TRIALING") {
      // A trial only converts once its end has passed; until then it is
      // neither billed nor activated.
      if (candidate.trialEndsAt && candidate.trialEndsAt.getTime() <= now.getTime()) {
        trialsToActivate.push(candidate);
      }
      continue;
    }

    if (candidate.currentPeriodEnd.getTime() > now.getTime()) continue;

    // Period has ended. A pending cancellation takes effect here rather
    // than renewing and charging for another period.
    if (candidate.cancelAtPeriodEnd) {
      toCancel.push(candidate);
    } else {
      toRenew.push(candidate);
    }
  }

  return { trialsToActivate, toRenew, toCancel };
}
