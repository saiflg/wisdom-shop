"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import {
  useAccessibility,
  useUpdateAccessibility,
  type ReadingSupport,
  type UpdateAccessibilityInput,
} from "@/lib/use-accessibility";

const READING_SUPPORT: Array<{ value: ReadingSupport; title: string; blurb: string }> = [
  { value: "NONE", title: "Normal", blurb: "Lessons are explained the usual way." },
  {
    value: "SIMPLIFIED",
    title: "Simpler language",
    blurb: "Short sentences and everyday words, with new words explained the first time.",
  },
  {
    value: "STEP_BY_STEP",
    title: "One step at a time",
    blurb: "Numbered steps, with a check that each one made sense before moving on.",
  },
];

export default function AccessibilityPage() {
  const { data, isLoading, error } = useAccessibility();
  const save = useUpdateAccessibility();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  // Saved on change rather than behind a Save button: a student turning on
  // larger text should see larger text, not hunt for a button in text they
  // are struggling to read.
  const set = async (input: UpdateAccessibilityInput) => {
    setMessage(null);
    try {
      await save.mutateAsync(input);
      setMessage({ tone: "ok", text: "Saved." });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof ApiError ? err.message : "Couldn't save that." });
    }
  };

  if (isLoading) return <p className="text-sm text-slate-500">Loading your settings…</p>;
  // Saying so beats spinning forever — and a student who cannot load this
  // page is precisely the one who cannot work around it.
  if (error || !data) {
    return (
      <p role="alert" className="text-sm text-red-600 dark:text-red-400">
        Couldn&apos;t load your accessibility settings. Please try again, or ask a teacher for help.
      </p>
    );
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Accessibility</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          These are your own settings. They change every page here, and they change how Wisdom Teacher
          explains things to you. Nobody has to approve them and you can change them whenever you like.
        </p>
      </div>

      <section aria-labelledby="display-heading" className="space-y-3">
        <h2 id="display-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          How things look
        </h2>

        <Toggle
          label="Bigger text"
          hint="Makes everything larger, everywhere."
          checked={data.largeText}
          onChange={(largeText) => void set({ largeText })}
        />
        <Toggle
          label="Higher contrast"
          hint="Stronger colours and darker text."
          checked={data.highContrast}
          onChange={(highContrast) => void set({ highContrast })}
        />
        <Toggle
          label="Easier-to-read letters"
          hint="A typeface with more space between letters and words."
          checked={data.dyslexiaFont}
          onChange={(dyslexiaFont) => void set({ dyslexiaFont })}
        />
        <Toggle
          label="Less movement"
          hint="Turns off sliding and fading animations."
          checked={data.reduceMotion}
          onChange={(reduceMotion) => void set({ reduceMotion })}
        />
      </section>

      <section aria-labelledby="teaching-heading" className="space-y-3">
        <h2 id="teaching-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          How Wisdom Teacher explains things
        </h2>

        <fieldset className="space-y-2">
          <legend className="sr-only">Reading support</legend>
          {READING_SUPPORT.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer gap-3 rounded-lg border border-slate-300 p-3 transition hover:border-brand-400 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 dark:border-slate-700 dark:has-[:checked]:bg-brand-950/30"
            >
              <input
                type="radio"
                name="readingSupport"
                className="mt-1"
                checked={data.readingSupport === option.value}
                onChange={() => void set({ readingSupport: option.value })}
              />
              <span>
                <span className="block text-sm font-semibold">{option.title}</span>
                <span className="mt-0.5 block text-xs text-slate-500">{option.blurb}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <Toggle
          label="Describe pictures in words"
          hint="The teacher explains every diagram out loud as well as drawing it."
          checked={data.describeVisuals}
          onChange={(describeVisuals) => void set({ describeVisuals })}
        />
        <Toggle
          label="Only show videos with captions"
          hint="Hides demonstration videos that aren't captioned."
          checked={data.requireCaptions}
          onChange={(requireCaptions) => void set({ requireCaptions })}
        />
      </section>

      {/* Announced rather than only shown, since a screen-reader user gets no
          visual confirmation that a toggle saved. */}
      <p role="status" aria-live="polite" className="min-h-5 text-sm">
        {message && (
          <span className={message.tone === "ok" ? "text-emerald-600" : "text-red-600"}>{message.text}</span>
        )}
      </p>

      <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-900">
        Your teachers can also set these for you, and may keep a private note about the support you need. That
        note is never shown to you here and is never sent to the AI provider.
      </p>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-300 p-3 transition hover:border-brand-400 dark:border-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4"
      />
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>
      </span>
    </label>
  );
}
