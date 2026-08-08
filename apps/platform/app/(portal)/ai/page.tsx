"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { ApiError } from "@/lib/api";
import { RequirePlatformAuth } from "@/components/require-platform-auth";
import {
  useAiProviders,
  useAiSettings,
  useSaveAiSettings,
  useTestAiConnection,
  type AiProvider,
} from "@/lib/use-ai-settings";

const INPUT =
  "mt-1.5 w-full rounded-lg border border-platform-300 bg-white px-3 py-2 text-sm outline-none focus:border-platform-500 focus:ring-2 focus:ring-platform-500/20 dark:border-platform-700 dark:bg-platform-900";
const SOLID =
  "rounded-full bg-platform-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-platform-600 disabled:opacity-50";
const OUTLINE =
  "rounded-full border border-platform-300 px-5 py-2 text-sm font-semibold transition hover:bg-platform-100 disabled:opacity-50 dark:border-platform-700 dark:hover:bg-platform-800";

export default function AiSettingsPage() {
  return (
    <RequirePlatformAuth>
      <AiSettings />
    </RequirePlatformAuth>
  );
}

function AiSettings() {
  const { data: providers } = useAiProviders();
  const { data: settings } = useAiSettings();
  const save = useSaveAiSettings();
  const test = useTestAiConnection();

  const [provider, setProvider] = useState<AiProvider>("OPENROUTER");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!settings || loaded) return;
    setProvider(settings.provider);
    setModel(settings.model);
    setBaseUrl(settings.baseUrl ?? "");
    setLoaded(true);
  }, [settings, loaded]);

  const chosen = providers?.find((candidate) => candidate.id === provider);

  const submit = async () => {
    setMessage(null);
    try {
      await save.mutateAsync({
        provider,
        model: model.trim(),
        baseUrl: baseUrl.trim(),
        // Omitted when blank, so saving a model change does not wipe the key.
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      });
      // Cleared immediately: there is no reason for a key to sit in a form
      // field after it has been stored.
      setApiKey("");
      setMessage({ tone: "ok", text: "Saved." });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof ApiError ? err.message : "Couldn't save those settings." });
    }
  };

  const runTest = async () => {
    setMessage(null);
    try {
      const result = await test.mutateAsync();
      setMessage({ tone: result.ok ? "ok" : "error", text: result.message });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof ApiError ? err.message : "Couldn't reach the provider." });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AI provider</h1>
        <p className="mt-1 max-w-2xl text-sm text-platform-600 dark:text-platform-400">
          Which service powers curriculum generation, lesson plans and quizzes across every school. The key is
          yours and is billed to you, so it lives here rather than in each school&apos;s settings.
        </p>
      </div>

      <section className="space-y-4 rounded-2xl border border-platform-200 p-5 dark:border-platform-800">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Provider
            <select
              value={provider}
              onChange={(event) => {
                const next = event.target.value as AiProvider;
                setProvider(next);
                // Offer the new provider's default rather than carrying over
                // a model name that belongs to a different vendor.
                const profile = providers?.find((candidate) => candidate.id === next);
                setModel(profile?.defaultModel ?? "");
              }}
              className={INPUT}
            >
              {providers?.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium">
            Model
            <input
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder={chosen?.defaultModel || "model name"}
              className={INPUT}
            />
          </label>
        </div>

        {chosen?.needsBaseUrl && (
          <label className="block text-sm font-medium">
            Base URL
            <input
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://api.groq.com/openai/v1"
              className={INPUT}
            />
            <span className="mt-1 block text-xs text-platform-500">
              Anything that speaks the OpenAI chat-completions API — Groq, Together, DeepSeek, a local Ollama.
            </span>
          </label>
        )}

        <label className="block text-sm font-medium">
          API key
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={settings?.hasApiKey ? `Saved — ${settings.apiKeyMasked}` : "Paste your key"}
            autoComplete="off"
            className={INPUT}
          />
          <span className="mt-1 block text-xs text-platform-500">
            Encrypted before it is stored and never shown again. Leave blank to keep the saved key.
            {chosen?.keyUrl && (
              <>
                {" "}
                <a href={chosen.keyUrl} target="_blank" rel="noreferrer" className="underline">
                  Get a key
                </a>
              </>
            )}
          </span>
        </label>

        {message && (
          <p className={message.tone === "ok" ? "text-sm text-emerald-600" : "text-sm text-red-600"}>
            {message.text}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={submit} disabled={save.isPending} className={SOLID}>
            Save
          </button>
          <button
            type="button"
            onClick={runTest}
            disabled={test.isPending || !settings?.hasApiKey}
            className={OUTLINE}
          >
            {test.isPending ? "Testing…" : "Test connection"}
          </button>
        </div>

        {/* The last result is kept so the state of the key is visible without
            anyone having to run a real generation to find out. */}
        {settings?.lastTestedAt && (
          <p className={clsx("text-xs", settings.lastTestOk ? "text-emerald-600" : "text-red-600")}>
            Last tested {new Date(settings.lastTestedAt).toLocaleString()} —{" "}
            {settings.lastTestOk ? "working" : (settings.lastTestError ?? "failed")}
          </p>
        )}
      </section>
    </div>
  );
}
