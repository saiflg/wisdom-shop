import type { SchoolStatus } from "ems-control-client";
import { ALLOWED_TRANSITIONS, canTransition, explainRefusal } from "./school-lifecycle";

const ALL_STATUSES: SchoolStatus[] = ["PROVISIONING", "ACTIVE", "SUSPENDED", "FAILED"];

describe("school lifecycle transitions", () => {
  it("allows exactly suspend and reactivate, and nothing else", () => {
    const allowed = ALL_STATUSES.flatMap((from) =>
      ALL_STATUSES.filter((to) => canTransition(from, to)).map((to) => `${from}->${to}`),
    );
    expect(allowed.sort()).toEqual(["ACTIVE->SUSPENDED", "SUSPENDED->ACTIVE"]);
  });

  it("never allows a transition to the same status", () => {
    for (const status of ALL_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it("refuses to hand-edit a school out of PROVISIONING or FAILED", () => {
    // Those states mean the database is half-built or missing; retry
    // provisioning re-runs the idempotent steps instead.
    for (const from of ["PROVISIONING", "FAILED"] as SchoolStatus[]) {
      for (const to of ALL_STATUSES) {
        expect(canTransition(from, to)).toBe(false);
      }
    }
  });

  it("covers every status in the transition table", () => {
    // Guards against a new SchoolStatus being added to the enum without a
    // decision being made about what it may transition to.
    expect(Object.keys(ALLOWED_TRANSITIONS).sort()).toEqual([...ALL_STATUSES].sort());
  });

  describe("explainRefusal", () => {
    it("returns null when the transition is allowed", () => {
      expect(explainRefusal("ACTIVE", "SUSPENDED")).toBeNull();
      expect(explainRefusal("SUSPENDED", "ACTIVE")).toBeNull();
    });

    it("says so when the school is already in the target state", () => {
      expect(explainRefusal("ACTIVE", "ACTIVE")).toBe("This school is already active");
      expect(explainRefusal("SUSPENDED", "SUSPENDED")).toBe("This school is already suspended");
    });

    it("points at retry provisioning for PROVISIONING and FAILED", () => {
      expect(explainRefusal("PROVISIONING", "ACTIVE")).toContain("retry provisioning");
      expect(explainRefusal("FAILED", "ACTIVE")).toContain("retry provisioning");
    });

    it("always explains a refusal rather than returning an empty message", () => {
      for (const from of ALL_STATUSES) {
        for (const to of ALL_STATUSES) {
          const refusal = explainRefusal(from, to);
          if (!canTransition(from, to)) expect(refusal).toBeTruthy();
        }
      }
    });
  });
});
