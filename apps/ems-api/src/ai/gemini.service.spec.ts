import type { ConfigService } from "@nestjs/config";
import { ServiceUnavailableException } from "@nestjs/common";
import { GeminiService } from "./gemini.service";

function fakeConfig(values: Record<string, unknown>): ConfigService<Record<string, unknown>, true> {
  return { get: (key: string) => values[key] } as unknown as ConfigService<Record<string, unknown>, true>;
}

describe("GeminiService", () => {
  it("reports unconfigured when GEMINI_API_KEY isn't set", () => {
    const service = new GeminiService(fakeConfig({ GEMINI_API_KEY: undefined, GEMINI_MODEL: "gemini-2.5-flash" }));
    expect(service.isConfigured).toBe(false);
  });

  it("throws without making any network call when unconfigured", async () => {
    const service = new GeminiService(fakeConfig({ GEMINI_API_KEY: undefined, GEMINI_MODEL: "gemini-2.5-flash" }));
    await expect(service.generateJson("prompt", { type: "object" })).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it("reports configured once a key is present", () => {
    const service = new GeminiService(fakeConfig({ GEMINI_API_KEY: "test-key", GEMINI_MODEL: "gemini-2.5-flash" }));
    expect(service.isConfigured).toBe(true);
  });
});
