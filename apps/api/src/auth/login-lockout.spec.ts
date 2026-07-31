import {
  MAX_FAILED_ATTEMPTS,
  clearedState,
  isLockedOut,
  lockRemainingSeconds,
  registerFailure,
} from "./login-lockout";

const at = (iso: string) => new Date(iso);
const T0 = at("2026-01-01T00:00:00.000Z");

describe("login lockout policy", () => {
  it("does not lock before the threshold", () => {
    let state = { failedLoginAttempts: 0, lockedUntil: null as Date | null };
    for (let i = 1; i < MAX_FAILED_ATTEMPTS; i += 1) {
      state = registerFailure(state, T0);
      expect(isLockedOut(state, T0)).toBe(false);
    }
    expect(state.failedLoginAttempts).toBe(MAX_FAILED_ATTEMPTS - 1);
  });

  it("locks exactly on the threshold attempt", () => {
    let state = { failedLoginAttempts: 0, lockedUntil: null as Date | null };
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i += 1) {
      state = registerFailure(state, T0);
    }
    expect(isLockedOut(state, T0)).toBe(true);
    expect(lockRemainingSeconds(state, T0)).toBe(60);
  });

  it("lengthens the lock for repeat offenders", () => {
    let state = { failedLoginAttempts: 0, lockedUntil: null as Date | null };
    const lockLengths: number[] = [];

    // Four full rounds of failures, reading the lock length after each.
    for (let round = 0; round < 4; round += 1) {
      for (let i = 0; i < MAX_FAILED_ATTEMPTS; i += 1) {
        state = registerFailure(state, T0);
      }
      lockLengths.push(lockRemainingSeconds(state, T0));
    }

    expect(lockLengths).toEqual([60, 300, 900, 3600]);
  });

  it("caps the ladder rather than growing without bound", () => {
    let state = { failedLoginAttempts: 0, lockedUntil: null as Date | null };
    for (let i = 0; i < MAX_FAILED_ATTEMPTS * 20; i += 1) {
      state = registerFailure(state, T0);
    }
    // Still the longest rung, not 20 hours.
    expect(lockRemainingSeconds(state, T0)).toBe(3600);
  });

  it("expires the lock once the window passes", () => {
    let state = { failedLoginAttempts: 0, lockedUntil: null as Date | null };
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i += 1) {
      state = registerFailure(state, T0);
    }

    expect(isLockedOut(state, at("2026-01-01T00:00:59.000Z"))).toBe(true);
    expect(isLockedOut(state, at("2026-01-01T00:01:01.000Z"))).toBe(false);
    expect(lockRemainingSeconds(state, at("2026-01-01T00:01:01.000Z"))).toBe(0);
  });

  it("treats a success as wiping the slate", () => {
    let state = { failedLoginAttempts: 0, lockedUntil: null as Date | null };
    for (let i = 0; i < MAX_FAILED_ATTEMPTS - 1; i += 1) {
      state = registerFailure(state, T0);
    }

    const cleared = clearedState();
    expect(cleared.failedLoginAttempts).toBe(0);
    expect(cleared.lockedUntil).toBeNull();
    expect(isLockedOut(cleared, T0)).toBe(false);

    // And one more failure after clearing starts from one, not from four —
    // otherwise a user who mistypes occasionally over months would eventually
    // lock themselves out of an account they know the password to.
    const afterClear = registerFailure(cleared, T0);
    expect(afterClear.failedLoginAttempts).toBe(1);
    expect(isLockedOut(afterClear, T0)).toBe(false);
  });

  it("never reports negative time remaining", () => {
    const state = { failedLoginAttempts: 5, lockedUntil: at("2026-01-01T00:00:00.000Z") };
    expect(lockRemainingSeconds(state, at("2026-06-01T00:00:00.000Z"))).toBe(0);
  });

  it("treats an account with no lock as unlocked", () => {
    expect(isLockedOut({ failedLoginAttempts: 0, lockedUntil: null }, T0)).toBe(false);
    expect(lockRemainingSeconds({ failedLoginAttempts: 0, lockedUntil: null }, T0)).toBe(0);
  });

  it("treats a missing lock field as unlocked rather than locked", () => {
    // A partial `select` or a stub can omit the column. Reading that as
    // "locked" would lock users out of accounts they hold the password to,
    // so absence has to fail open here — the failure count still applies.
    const partial = {} as { failedLoginAttempts: number; lockedUntil: Date | null };
    expect(isLockedOut(partial, T0)).toBe(false);
    expect(lockRemainingSeconds(partial, T0)).toBe(0);
    expect(registerFailure(partial, T0).failedLoginAttempts).toBe(1);
  });
});
