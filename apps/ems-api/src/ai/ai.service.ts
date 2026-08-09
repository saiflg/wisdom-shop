import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import type { AiProvider } from "ems-control-client";
import { ControlPrismaService } from "@/control-db/control-prisma.service";
import { TenantSecretsService } from "@/common/crypto/tenant-secrets.service";
import {
  buildRequest,
  explainEmptyResponse,
  explainProviderError,
  extractJson,
  extractText,
  findProvider,
  wasTruncated,
} from "./providers";

/** Long enough for a scheme of work, short enough that a hung provider is not a hung request. */
const REQUEST_TIMEOUT_MS = 60_000;

export interface AiSettingsView {
  provider: AiProvider;
  model: string;
  baseUrl: string | null;
  enabled: boolean;
  /** Whether a key is on file — never the key itself. */
  hasApiKey: boolean;
  apiKeyMasked: string | null;
  lastTestedAt: Date | null;
  lastTestOk: boolean | null;
  lastTestError: string | null;
}

/**
 * Talks to whichever AI provider the platform operator configured.
 *
 * Replaces the old GEMINI_API_KEY environment variable, which pinned the
 * product to one vendor and required a container restart to change anything.
 * Settings now live in the control database, so a Super Admin can switch
 * provider or rotate a key from the console and the next request uses it.
 *
 * `generateJson` keeps the signature the curriculum, lesson-plan and quiz
 * services already call, so swapping the provider changed nothing for them.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly controlPrisma: ControlPrismaService,
    private readonly secrets: TenantSecretsService,
  ) {}

  async getSettings() {
    const existing = await this.controlPrisma.aiProviderSettings.findUnique({ where: { id: 1 } });
    return existing ?? this.controlPrisma.aiProviderSettings.create({ data: { id: 1 } });
  }

  /** What the console may see: everything except the key. */
  async getSettingsView(): Promise<AiSettingsView> {
    const settings = await this.getSettings();
    const profile = findProvider(settings.provider);
    const apiKey = this.secrets.tryDecrypt(settings.apiKeyEncrypted);

    return {
      provider: settings.provider,
      model: settings.model || profile.defaultModel,
      baseUrl: settings.baseUrl,
      enabled: settings.enabled,
      hasApiKey: Boolean(apiKey),
      // Fixed-width, like the staff bank details: the length of a key hints
      // at which provider issued it.
      apiKeyMasked: apiKey ? `••••${apiKey.slice(-4)}` : null,
      lastTestedAt: settings.lastTestedAt,
      lastTestOk: settings.lastTestOk,
      lastTestError: settings.lastTestError,
    };
  }

  async updateSettings(input: {
    provider: AiProvider;
    model?: string;
    baseUrl?: string;
    apiKey?: string;
    enabled?: boolean;
  }) {
    // Omitting the key leaves the stored one alone; an empty string clears
    // it. Without that distinction, changing the model would wipe the key.
    const apiKeyEncrypted =
      input.apiKey === undefined
        ? undefined
        : input.apiKey.trim() === ""
          ? null
          : this.secrets.encrypt(input.apiKey.trim());

    await this.getSettings();
    await this.controlPrisma.aiProviderSettings.update({
      where: { id: 1 },
      data: {
        provider: input.provider,
        model: input.model?.trim() || null,
        baseUrl: input.baseUrl?.trim() || null,
        ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
        ...(apiKeyEncrypted === undefined ? {} : { apiKeyEncrypted }),
        // A settings change invalidates the previous test result — showing a
        // green tick against a key that has since been replaced would be
        // worse than showing nothing.
        ...(apiKeyEncrypted === undefined && input.model === undefined
          ? {}
          : { lastTestedAt: null, lastTestOk: null, lastTestError: null }),
      },
    });

    return this.getSettingsView();
  }

  get isConfiguredHint(): string {
    return "Set an AI provider and key in the Super Admin console to enable this.";
  }

  async isConfigured(): Promise<boolean> {
    const settings = await this.getSettings();
    return settings.enabled && Boolean(this.secrets.tryDecrypt(settings.apiKeyEncrypted));
  }

  /**
   * Asks the configured provider for JSON.
   *
   * `responseSchema` is accepted for call-site compatibility and folded into
   * the prompt rather than sent as a provider flag: only some providers and
   * some models support structured output, and describing the shape in words
   * works everywhere.
   */
  async generateJson<T>(prompt: string, responseSchema?: Record<string, unknown>): Promise<T> {
    const shaped = responseSchema
      ? `${prompt}\n\nReply with JSON only — no prose, no markdown fences — matching this shape:\n${JSON.stringify(
          responseSchema,
        )}`
      : `${prompt}\n\nReply with JSON only — no prose, no markdown fences.`;

    const { text, profile } = await this.complete(shaped);
    const parsed = extractJson<T>(text);

    if (parsed === null) {
      // The model answered, but not with JSON. Said plainly, because it is a
      // different problem from a bad key and needs a different fix — usually
      // a different model.
      throw new ServiceUnavailableException(
        `${profile.label} replied but not with usable JSON. Try a different model.`,
      );
    }

    return parsed;
  }

  /**
   * Asks the configured provider for prose.
   *
   * Separate from `generateJson` rather than a flag on it, because the
   * "reply with JSON only" instruction has to be absent, not merely ignored:
   * a tutoring reply that arrives wrapped in a JSON object is a bug the
   * student sees.
   */
  async generateText(prompt: string, maxTokens?: number): Promise<string> {
    const { text } = await this.complete(prompt, maxTokens);
    return text.trim();
  }

  /** Resolves settings, builds the request, calls the provider. Shared by both public generators. */
  private async complete(prompt: string, maxTokens?: number) {
    const settings = await this.getSettings();
    const apiKey = this.secrets.tryDecrypt(settings.apiKeyEncrypted);

    if (!settings.enabled || !apiKey) {
      throw new ServiceUnavailableException(`AI generation isn't configured yet. ${this.isConfiguredHint}`);
    }

    const profile = findProvider(settings.provider);
    const model = settings.model || profile.defaultModel;
    if (!model) {
      throw new ServiceUnavailableException("No AI model is set for that provider.");
    }

    const plan = buildRequest({
      provider: profile,
      apiKey,
      model,
      baseUrl: settings.baseUrl,
      prompt,
      maxTokens,
    });

    return { text: await this.call(plan, profile.shape), profile };
  }

  /**
   * Proves a key works, and records the outcome.
   *
   * Worth its own route: without it the first sign of a wrong key is a
   * teacher's generation failing mid-lesson-planning.
   */
  async testConnection(): Promise<{ ok: boolean; message: string; model: string }> {
    const settings = await this.getSettings();
    const apiKey = this.secrets.tryDecrypt(settings.apiKeyEncrypted);
    const profile = findProvider(settings.provider);
    const model = settings.model || profile.defaultModel;

    const record = async (ok: boolean, message: string) => {
      await this.controlPrisma.aiProviderSettings.update({
        where: { id: 1 },
        data: { lastTestedAt: new Date(), lastTestOk: ok, lastTestError: ok ? null : message },
      });
      return { ok, message, model };
    };

    if (!apiKey) return record(false, "No API key has been saved yet");
    if (!model) return record(false, "No model is set for this provider");
    if (profile.needsBaseUrl && !settings.baseUrl?.trim()) {
      return record(false, "This provider needs a base URL");
    }

    try {
      const plan = buildRequest({
        provider: profile,
        apiKey,
        model,
        baseUrl: settings.baseUrl,
        prompt: 'Reply with exactly this JSON and nothing else: {"ok":true}',
        // The answer needs about a dozen tokens. The rest is headroom for a
        // reasoning model, which bills its thinking to this same budget and
        // will otherwise hit the cap mid-thought and return nothing — a
        // connection test that fails on exactly the models people pick. Only
        // tokens actually produced are charged, so the headroom is free.
        maxTokens: 4096,
      });
      const text = await this.call(plan, profile.shape);
      const parsed = extractJson<{ ok?: boolean }>(text);

      if (!parsed) return record(false, `${profile.label} replied but not with JSON: ${text.slice(0, 120)}`);
      return record(true, `${profile.label} answered using ${model}`);
    } catch (error) {
      return record(false, error instanceof Error ? error.message : String(error));
    }
  }

  private async call(
    plan: { url: string; headers: Record<string, string>; body: unknown },
    shape: "openai" | "anthropic" | "gemini",
  ): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(plan.url, {
        method: "POST",
        headers: plan.headers,
        body: JSON.stringify(plan.body),
        signal: controller.signal,
      });
    } catch (error) {
      // A network failure and a refused key are different problems, and the
      // message should not blur them.
      const reason = (error as Error)?.name === "AbortError" ? "timed out" : "could not be reached";
      throw new ServiceUnavailableException(`The AI provider ${reason}.`);
    } finally {
      clearTimeout(timer);
    }

    const payload = await response.json().catch(() => undefined);

    if (!response.ok) {
      const explained = explainProviderError(response.status, payload);
      // Logged without the key, which never appears in the plan body.
      this.logger.warn(`AI provider error ${response.status}: ${explained}`);
      throw new ServiceUnavailableException(explained);
    }

    const text = extractText(shape, payload);
    if (!text) {
      const explained = explainEmptyResponse(shape, payload);
      this.logger.warn(`AI provider returned no text: ${explained}`);
      throw new ServiceUnavailableException(explained);
    }

    // Checked *after* extracting text, and fatal even though there is some.
    // A cut-off answer is not a usable one: `{"ok":` would otherwise travel
    // on and surface as "replied but not with usable JSON", which sends
    // somebody off to change models when the budget was the problem.
    if (wasTruncated(shape, payload)) {
      const explained = explainEmptyResponse(shape, payload);
      this.logger.warn(`AI provider truncated its answer: ${explained}`);
      throw new ServiceUnavailableException(explained);
    }

    return text;
  }
}
