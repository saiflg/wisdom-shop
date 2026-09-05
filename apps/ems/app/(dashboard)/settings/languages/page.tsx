"use client";

import { useEffect, useState } from "react";
import { apiFetch, errorMessage } from "@/lib/api";
import { authHeaders, useAuthQueryState } from "@/lib/api-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "@/lib/i18n/i18n-provider";
import { LOCALES, LOCALE_LABELS, isLocale, type Locale } from "@/lib/i18n";

interface BrandingSettings {
  displayName: string | null;
  defaultLocale: string;
}

/**
 * The language the school opens in, and the one this person reads in.
 *
 * Two settings on one page because they are constantly confused for each
 * other. Saying plainly which is which — and showing that your own choice
 * wins — is most of the work.
 */
export default function LanguagesPage() {
  const { t } = useTranslation();
  const { accessToken, enabled } = useAuthQueryState();
  const { locale, setLocale, chosenByUser } = useTranslation();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["branding", "settings"],
    enabled,
    queryFn: () => apiFetch<BrandingSettings>("/v1/branding", { headers: authHeaders(accessToken) }),
  });

  const [schoolDefault, setSchoolDefault] = useState<string>("en");
  const [saved, setSaved] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (data?.defaultLocale) setSchoolDefault(data.defaultLocale);
  }, [data?.defaultLocale]);

  const save = useMutation({
    mutationFn: (defaultLocale: string) =>
      apiFetch<BrandingSettings>("/v1/branding", {
        method: "PATCH",
        headers: authHeaders(accessToken),
        body: { defaultLocale },
      }),
    onSuccess: () => {
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ["branding", "settings"] });
    },
  });

  const saveSchoolDefault = async (next: string) => {
    setProblem(null);
    setSaved(false);
    setSchoolDefault(next);
    try {
      await save.mutateAsync(next);
    } catch (err) {
      setProblem(errorMessage(err, t("languages.saveFailed")));
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("languages.title")}</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {t("languages.intro", { count: LOCALES.length })}
        </p>
      </div>

      <section className="space-y-3 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
        <div>
          <h2 className="font-semibold">{t("languages.mine")}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {t("languages.mineHint")}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {LOCALES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setLocale(option)}
              aria-pressed={locale === option}
              className={
                locale === option
                  ? "rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
                  : "rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
              }
            >
              {LOCALE_LABELS[option]}
            </button>
          ))}
        </div>

        {/* Which of the two is in force, said plainly. Without this, somebody
            changing the school default and seeing nothing happen concludes
            the setting is broken. */}
        <p className="text-xs text-slate-500">
          {chosenByUser
            ? t("languages.chosenByYou")
            : t("languages.followingSchool")}
        </p>
      </section>

      <section className="space-y-3 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
        <div>
          <h2 className="font-semibold">{t("languages.schoolTitle")}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {t("languages.schoolHint")}
          </p>
        </div>

        <label className="block text-sm font-medium">
          <span className="sr-only">{t("languages.schoolDefaultLabel")}</span>
          <select
            value={schoolDefault}
            onChange={(event) => void saveSchoolDefault(event.target.value)}
            disabled={save.isPending}
            className="w-full max-w-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900"
          >
            {LOCALES.map((option) => (
              <option key={option} value={option}>
                {LOCALE_LABELS[option]}
              </option>
            ))}
          </select>
        </label>

        {save.isPending && <p className="text-xs text-slate-500">{t("shared.saving")}</p>}
        {saved && !save.isPending && <p className="text-xs text-emerald-600">{t("common.saved")}</p>}
        {problem && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {problem}
          </p>
        )}

        <p className="text-xs text-slate-500">
          {t("languages.noOverride")}
        </p>
      </section>

      {!isLocale(schoolDefault) && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          {t("languages.unknownDefault")}
        </p>
      )}
    </div>
  );
}
