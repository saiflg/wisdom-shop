import type { SubscriptionStatus } from "ems-control-client";
import { selectCycleWork, type CycleCandidate } from "./billing-cycle";

const NOW = new Date("2026-08-03T12:00:00.000Z");
const PAST = new Date("2026-08-01T12:00:00.000Z");
const FUTURE = new Date("2026-09-01T12:00:00.000Z");

function candidate(overrides: Partial<CycleCandidate> = {}): CycleCandidate {
  return {
    id: "sub_1",
    schoolId: "school_1",
    status: "ACTIVE",
    currentPeriodEnd: PAST,
    trialEndsAt: null,
    cancelAtPeriodEnd: false,
    ...overrides,
  };
}

describe("selectCycleWork", () => {
  it("renews an active subscription whose period has ended", () => {
    const work = selectCycleWork([candidate()], NOW);
    expect(work.toRenew).toHaveLength(1);
    expect(work.toCancel).toHaveLength(0);
    expect(work.trialsToActivate).toHaveLength(0);
  });

  it("leaves a subscription alone until its period actually ends", () => {
    const work = selectCycleWork([candidate({ currentPeriodEnd: FUTURE })], NOW);
    expect(work.toRenew).toHaveLength(0);
  });

  it("treats a period ending exactly now as due", () => {
    // `>=` not `>`: a boundary landing on the tick must not be skipped
    // until the next run, which would delay a customer's invoice.
    const work = selectCycleWork([candidate({ currentPeriodEnd: NOW })], NOW);
    expect(work.toRenew).toHaveLength(1);
  });

  it("never bills a cancelled subscription, however overdue it looks", () => {
    const work = selectCycleWork(
      [candidate({ status: "CANCELED", currentPeriodEnd: new Date("2020-01-01T00:00:00.000Z") })],
      NOW,
    );
    expect(work.toRenew).toHaveLength(0);
    expect(work.toCancel).toHaveLength(0);
    expect(work.trialsToActivate).toHaveLength(0);
  });

  it("renews a past-due subscription rather than ignoring it", () => {
    // PAST_DUE means unpaid, not inactive — the next period is still owed.
    const work = selectCycleWork([candidate({ status: "PAST_DUE" })], NOW);
    expect(work.toRenew).toHaveLength(1);
  });

  it("cancels instead of renewing when cancellation was scheduled", () => {
    const work = selectCycleWork([candidate({ cancelAtPeriodEnd: true })], NOW);
    expect(work.toCancel).toHaveLength(1);
    expect(work.toRenew).toHaveLength(0);
  });

  describe("trials", () => {
    it("activates a trial whose end has passed", () => {
      const work = selectCycleWork([candidate({ status: "TRIALING", trialEndsAt: PAST })], NOW);
      expect(work.trialsToActivate).toHaveLength(1);
      expect(work.toRenew).toHaveLength(0);
    });

    it("leaves a running trial alone", () => {
      const work = selectCycleWork([candidate({ status: "TRIALING", trialEndsAt: FUTURE })], NOW);
      expect(work.trialsToActivate).toHaveLength(0);
      expect(work.toRenew).toHaveLength(0);
    });

    it("never bills a trial, even if its period end looks overdue", () => {
      // A trialing subscription with a stale period must not be invoiced —
      // that would charge someone still inside their free window.
      const work = selectCycleWork(
        [candidate({ status: "TRIALING", trialEndsAt: FUTURE, currentPeriodEnd: PAST })],
        NOW,
      );
      expect(work.toRenew).toHaveLength(0);
      expect(work.trialsToActivate).toHaveLength(0);
    });

    it("ignores a trialing subscription with no trial end recorded", () => {
      const work = selectCycleWork([candidate({ status: "TRIALING", trialEndsAt: null })], NOW);
      expect(work.trialsToActivate).toHaveLength(0);
      expect(work.toRenew).toHaveLength(0);
    });
  });

  it("puts every subscription in at most one bucket", () => {
    const all: CycleCandidate[] = (["TRIALING", "ACTIVE", "PAST_DUE", "CANCELED"] as SubscriptionStatus[]).map(
      (status, index) =>
        candidate({ id: `sub_${index}`, status, trialEndsAt: status === "TRIALING" ? PAST : null }),
    );
    const work = selectCycleWork(all, NOW);
    const ids = [...work.trialsToActivate, ...work.toRenew, ...work.toCancel].map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("handles an empty input without inventing work", () => {
    expect(selectCycleWork([], NOW)).toEqual({ trialsToActivate: [], toRenew: [], toCancel: [] });
  });
});
