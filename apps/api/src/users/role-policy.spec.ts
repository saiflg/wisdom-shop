import { canManageRole, wouldSelfLockOut } from "./role-policy";

describe("role management policy", () => {
  describe("privilege escalation", () => {
    it("refuses an ADMIN granting ADMIN or SUPER_ADMIN", () => {
      // The case this exists for: an admin promoting themselves or a
      // confederate to the top of the tree.
      expect(canManageRole(["ADMIN"], "SUPER_ADMIN").allowed).toBe(false);
      expect(canManageRole(["ADMIN"], "ADMIN").allowed).toBe(false);
      expect(canManageRole(["ADMIN"], "DEVELOPER").allowed).toBe(false);
    });

    it("allows a SUPER_ADMIN to manage privileged roles", () => {
      expect(canManageRole(["SUPER_ADMIN"], "ADMIN").allowed).toBe(true);
      expect(canManageRole(["SUPER_ADMIN"], "SUPER_ADMIN").allowed).toBe(true);
      expect(canManageRole(["SUPER_ADMIN"], "DEVELOPER").allowed).toBe(true);
    });

    it("lets an ADMIN manage ordinary roles", () => {
      expect(canManageRole(["ADMIN"], "SUPPORT").allowed).toBe(true);
      expect(canManageRole(["ADMIN"], "EDITOR").allowed).toBe(true);
      expect(canManageRole(["ADMIN"], "MANAGER").allowed).toBe(true);
    });
  });

  describe("derived roles", () => {
    it("refuses direct assignment of VENDOR even for a super admin", () => {
      // VENDOR membership is set by vendor approval in the same transaction
      // as the status change; assigning it here would let the two diverge.
      const decision = canManageRole(["SUPER_ADMIN"], "VENDOR");
      expect(decision.allowed).toBe(false);
      if (!decision.allowed) expect(decision.reason).toMatch(/vendor approval/i);
    });
  });

  describe("self-lockout", () => {
    it("refuses removing your own last administrative role", () => {
      expect(wouldSelfLockOut("u1", "u1", "SUPER_ADMIN", ["SUPER_ADMIN", "CUSTOMER"])).toBe(true);
    });

    it("allows it when another privileged role remains", () => {
      expect(wouldSelfLockOut("u1", "u1", "SUPER_ADMIN", ["SUPER_ADMIN", "ADMIN"])).toBe(false);
    });

    it("does not restrict revoking someone else's role", () => {
      expect(wouldSelfLockOut("u1", "u2", "SUPER_ADMIN", ["SUPER_ADMIN"])).toBe(false);
    });

    it("does not restrict revoking your own non-privileged role", () => {
      expect(wouldSelfLockOut("u1", "u1", "SUPPORT", ["SUPPORT", "CUSTOMER"])).toBe(false);
    });
  });
});
