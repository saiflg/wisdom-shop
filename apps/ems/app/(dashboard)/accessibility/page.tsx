"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import {
  useAccessibility,
  useUpdateAccessibility,
  type ReadingSupport,
  type UpdateAccessibilityInput,
} from "@/lib/use-accessibility";
import { useTranslation } from "@/lib/i18n/i18n-provider";
import type { TranslationKey } from "@/lib/i18n";

// Keys rather than prose: this array is built once at module load, so held
// as English it would stay English however the reader had set their language.
const READING_SUPPORT: Array<{ value: ReadingSupport; titleKey: TranslationKey; blurbKey: TranslationKey }> = [
  { value: "NONE", titleKey: "accessibility.readingNONE", blurbKey: "accessibility.readingNONEHint" },
  {
    value: "SIMPLIFIED",
    titleKey: "accessibility.readingSIMPLIFIED",
    blurbKey: "accessibility.readingSIMPLIFIEDHint",
  },
  {
    value: "STEP_BY_STEP",
    titleKey: "accessibility.readingSTEP_BY_STEP",
    blurbKey: "accessibility.readingSTEP_BY_STEPHint",
  },
];

export default function AccessibilityPage() {
  const { t } = useTranslation();
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
      setMessage({ tone: "ok", text: t("accessibility.saved") });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof ApiError ? err.message : t("accessibility.saveFailed") });
    }
  };

  if (isLoading) return <p className="text-sm text-slate-500">{t("accessibility.loading")}</p>;
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
        <h1 className="text-2xl font-bold tracking-tight">{t("accessibility.title")}</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {t("accessibility.intro")}
        </p>
      </div>

      <section aria-labelledby="display-heading" className="space-y-3">
        <h2 id="display-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {t("accessibility.howThingsLook")}
        </h2>

        <Toggle
          label={t("accessibility.biggerText")}
          hint={t("accessibility.biggerTextHint")}
          checked={data.largeText}
          onChange={(largeText) => void set({ largeText })}
        />
        <Toggle
          label={t("accessibility.higherContrast")}
          hint={t("accessibility.higherContrastHint")}
          checked={data.highContrast}
          onChange={(highContrast) => void set({ highContrast })}
        />
        <Toggle
          label={t("accessibility.easierLetters")}
          hint={t("accessibility.easierLettersHint")}
          checked={data.dyslexiaFont}
          onChange={(dyslexiaFont) => void set({ dyslexiaFont })}
        />
        <Toggle
          label={t("accessibility.lessMovement")}
          hint={t("accessibility.lessMovementHint")}
          checked={data.reduceMotion}
          onChange={(reduceMotion) => void set({ reduceMotion })}
        />
      </section>

      <section aria-labelledby="teaching-heading" className="space-y-3">
        <h2 id="teaching-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {t("accessibility.howWisdomExplains")}
        </h2>

        <fieldset className="space-y-2">
          <legend className="sr-only">{t("accessibility.readingSupport")}</legend>
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
                <span className="block text-sm font-semibold">{t(option.titleKey)}</span>
                <span className="mt-0.5 block text-xs text-slate-500">{t(option.blurbKey)}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <Toggle
          label={t("accessibility.describePictures")}
          hint={t("accessibility.describePicturesHint")}
          checked={data.describeVisuals}
          onChange={(describeVisuals) => void set({ describeVisuals })}
        />
        <Toggle
          label={t("accessibility.captionsOnly")}
          hint={t("accessibility.captionsOnlyHint")}
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
        {t("accessibility.teacherNote")}
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
