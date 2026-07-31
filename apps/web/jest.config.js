const nextJest = require("next/jest");

// next/jest wires up the SWC transform, CSS/asset stubs and the tsconfig path
// aliases (`@/...`), so the config here stays to what is actually ours.
const createJestConfig = nextJest({ dir: "./" });

/** @type {import('jest').Config} */
const config = {
  testEnvironment: "jest-environment-jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testPathIgnorePatterns: ["/node_modules/", "/.next/"],
  // Stated explicitly rather than left to next/jest's tsconfig inference:
  // without it, `jest.mock("@/lib/api")` failed to resolve from tests under
  // app/ even though plain imports of the same alias worked.
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  // Same reasoning as the API's e2e config. Component tests that drive
  // `userEvent` are slow, and running several suites in parallel on this
  // machine pushed individual clicks past the default 5s timeout — suites
  // that pass comfortably on their own failed only when run together. A red
  // test that depends on how many other tests are running teaches nothing.
  maxWorkers: 1,
  testTimeout: 30000,
};

module.exports = createJestConfig(config);
