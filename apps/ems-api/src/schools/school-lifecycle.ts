import type { SchoolStatus } from "ems-control-client";

/**
 * Which tenant lifecycle transitions a platform admin may perform.
 *
 * Deliberately narrow. PROVISIONING and FAILED are owned by the
 * provisioning pipeline, not by an operator clicking buttons: a school
 * mid-provision has a half-built database, and "reactivating" a FAILED
 * school would mark it ACTIVE without the database that failing left
 * missing. Those two are recovered through retry-provisioning, which
 * re-runs the idempotent steps, never by editing status directly.
 */
export const ALLOWED_TRANSITIONS: Readonly<Record<SchoolStatus, readonly SchoolStatus[]>> = {
  ACTIVE: ["SUSPENDED"],
  SUSPENDED: ["ACTIVE"],
  PROVISIONING: [],
  FAILED: [],
};

export function canTransition(from: SchoolStatus, to: SchoolStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Operator-facing reason a transition was refused, or null when it's allowed. */
export function explainRefusal(from: SchoolStatus, to: SchoolStatus): string | null {
  if (canTransition(from, to)) return null;
  if (from === to) return `This school is already ${from.toLowerCase()}`;
  if (from === "PROVISIONING") {
    return "This school is still being provisioned — wait for it to finish, or use retry provisioning";
  }
  if (from === "FAILED") {
    return "This school's provisioning failed — use retry provisioning rather than changing its status";
  }
  return `A school cannot go from ${from.toLowerCase()} to ${to.toLowerCase()}`;
}
