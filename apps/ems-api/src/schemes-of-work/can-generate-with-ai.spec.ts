import { canGenerateWithAi } from "./can-generate-with-ai";

describe("canGenerateWithAi", () => {
  it("is false for MANUAL", () => {
    expect(canGenerateWithAi("MANUAL")).toBe(false);
  });

  it("is true for AI_AUTOMATIC", () => {
    expect(canGenerateWithAi("AI_AUTOMATIC")).toBe(true);
  });

  it("is true for HYBRID", () => {
    expect(canGenerateWithAi("HYBRID")).toBe(true);
  });
});
