"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { useIsSchoolAdmin } from "@/lib/use-can-author";
import {
  useDocumentHeader,
  useSchoolProfile,
  useUpdateSchoolProfile,
  type SchoolProfileInput,
} from "@/lib/use-school-profile";
import { useTranslation } from "@/lib/i18n/i18n-provider";
import type { TranslationKey } from "@/lib/i18n";

/*
 * Labels are keys; the example values beside them are not.
 *
 * "12 Awolowo Road", "0801 234 5678" and "office@school.ng" show the SHAPE of
 * an address, a phone number and an email — a Nigerian school recognises them
 * instantly and any other school reads them as "something like this". Turning
 * them into locale-specific inventions would mean guessing at address formats
 * and dialling codes for countries this software has never been used in.
 */
const FIELDS: {
  key: keyof SchoolProfileInput;
  labelKey: TranslationKey;
  placeholderKey?: TranslationKey;
  placeholder?: string;
  wide?: boolean;
}[] = [
  { key: "motto", labelKey: "schoolProfile.motto", placeholderKey: "schoolProfile.mottoPlaceholder", wide: true },
  { key: "addressLine1", labelKey: "schoolProfile.address", placeholder: "12 Awolowo Road", wide: true },
  { key: "addressLine2", labelKey: "schoolProfile.address2", wide: true },
  { key: "town", labelKey: "schoolProfile.town" },
  { key: "state", labelKey: "schoolProfile.state" },
  { key: "country", labelKey: "schoolProfile.country" },
  { key: "phone", labelKey: "schoolProfile.phone", placeholder: "0801 234 5678" },
  { key: "email", labelKey: "schoolProfile.email", placeholder: "office@school.ng" },
  { key: "website", labelKey: "schoolProfile.website" },
  { key: "registrationNumber", labelKey: "schoolProfile.registrationNumber" },
  { key: "headTeacherName", labelKey: "schoolProfile.headTeacher" },
];

/**
 * The school's own particulars, as they appear on what it hands out.
 *
 * Separate from Branding, which is how the console looks. These are the facts
 * that print on a report card, a receipt and a transcript — and until this
 * screen existed there was nowhere to put them, so those documents were
 * headed with the school's URL slug.
 */
export default function SchoolProfilePage() {
  const { t } = useTranslation();
  const isAdmin = useIsSchoolAdmin();
  const { data: profile, isLoading } = useSchoolProfile();
  const { data: header } = useDocumentHeader();
  const update = useUpdateSchoolProfile();

  const [form, setForm] = useState<SchoolProfileInput>({});
  const [year, setYear] = useState("");
  const [note, setNote] = useState<string | null>(null);

  // Seeded once the profile arrives. Without this the inputs are controlled
  // by an empty object and a school's existing details never appear.
  useEffect(() => {
    if (!profile) return;
    setForm(profile);
    setYear(profile.establishedYear ? String(profile.establishedYear) : "");
  }, [profile]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setNote(null);
    try {
      await update.mutateAsync({
        ...form,
        // Empty means "not set", not zero.
        establishedYear: year.trim() ? Number(year) : null,
      });
      setNote("Saved.");
    } catch (err) {
      setNote(err instanceof ApiError ? err.message : t("schoolProfile.saveFailed"));
    }
  };

  if (isLoading) return <p className="text-sm text-slate-600 dark:text-slate-400">{t("common.loading")}</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("schoolProfile.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          {t("schoolProfile.intro")}
          {t("schoolProfile.brandingNote")}
        </p>
      </div>

      {/* The preview comes from the API, not from assembling the same string
          again here — a preview that agrees with nothing is worse than none. */}
      {header && header.length > 0 && (
        <section className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("schoolProfile.headingPreview")}
          </p>
          <div className="mt-2">
            <p className="text-sm font-semibold">{header[0]}</p>
            {header.slice(1).map((line) => (
              <p key={line} className="text-xs text-slate-500">
                {line}
              </p>
            ))}
          </div>
          {header.length === 1 && (
            <p className="mt-2 text-xs text-slate-500">
              {t("schoolProfile.nameOnly")}
            </p>
          )}
        </section>
      )}

      {!profile && (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {t("schoolProfile.nothingFilled")}
        </p>
      )}

      <form onSubmit={submit} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
        <div className="grid gap-3 sm:grid-cols-2">
          {FIELDS.map((field) => (
            <label
              key={field.key}
              className={`text-xs text-slate-500 ${field.wide ? "sm:col-span-2" : ""}`}
            >
              {t(field.labelKey)}
              <input
                value={(form[field.key] as string | null) ?? ""}
                onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
                disabled={!isAdmin}
                placeholder={field.placeholderKey ? t(field.placeholderKey) : field.placeholder}
                maxLength={200}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
          ))}

          <label className="text-xs text-slate-500">
            {t("schoolProfile.yearFounded")}
            <input
              type="number"
              value={year}
              onChange={(event) => setYear(event.target.value)}
              disabled={!isAdmin}
              min={1800}
              max={2200}
              placeholder="1998"
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900"
            />
          </label>
        </div>

        {isAdmin ? (
          <button
            type="submit"
            disabled={update.isPending}
            className="mt-4 rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {update.isPending ? t("shared.saving") : t("shared.save")}
          </button>
        ) : (
          // Shown rather than a disabled Save with no explanation.
          <p className="mt-4 text-xs text-slate-500">
            {t("schoolProfile.readOnly")}
          </p>
        )}
        {note && <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">{note}</p>}
      </form>
    </div>
  );
}
