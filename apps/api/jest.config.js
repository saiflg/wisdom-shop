/** Unit test config — co-located *.spec.ts files under src/. */
module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    // ts-jest picks up `isolatedModules` from tsconfig.json, which makes it
    // transpile instead of re-type-checking in every worker. That matters:
    // large dependency type graphs (the Stripe SDK especially) pushed this
    // suite past 400s before it was enabled.
    "^.+\\.(t|j)s$": "ts-jest",
  },
  collectCoverageFrom: ["**/*.(t|j)s"],
  coveragePathIgnorePatterns: ["\\.module\\.ts$", "main\\.ts$"],
  coverageDirectory: "../coverage",
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
};
