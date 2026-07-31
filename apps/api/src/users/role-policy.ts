import type { RoleName } from "@prisma/client";

/**
 * Roles that confer administrative power. Granting or revoking any of these
 * is restricted to SUPER_ADMIN — otherwise an ADMIN could promote themselves
 * or a confederate to SUPER_ADMIN, which is privilege escalation dressed up
 * as an ordinary feature.
 */
export const PRIVILEGED_ROLES: RoleName[] = ["ADMIN", "SUPER_ADMIN", "DEVELOPER"];

/**
 * Roles whose membership is derived from other state and must not be set by
 * hand.
 *
 * VENDOR is granted and revoked by vendor approval/suspension (Phase 8), in
 * the same transaction as the status change. Allowing a manual grant here
 * would let role membership drift away from `Vendor.status` — the exact
 * invariant that design was built to hold.
 */
export const DERIVED_ROLES: RoleName[] = ["VENDOR"];

export type RoleChangeRefusal =
  | { allowed: true }
  | { allowed: false; reason: string };

export function canManageRole(actorRoles: RoleName[], target: RoleName): RoleChangeRefusal {
  if (DERIVED_ROLES.includes(target)) {
    return {
      allowed: false,
      reason: `${target} membership follows vendor approval and cannot be assigned directly`,
    };
  }

  if (PRIVILEGED_ROLES.includes(target) && !actorRoles.includes("SUPER_ADMIN")) {
    return { allowed: false, reason: `Only a super admin can manage the ${target} role` };
  }

  return { allowed: true };
}

/**
 * Prevents an actor removing their own last privileged role, which would lock
 * them (and possibly the whole deployment) out of administration.
 */
export function wouldSelfLockOut(
  actorUserId: string,
  targetUserId: string,
  targetRole: RoleName,
  targetUserRoles: RoleName[],
): boolean {
  if (actorUserId !== targetUserId) return false;
  if (!PRIVILEGED_ROLES.includes(targetRole)) return false;

  const remaining = targetUserRoles.filter(
    (role) => role !== targetRole && PRIVILEGED_ROLES.includes(role),
  );
  return remaining.length === 0;
}
