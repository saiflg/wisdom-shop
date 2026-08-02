import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GoogleGenAI } from "@google/genai";
import type { EnvConfig } from "@/config/env.validation";

/**
 * Wraps Google's Gemini API for structured JSON generation. A provider
 * stays disabled until its key is set — same posture as the shop's payment
 * providers — so every call site gets a clear 503 rather than the feature
 * silently not existing or the app failing to boot.
 *
 * `responseSchema` (Gemini's structured-output mechanism) is an OpenAPI 3.0
 * *subset*: no `$ref`, `oneOf`, or `patternProperties`, and object key
 * order in the response isn't guaranteed by JS object order — pin it with
 * `propertyOrdering` in the schema if field order matters to the caller.
 * Keep schemas shallow (2-3 levels); deep nesting degrades reliability.
 */
@Injectable()
export class GeminiService {
  private readonly client: GoogleGenAI | undefined;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {
    const apiKey = this.config.get("GEMINI_API_KEY", { infer: true });
    if (apiKey) {
      this.client = new GoogleGenAI({ apiKey });
    }
  }

  get isConfigured(): boolean {
    return this.client !== undefined;
  }

  async generateJson<T>(prompt: string, responseSchema: Record<string, unknown>): Promise<T> {
    if (!this.client) {
      throw new ServiceUnavailableException(
        "AI generation isn't configured yet — set GEMINI_API_KEY to enable it.",
      );
    }

    const response = await this.client.models.generateContent({
      model: this.config.get("GEMINI_MODEL", { infer: true }),
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema,
      },
    });

    const text = response.text;
    if (!text) {
      throw new ServiceUnavailableException("The AI provider returned an empty response.");
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ServiceUnavailableException(
        "The AI provider returned a response that couldn't be parsed as JSON.",
      );
    }
  }
}
