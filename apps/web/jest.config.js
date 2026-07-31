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
};

module.exports = createJestConfig(config);
