const nextJest = require("next/jest");

const createJestConfig = nextJest({ dir: "./" });

/** @type {import('jest').Config} */
const config = {
  testEnvironment: "jest-environment-jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testPathIgnorePatterns: ["/node_modules/", "/.next/"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  // Twenty seconds, not Jest's five.
  //
  // The form tests drive `userEvent`, which types a character at a time
  // through the real event pipeline; the slowest already takes over three
  // seconds on its own. Run alone they passed, run with the rest of the
  // suite they crossed five and failed — with a timeout, not an assertion,
  // which reads like the form is broken when nothing about it changed.
  //
  // Same trap the e2e config had at 60s: a default that is fine until the
  // suite grows, and then fails somewhere unrelated to the change that
  // pushed it over.
  testTimeout: 20000,
};

module.exports = createJestConfig(config);
