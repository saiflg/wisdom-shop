"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { useCurriculumSettings, useUpdateCurriculumSettings, type CurriculumMode } from "@/lib/use-curriculum-settings";
import { useAuthStore } from "@/store/auth-store";
import { useTranslation } from "@/lib/i18n/i18n-provider";
import type { TranslationKey } from "@/lib/i18n";

const MODE_OPTIONS: { value: CurriculumMode; labelKey: TranslationKey; hintKey: TranslationKey }[] = [
  { value: "MANUAL", labelKey: "curriculumSettings.modeMANUAL", hintKey: "curriculumSettings.modeMANUALHint" },
  {
    value: "AI_AUTOMATIC",
    labelKey: "curriculumSettings.modeAI_AUTOMATIC",
    hintKey: "curriculumSettings.modeAI_AUTOMATICHint",
  },
  { value: "HYBRID", labelKey: "curriculumSettings.modeHYBRID", hintKey: "curriculumSettings.modeHYBRIDHint" },
];

export default function CurriculumSettingsPage() {
  const { t } = useTranslation();
  const { data: settings, isLoading, error } = useCurriculumSettings();
  const update = useUpdateCurriculumSettings();
  const isSchoolAdmin = useAuthStore((s) => s.user?.roles.includes("SCHOOL_ADMIN"));

  const [mode, setMode] = useState<CurriculumMode>("MANUAL");
  const [country, setCountry] = useState("");
  const [curriculumStandard, setCurriculumStandard] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setMode(settings.mode);
    setCountry(settings.country ?? "");
    setCurriculumStandard(settings.curriculumStandard ?? "");
  }, [settings]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaved(false);
    try {
      await update.mutateAsync({ mode, country: country || undefined, curriculumStandard: curriculumStandard || undefined });
      setSaved(true);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t("curriculumSettings.saveFailed"));
    }
  };

  if (isLoading) return <p className="text-sm text-slate-600 dark:text-slate-400">{t("common.loading")}</p>;
  if (error) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
        Couldn&apos;t load curriculum settings: {error.message}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">{t("curriculumSettings.title")}</h1>

      <form
        onSubmit={onSubmit}
        className="space-y-5 rounded-2xl border border-slate-200 p-5 dark:border-slate-800"
      >
        <fieldset disabled={!isSchoolAdmin} className="space-y-5 disabled:opacity-60">
          <div>
            <span className="block text-sm font-medium">{t("curriculumSettings.mode")}</span>
            <div className="mt-2 space-y-2">
              {MODE_OPTIONS.map((option) => (
                <label key={option.value} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                  <input
                    type="radio"
                    name="mode"
                    value={option.value}
                    checked={mode === option.value}
                    onChange={() => setMode(option.value)}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium">{t(option.labelKey)}</span>
                    <span className="block text-slate-600 dark:text-slate-400">{t(option.hintKey)}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="country" className="block text-sm font-medium">
              {t("curriculumSettings.country")}
            </label>
            <input
              id="country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder={t("curriculumSettings.countryPlaceholder")}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
            />
          </div>

          <div>
            <label htmlFor="curriculumStandard" className="block text-sm font-medium">
              {t("curriculumSettings.standard")}
            </label>
            <input
              id="curriculumStandard"
              value={curriculumStandard}
              onChange={(e) => setCurriculumStandard(e.target.value)}
              placeholder="NERDC" /* a named body, not a phrase — see note above */
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
            />
          </div>

          {formError && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
              {formError}
            </p>
          )}
          {saved && !formError && <p className="text-sm text-emerald-600 dark:text-emerald-400">{t("accessibility.saved")}</p>}

          <button
            type="submit"
            disabled={update.isPending}
            className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {t("curriculumSettings.save")}
          </button>
        </fieldset>
      </form>

      {!isSchoolAdmin && (
        <p className="text-sm text-slate-600 dark:text-slate-400">{t("curriculumSettings.adminOnly")}</p>
      )}
    </div>
  );
}
