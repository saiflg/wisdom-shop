"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { useCurriculumSettings, useUpdateCurriculumSettings, type CurriculumMode } from "@/lib/use-curriculum-settings";
import { useAuthStore } from "@/store/auth-store";

const MODE_OPTIONS: { value: CurriculumMode; label: string; hint: string }[] = [
  { value: "MANUAL", label: "Manual", hint: "Staff write every scheme of work by hand." },
  { value: "AI_AUTOMATIC", label: "Wisdom automatic", hint: "Generate schemes of work with Wisdom." },
  { value: "HYBRID", label: "Hybrid", hint: "Both manual and Wisdom-generated are available." },
];

export default function CurriculumSettingsPage() {
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
      setFormError(err instanceof ApiError ? err.message : "Couldn't save curriculum settings.");
    }
  };

  if (isLoading) return <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>;
  if (error) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
        Couldn&apos;t load curriculum settings: {error.message}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Curriculum settings</h1>

      <form
        onSubmit={onSubmit}
        className="space-y-5 rounded-2xl border border-slate-200 p-5 dark:border-slate-800"
      >
        <fieldset disabled={!isSchoolAdmin} className="space-y-5 disabled:opacity-60">
          <div>
            <span className="block text-sm font-medium">Curriculum mode</span>
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
                    <span className="font-medium">{option.label}</span>
                    <span className="block text-slate-600 dark:text-slate-400">{option.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="country" className="block text-sm font-medium">
              Country
            </label>
            <input
              id="country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="Nigeria"
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
            />
          </div>

          <div>
            <label htmlFor="curriculumStandard" className="block text-sm font-medium">
              Curriculum standard
            </label>
            <input
              id="curriculumStandard"
              value={curriculumStandard}
              onChange={(e) => setCurriculumStandard(e.target.value)}
              placeholder="NERDC"
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
            />
          </div>

          {formError && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
              {formError}
            </p>
          )}
          {saved && !formError && <p className="text-sm text-emerald-600 dark:text-emerald-400">Saved.</p>}

          <button
            type="submit"
            disabled={update.isPending}
            className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            Save settings
          </button>
        </fieldset>
      </form>

      {!isSchoolAdmin && (
        <p className="text-sm text-slate-600 dark:text-slate-400">Only a school admin can change curriculum settings.</p>
      )}
    </div>
  );
}
