import {
  PROVIDERS,
  buildRequest,
  explainProviderError,
  extractJson,
  extractText,
  findProvider,
} from "./providers";

describe("the provider list", () => {
  it("offers five providers", () => {
    expect(PROVIDERS).toHaveLength(5);
  });

  it("gives every provider a usable default except the custom one", () => {
    for (const provider of PROVIDERS) {
      if (provider.needsBaseUrl) continue;
      expect(provider.baseUrl).toMatch(/^https:\/\//);
      expect(provider.defaultModel).toBeTruthy();
    }
  });

  it("marks the custom provider as needing a base URL", () => {
    // The escape hatch: Groq, Together, a local Ollama — no code change.
    const custom = findProvider("OPENAI_COMPATIBLE");
    expect(custom.needsBaseUrl).toBe(true);
    expect(custom.baseUrl).toBe("");
  });

  it("throws on an unknown provider rather than guessing one", () => {
    expect(() => findProvider("NOT_A_PROVIDER" as never)).toThrow(/unknown ai provider/i);
  });
});

describe("buildRequest", () => {
  const common = { apiKey: "test-key", model: "some-model", prompt: "Say hi as JSON" };

  it("builds an OpenAI-style call for OpenRouter", () => {
    const plan = buildRequest({ provider: findProvider("OPENROUTER"), ...common });
    expect(plan.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(plan.headers.Authorization).toBe("Bearer test-key");
  });

  it("uses Anthropic's own header and version", () => {
    const plan = buildRequest({ provider: findProvider("ANTHROPIC"), ...common });
    expect(plan.url).toBe("https://api.anthropic.com/v1/messages");
    expect(plan.headers["x-api-key"]).toBe("test-key");
    expect(plan.headers["anthropic-version"]).toBeTruthy();
    // Anthropic must not receive a bearer token instead.
    expect(plan.headers.Authorization).toBeUndefined();
  });

  it("puts the key in the query string for Gemini, as that API requires", () => {
    const plan = buildRequest({ provider: findProvider("GOOGLE_GEMINI"), ...common });
    expect(plan.url).toContain("generateContent?key=test-key");
    expect(plan.headers.Authorization).toBeUndefined();
  });

  it("honours a custom base URL and strips a trailing slash", () => {
    // A pasted URL very often ends in a slash; doubling it 404s.
    const plan = buildRequest({
      provider: findProvider("OPENAI_COMPATIBLE"),
      ...common,
      baseUrl: "http://localhost:11434/v1/",
    });
    expect(plan.url).toBe("http://localhost:11434/v1/chat/completions");
  });

  it("always asks for JSON in the prompt itself, not only via a flag", () => {
    // Not every model behind OpenRouter honours response_format, and one that
    // ignores it returns prose — indistinguishable from a broken key unless
    // the prompt asked.
    for (const provider of PROVIDERS) {
      const plan = buildRequest({
        provider,
        ...common,
        prompt: "Return JSON only",
        baseUrl: provider.needsBaseUrl ? "https://example.com/v1" : undefined,
      });
      expect(JSON.stringify(plan.body)).toContain("Return JSON only");
    }
  });

  it("never leaks the key into the body", () => {
    for (const provider of PROVIDERS) {
      const plan = buildRequest({
        provider,
        ...common,
        baseUrl: provider.needsBaseUrl ? "https://example.com/v1" : undefined,
      });
      expect(JSON.stringify(plan.body)).not.toContain("test-key");
    }
  });
});

describe("extractText", () => {
  it("reads an OpenAI-style response", () => {
    expect(extractText("openai", { choices: [{ message: { content: "hello" } }] })).toBe("hello");
  });

  it("reads an Anthropic response, ignoring non-text blocks", () => {
    const payload = { content: [{ type: "thinking", text: "hmm" }, { type: "text", text: "hello" }] };
    expect(extractText("anthropic", payload)).toBe("hello");
  });

  it("reads a Gemini response, joining its parts", () => {
    const payload = { candidates: [{ content: { parts: [{ text: "he" }, { text: "llo" }] } }] };
    expect(extractText("gemini", payload)).toBe("hello");
  });

  it("returns null for an empty or unexpected response rather than throwing", () => {
    for (const shape of ["openai", "anthropic", "gemini"] as const) {
      expect(extractText(shape, {})).toBeNull();
      expect(extractText(shape, { choices: [] })).toBeNull();
    }
  });
});

describe("extractJson", () => {
  it("parses clean JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("unwraps a ```json fence, which models produce constantly", () => {
    // Parsing the raw text fails here, and looks exactly like a broken key
    // to whoever is holding it.
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("ignores a sentence before or after the object", () => {
    expect(extractJson('Here is the scheme of work:\n{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('{"a":1}\n\nLet me know if you need changes!')).toEqual({ a: 1 });
  });

  it("handles a top-level array", () => {
    expect(extractJson("[1,2,3]")).toEqual([1, 2, 3]);
    expect(extractJson('```json\n[{"a":1}]\n```')).toEqual([{ a: 1 }]);
  });

  it("handles nested braces without truncating", () => {
    expect(extractJson('prose {"a":{"b":[1,2]},"c":3} more prose')).toEqual({ a: { b: [1, 2] }, c: 3 });
  });

  it("returns null when there is no JSON at all", () => {
    // Null rather than a throw: the caller turns this into a message about
    // the provider, which is more useful than a parse error.
    expect(extractJson("I'm sorry, I can't help with that.")).toBeNull();
    expect(extractJson("")).toBeNull();
    expect(extractJson("   ")).toBeNull();
  });

  it("returns null for malformed JSON rather than a half-object", () => {
    expect(extractJson('{"a":1,')).toBeNull();
  });
});

describe("explainProviderError", () => {
  it("names a rejected key rather than a status code", () => {
    // "Request failed with status 401" sends someone hunting.
    expect(explainProviderError(401, {})).toMatch(/rejected the API key/i);
    expect(explainProviderError(403, {})).toMatch(/rejected the API key/i);
  });

  it("names an unknown model", () => {
    expect(explainProviderError(404, {})).toMatch(/does not recognise that model/i);
  });

  it("distinguishes rate limiting and running out of credit", () => {
    expect(explainProviderError(429, {})).toMatch(/rate limiting or out of credit/i);
  });

  it("passes the provider's own words through when it gives them", () => {
    expect(explainProviderError(401, { error: { message: "No auth credentials found" } })).toContain(
      "No auth credentials found",
    );
    expect(explainProviderError(400, { error: "bad model" })).toContain("bad model");
  });

  it("always says something, even for an empty response", () => {
    for (const status of [400, 418, 500, 503]) {
      expect(explainProviderError(status, undefined).length).toBeGreaterThan(0);
    }
  });
});
