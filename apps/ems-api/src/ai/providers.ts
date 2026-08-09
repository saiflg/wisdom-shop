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
    // Cheap and fast, and dependable at holding a JSON schema — which is what
    // every generation path here asks for.
    //
    // This used to name a `:free` model so a new operator could prove the
    // wiring without paying. That backfired: free tiers are the first thing a
    // vendor retires, and when `google/gemini-2.0-flash-exp:free` went away
    // the default sent everyone a "no endpoints found for that model" error
    // that reads like a broken key. A default that stops working on someone
    // else's schedule is worse than one that costs a fraction of a penny.
    defaultModel: "google/gemini-3.6-flash",
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
    defaultModel: "claude-sonnet-5",
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
 * Builds the HTTP call.
 *
 * `expects` decides whether the provider is put into JSON mode, and it is not
 * optional on purpose. Forcing JSON mode on a prose request does not produce
 * prose with a wasted flag: the model obeys, and a *lesson* comes back wrapped
 * in `{"lesson": "...", "worked_example": "..."}` — which the student then
 * reads, braces and all. That shipped once, and only a live provider revealed
 * it, since a fake returns whatever the test told it to.
 *
 * When JSON *is* wanted, the instruction also goes into the prompt rather than
 * relying on this flag alone. Not every model behind OpenRouter honours
 * `response_format`, and one that ignores it returns prose — which is
 * indistinguishable from a broken key unless the prompt itself asked.
 */
export function buildRequest(options: {
  provider: ProviderProfile;
  apiKey: string;
  model: string;
  baseUrl?: string | null;
  prompt: string;
  maxTokens?: number;
  expects: "json" | "text";
}): RequestPlan {
  const { provider, apiKey, model, prompt, expects } = options;
  const base = (options.baseUrl?.trim() || provider.baseUrl).replace(/\/+$/, "");
  // Generous because reasoning models bill their thinking to this same
  // budget, and a truncated scheme of work is a failed generation rather
  // than a shorter one. Unused headroom costs nothing — only tokens actually
  // produced are charged.
  const maxTokens = options.maxTokens ?? 8192;
  const wantsJson = expects === "json";

  if (provider.shape === "gemini") {
    return {
      // Gemini takes the key as a query parameter rather than a header.
      url: `${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      headers: { "Content-Type": "application/json" },
      body: {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          ...(wantsJson ? { responseMimeType: "application/json" } : {}),
          maxOutputTokens: maxTokens,
        },
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
      ...(wantsJson ? { response_format: { type: "json_object" } } : {}),
      // No attempt to switch reasoning off.
      //
      // Reasoning tokens are drawn from `max_tokens`, so a thinking model can
      // spend the whole budget deliberating and return a fragment. The
      // obvious fix — asking for reasoning to be disabled — turns out to be
      // unavailable: some endpoints mandate it and reject the request
      // outright ("Reasoning is mandatory for this endpoint"). Since an
      // operator can point this at any model on any provider, there is no
      // way to know in advance which will accept it.
      //
      // So the budget absorbs it instead. Costs a few more tokens on models
      // that think; works on every model either way, which the flag did not.
      messages: [{ role: "user", content: prompt }],
    },
  };
}

/**
 * Whether the model was cut off mid-answer.
 *
 * Worth checking separately from emptiness, because a *partial* answer is the
 * more dangerous case: `{"ok":` parses as nothing and surfaces as "replied but
 * not with JSON", which sends someone off to change models when the real
 * problem was the token budget. Truncated output is never usable, so the
 * caller should refuse it outright rather than pass the fragment downstream.
 */
export function wasTruncated(shape: ApiShape, payload: unknown): boolean {
  const data = (payload ?? {}) as Record<string, unknown>;

  if (shape === "gemini") {
    return (data.candidates as { finishReason?: string }[] | undefined)?.[0]?.finishReason === "MAX_TOKENS";
  }
  if (shape === "anthropic") {
    return data.stop_reason === "max_tokens";
  }

  const choice = (data.choices as { finish_reason?: string; native_finish_reason?: string }[] | undefined)?.[0];
  return (choice?.finish_reason ?? choice?.native_finish_reason) === "length";
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
 * Why a successful response carried no text.
 *
 * "The provider returned an empty response" is true and useless: it reads
 * like a broken key when it usually is not. A 200 with no content nearly
 * always means one of three things, and each needs a different fix —
 * a bigger token budget, a different model, or different wording — so the
 * message says which.
 *
 * The commonest by far is a reasoning model hitting its cap: it spends the
 * budget thinking and never reaches the answer, which is exactly what a
 * 64-token connection test used to provoke.
 */
export function explainEmptyResponse(shape: ApiShape, payload: unknown): string {
  const data = (payload ?? {}) as Record<string, unknown>;

  if (shape === "gemini") {
    const candidate = (data.candidates as { finishReason?: string }[] | undefined)?.[0];
    const reason = candidate?.finishReason;
    if (reason === "MAX_TOKENS") {
      return "The model ran out of room before it answered. Raise the token limit or choose a smaller model.";
    }
    if (reason === "SAFETY" || reason === "PROHIBITED_CONTENT") {
      return "The model declined to answer that prompt.";
    }
    // No candidates at all usually means the prompt itself was blocked.
    const blocked = (data.promptFeedback as { blockReason?: string } | undefined)?.blockReason;
    if (blocked) return `The provider blocked the prompt (${blocked}).`;
    return "The provider returned an empty response.";
  }

  if (shape === "anthropic") {
    const reason = data.stop_reason as string | undefined;
    if (reason === "max_tokens") {
      return "The model ran out of room before it answered. Raise the token limit.";
    }
    return "The provider returned an empty response.";
  }

  const choice = (data.choices as { finish_reason?: string; native_finish_reason?: string }[] | undefined)?.[0];
  const reason = choice?.finish_reason ?? choice?.native_finish_reason;

  if (reason === "length") {
    // A reasoning model burning its budget on thinking lands here.
    return (
      "The model ran out of room before it answered — it may be a reasoning model " +
      "spending the token budget on thinking. Raise the limit, or pick a non-reasoning model."
    );
  }
  if (reason === "content_filter") return "The provider filtered that response.";
  if (!choice) return "The provider returned no choices at all.";
  return "The provider returned an empty response.";
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
