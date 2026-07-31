/** E2E test config — spins up the full Nest app against a real Postgres (see CI / docker-compose). */
module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: "..",
  testRegex: "test/.*\\.e2e-spec\\.ts$",
  transform: {
    // See jest.config.js — `isolatedModules` in tsconfig.json makes ts-jest
    // transpile rather than re-type-check. Without it, bootstrapping
    // AppModule (which pulls in the Stripe SDK's very large type
    // definitions) pushed beforeAll past a 60s hook timeout.
    "^.+\\.(t|j)s$": "ts-jest",
  },
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  // Run suites one at a time. Every suite bootstraps its own Nest app and
  // talks to the SAME Postgres, so parallel workers both (a) multiply
  // memory/CPU until bootstrap exceeds the hook timeout and (b) risk
  // cross-suite interference on shared tables.
  maxWorkers: 1,
  // Bootstrapping the full Nest app + connecting to a real Postgres in
  // beforeAll is slow, and slower still on a loaded machine.
  testTimeout: 60000,
};
