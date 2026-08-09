/** E2E test config — spins up the full Nest app against a real Postgres (see CI / docker-compose). */
module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: "..",
  testRegex: "test/.*\\.e2e-spec\\.ts$",
  transform: {
    "^.+\\.(t|j)s$": "ts-jest",
  },
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  // One suite at a time: each bootstraps its own Nest app (two Prisma
  // clients each) against the SAME Postgres server. Parallel workers would
  // both multiply connections toward max_connections and risk cross-suite
  // interference on the control DB's shared School rows.
  maxWorkers: 1,
  // Three minutes, not one.
  //
  // Almost every suite provisions a school in `beforeAll` — create a
  // database, run 20-odd migrations, seed it — and that gets slower as a run
  // accumulates tenant databases on one Postgres. At 60s the default was a
  // trap: a suite was fine until the run grew, then blew its hook, and a
  // timed-out `beforeAll` never reaches `app.close()`, so its two Prisma
  // pools leak into every suite after it. One slow suite took several others
  // down with it, and each failed with no assertion failure at all.
  //
  // Suites worked around it by passing an explicit timeout to `beforeAll`,
  // which works right up until somebody writes a new suite and does not —
  // exactly what happened to provisioning.e2e-spec.ts. Making the default
  // generous means forgetting is no longer a way to break the run; the
  // per-hook values that remain are now belt and braces rather than the
  // only thing holding it up.
  testTimeout: 180000,
};
