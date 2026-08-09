import { MIGRATE_TIMEOUT_MS, describeFailure } from "./migration-runner";

/**
 * The recorded message is the only trace left of a failed onboarding: the
 * process is gone, the e2e fixtures purge their attempts on teardown, and in
 * production nobody is watching the log at the moment a school is created.
 *
 * It used to say only "Command failed", which sent an investigation down a
 * resource-exhaustion path for the better part of an hour when the answer was
 * a timeout this file had set itself.
 */

/** The shape `execFile` throws: a message, plus the output nobody was reading. */
function execFileError(overrides: Record<string, unknown> = {}): Error {
  return Object.assign(
    new Error("Command failed: /workspace/node_modules/.bin/prisma migrate deploy"),
    overrides,
  );
}

describe("describeFailure", () => {
  it("names a timeout first, because it changes what to do next", () => {
    // A timeout means raise the limit or find what is slow — not read
    // Prisma's output, because there isn't any.
    const message = describeFailure(execFileError({ killed: true, signal: "SIGTERM" }));
    expect(message).toMatch(/timed out/i);
    expect(message).toContain("300s");
  });

  it("treats SIGTERM as a timeout even when killed is not set", () => {
    expect(describeFailure(execFileError({ signal: "SIGTERM" }))).toMatch(/timed out/i);
  });

  it("keeps the original message as well as the explanation", () => {
    expect(describeFailure(execFileError({ killed: true }))).toContain("prisma migrate deploy");
  });

  it("includes stderr, which the old version threw away", () => {
    const message = describeFailure(
      execFileError({ stderr: "P3009 migrate found failed migrations" }),
    );
    expect(message).toContain("P3009");
  });

  it("includes stdout too, since Prisma reports migration errors there as often", () => {
    expect(describeFailure(execFileError({ stdout: "Error: relation already exists" }))).toContain(
      "relation already exists",
    );
  });

  it("says nothing about a timeout for an ordinary failure", () => {
    // Calling every failure a timeout would be its own kind of misdirection.
    expect(describeFailure(execFileError({ stderr: "boom" }))).not.toMatch(/timed out/i);
  });

  it("ignores empty output rather than printing bare labels", () => {
    const message = describeFailure(execFileError({ stderr: "   ", stdout: "" }));
    expect(message).not.toContain("stderr:");
    expect(message).not.toContain("stdout:");
  });

  it("survives something that is not an Error at all", () => {
    expect(describeFailure("just a string")).toBe("just a string");
    expect(describeFailure(undefined)).toBe("undefined");
  });
});

describe("the timeout itself", () => {
  it("is far longer than a healthy run needs", () => {
    // Was 60s, which was ample at eight migrations and not at twenty-odd on
    // a server also serving every other school. This is a guard against a
    // stuck process, not a performance budget.
    expect(MIGRATE_TIMEOUT_MS).toBeGreaterThanOrEqual(180_000);
  });
});
