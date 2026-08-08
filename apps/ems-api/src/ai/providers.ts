import type { AiProvider } from "ems-control-client";

/**
 * Where a generation request goes, and what shape it takes.
 *
 * Four of the five providers speak the OpenAI chat-completions API, so this
 * is mostly a table of endpoints and headers rather than five integrations.
 * Gemini is the exception and gets its own request shape.
 *
 * `OPENAI_COMPATIBLE` is the escape hatch that stops this list from being a
 * maintenance treadmill: Groq, Together, DeepSeek, Fireworks, a local Ollama
 * — anything implementing the same endpoint works by setting a base URL, with
 * no code change and no release.
 */

export type ApiShape = "openai" | "anthropic" | "gemini";

export interface ProviderProfile {
  id: AiProvider;
  label: string;
  shape: ApiShape;
  /** Ignored for OPENAI_COMPATIBLE, which supplies its own. */
  baseUrl: string;
  defaultModel: string;
  /** Shown in the settings page so an operator knows where to get a key. */
  keyUrl?: string;
  /** True when the operator must supply the base URL themselves. */
  needsBaseUrl?: boolean;
}

export const PROVIDERS: ProviderProfile[] = [
  {
    id: "OPENROUTER",
    label: "OpenRouter",
    shape: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    // A free model by default, so a new operator can prove the wiring works
    // before deciding what to pay for.
    defaultModel: "google/gemini-2.0-flash-exp:free",
    keyUrl: "https://openrouter.ai/keys",
  },
  {
    id: "OPENAI",
    label: "OpenAI",
    shape: "openai",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    keyUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "ANTHROPIC",
    label: "Anthropic",
    shape: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-4-5",
    keyUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "GOOGLE_GEMINI",
    label: "Google Gemini",
    shape: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-2.5-flash",
    keyUrl: "https://aistudio.google.com/apikey",
  },
  {
    id: "OPENAI_COMPATIBLE",
    label: "Other (OpenAI-compatible)",
    shape: "openai",
    baseUrl: "",
    defaultModel: "",
    needsBaseUrl: true,
  },
];

export function findProvider(id: AiProvider): ProviderProfile {
  const provider = PROVIDERS.find((candidate) => candidate.id === id);
  if (!provider) throw new Error(`Unknown AI provider: ${id}`);
  return provider;
}

export interface RequestPlan {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * Builds the HTTP call for a JSON-returning prompt.
 *
 * The instruction to answer with JSON is put in the prompt for *every*
 * provider, not only those without a structured-output flag. Not every model
 * behind OpenRouter honours `response_format`, and a model that ignores it
 * returns prose — which is indistinguishable from a broken key unless the
 * prompt itself asked for JSON.
 */
export function buildRequest(options: {
  provider: ProviderProfile;
  apiKey: string;
  model: string;
  baseUrl?: string | null;
  prompt: string;
  maxTokens?: number;
}): RequestPlan {
  const { provider, apiKey, model, prompt } = options;
  const base = (options.baseUrl?.trim() || provider.baseUrl).replace(/\/+$/, "");
  const maxTokens = options.maxTokens ?? 4096;

  if (provider.shape === "gemini") {
    return {
      // Gemini takes the key as a query parameter rather than a header.
      url: `${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      headers: { "Content-Type": "application/json" },
      body: {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", maxOutputTokens: maxTokens },
      },
    };
  }

  if (provider.shape === "anthropic") {
    return {
      url: `${base}/messages`,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: {
        model,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      },
    };
  }

  return {
    url: `${base}/chat/completions`,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      // OpenRouter attributes usage to an app when these are present, and
      // ignores them otherwise, so they are safe to send everywhere.
      "HTTP-Referer": "https://wisdomcampus.example",
      "X-Title": "Wisdom Campus",
    },
    body: {
      model,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    },
  };
}

/** Pulls the assistant's text out of whichever response shape came back. */
export function extractText(shape: ApiShape, payload: unknown): string | null {
  const data = payload as Record<string, unknown>;

  if (shape === "gemini") {
    const candidates = data.candidates as { content?: { parts?: { text?: string }[] } }[] | undefined;
    return candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") || null;
  }

  if (shape === "anthropic") {
    const content = data.content as { type?: string; text?: string }[] | undefined;
    return content?.filter((part) => part.type === "text").map((part) => part.text ?? "").join("") || null;
  }

  const choices = data.choices as { message?: { content?: string } }[] | undefined;
  return choices?.[0]?.message?.content || null;
}

/**
 * Finds the JSON inside a model's answer.
 *
 * Models routinely wrap JSON in ```json fences, or open with "Here is the
 * scheme of work you asked for:" before the object. `JSON.parse` on the raw
 * text fails on both, which looks exactly like a broken API key to whoever is
 * holding it — so the text is unwrapped before parsing rather than trusted to
 * be clean.
 *
 * Returns null rather than throwing: the caller turns that into a message
 * about the provider, which is more useful than a parse error.
 */
export function extractJson<T>(text: string): T | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const attempts: string[] = [trimmed];

  // ```json … ``` or plain ``` … ```
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fenced?.[1]) attempts.push(fenced[1].trim());

  // Fall back to the outermost braces or brackets, which handles a
  // sentence before or after the object.
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    attempts.push(trimmed.slice(firstBrace, lastBrace + 1));
  }
  const firstBracket = trimmed.indexOf("[");
  const lastBracket = trimmed.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    attempts.push(trimmed.slice(firstBracket, lastBracket + 1));
  }

  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt) as T;
    } catch {
      // Try the next shape.
    }
  }

  return null;
}

/**
 * Turns a provider's error response into something an operator can act on.
 *
 * "Request failed with status 401" sends someone hunting; "the provider
 * rejected the API key" tells them what to fix.
 */
export function explainProviderError(status: number, payload: unknown): string {
  const data = payload as { error?: { message?: string } | string; message?: string } | undefined;
  const detail =
    typeof data?.error === "string"
      ? data.error
      : (data?.error?.message ?? data?.message ?? "");

  if (status === 401 || status === 403) {
    return `The provider rejected the API key${detail ? ` — ${detail}` : ""}`;
  }
  if (status === 404) {
    return `The provider does not recognise that model${detail ? ` — ${detail}` : ""}`;
  }
  if (status === 429) {
    return `The provider is rate limiting or out of credit${detail ? ` — ${detail}` : ""}`;
  }
  if (status >= 500) {
    return `The provider is having trouble (${status})${detail ? ` — ${detail}` : ""}`;
  }
  return detail || `The provider returned ${status}`;
}
