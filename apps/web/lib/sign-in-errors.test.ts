import { ApiError } from "@/lib/api";
import { describeSignInError } from "@/lib/sign-in-errors";

const WRONG = "Incorrect email or password.";

describe("describeSignInError", () => {
  it("reports bad credentials for a 401", () => {
    expect(describeSignInError(new ApiError(401, "Invalid email or password"), WRONG)).toBe(WRONG);
  });

  it("passes the server's lockout message through, wait included", () => {
    // The remaining time is the actionable part. Paraphrasing it away would
    // leave the user with nothing to do but retry, which is what tripped the
    // lock in the first place.
    const message = "Too many failed sign-in attempts. Try again in 60 seconds.";
    expect(describeSignInError(new ApiError(403, message), WRONG)).toBe(message);
  });

  it("still explains a 403 that arrives without a message", () => {
    const result = describeSignInError(new ApiError(403, ""), WRONG);
    expect(result).toMatch(/too many failed sign-in attempts/i);
    expect(result).not.toBe("");
  });

  it("tells a throttled device to wait rather than blaming the password", () => {
    const result = describeSignInError(new ApiError(429, "ThrottlerException: Too Many Requests"), WRONG);
    expect(result).toMatch(/wait a moment/i);
    // The raw framework string must not reach the user.
    expect(result).not.toMatch(/ThrottlerException/);
    expect(result).not.toBe(WRONG);
  });

  it("does not blame the credentials for a server fault", () => {
    const result = describeSignInError(new ApiError(500, "Internal server error"), WRONG);
    expect(result).not.toBe(WRONG);
    expect(result).toMatch(/something went wrong/i);
  });

  it("handles a thrown non-ApiError, such as a dropped connection", () => {
    expect(describeSignInError(new TypeError("Failed to fetch"), WRONG)).toMatch(/something went wrong/i);
    expect(describeSignInError(undefined, WRONG)).toMatch(/something went wrong/i);
  });

  it("uses the caller's wording, so the 2FA step can differ from the password step", () => {
    const codeMessage = "That code isn't valid. Try again, or use a recovery code.";
    expect(describeSignInError(new ApiError(401, "Invalid two-factor code"), codeMessage)).toBe(codeMessage);
  });
});
