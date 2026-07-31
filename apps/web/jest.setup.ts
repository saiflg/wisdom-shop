import "@testing-library/jest-dom";

// jsdom has no fetch. Tests that care supply their own mock; anything that
// reaches the network without one should fail loudly rather than hang.
if (!globalThis.fetch) {
  globalThis.fetch = (() => {
    throw new Error("fetch was called without a mock — stub it in the test that needs it");
  }) as unknown as typeof fetch;
}
