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
  testTimeout: 60000,
};
