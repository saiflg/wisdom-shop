"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/i18n-provider";
import { FormField } from "@/components/form-field";
import { brandRamp } from "@/lib/branding";
import {
  useBrandingSettings,
  useRemoveLogo,
  useUpdateBranding,
  useUploadLogo,
} from "@/lib/use-branding-settings";

const SAVE_BUTTON =
  "rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60";
const SECONDARY_BUTTON =
  "rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-900";

export default function BrandingSettingsPage() {
  const { t } = useTranslation();
  const { data, isLoading, error } = useBrandingSettings();
  const update = useUpdateBranding();
  const uploadLogo = useUploadLogo();
  const removeLogo = useRemoveLogo();
  const fileInput = useRef<HTMLInputElement>(null);

  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  // Controlled, unlike the gateway forms: the preview has to repaint as the
  // colour picker moves, which means the value has to live in React.
  const [primaryColor, setPrimaryColor] = useState("#1d4ed8");
  const [accentColor, setAccentColor] = useState("#0f766e");

  useEffect(() => {
    if (!data) return;
    setPrimaryColor(data.primaryColor);
    setAccentColor(data.accentColor);
  }, [data]);

  if (isLoading) return <p className="text-sm text-slate-600 dark:text-slate-400">{t("common.loading")}</p>;
  if (error) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
        {error.message}
      </p>
    );
  }
  if (!data) return null;

  const fromError = (err: unknown, fallback: string) =>
    setMessage({ tone: "error", text: err instanceof ApiError ? err.message : fallback });

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    const form = new FormData(event.currentTarget);
    try {
      await update.mutateAsync({
        displayName: String(form.get("displayName") ?? ""),
        tagline: String(form.get("tagline") ?? ""),
        primaryColor,
        accentColor,
      });
      // A full reload, not a router.refresh(): the colours are served in a
      // <style> the root layout renders per request, and the point of saving
      // is to see the whole console change, not just this page's preview.
      window.location.reload();
    } catch (err) {
      fromError(err, t("settings.saveFailed"));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">School branding</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          Your name, logo and colours, as staff and families see them — on this console and on your
          school&apos;s sign-in page.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
        <h2 className="mb-4 text-lg font-semibold">Logo</h2>
        <div className="flex flex-wrap items-center gap-4">
          {data.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.logoUrl}
              alt={`${data.schoolName} logo`}
              className="h-16 w-16 rounded-lg object-contain"
            />
          ) : (
            <span className="flex h-16 w-16 items-center justify-center rounded-lg bg-brand-600 text-2xl font-bold text-on-brand">
              {data.schoolName.trim().charAt(0).toUpperCase()}
            </span>
          )}
          <div className="space-y-2">
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="block text-sm file:me-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-on-brand"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setMessage(null);
                try {
                  await uploadLogo.mutateAsync(file);
                  setMessage({ tone: "ok", text: "Logo updated." });
                } catch (err) {
                  fromError(err, "Could not upload that logo.");
                } finally {
                  // Clear it, or picking the same file twice fires no change
                  // event and the second attempt looks like nothing happened.
                  if (fileInput.current) fileInput.current.value = "";
                }
              }}
            />
            <p className="text-xs text-slate-500">
              PNG, JPEG or WebP, up to 2MB. SVG is not accepted — an SVG can carry a script, and this
              image is shown on a page anyone can open.
            </p>
            {data.logoUrl && (
              <button
                type="button"
                className={SECONDARY_BUTTON}
                disabled={removeLogo.isPending}
                onClick={async () => {
                  setMessage(null);
                  try {
                    await removeLogo.mutateAsync();
                    setMessage({ tone: "ok", text: "Logo removed." });
                  } catch (err) {
                    fromError(err, "Could not remove the logo.");
                  }
                }}
              >
                Remove logo
              </button>
            )}
          </div>
        </div>
      </section>

      <form onSubmit={onSubmit} className="space-y-6">
        <section className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
          <h2 className="mb-4 text-lg font-semibold">Name and colours</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Display name"
              name="displayName"
              defaultValue={data.schoolName}
              hint="Leave blank to use the name your school is registered under"
            />
            <FormField
              label="Tagline"
              name="tagline"
              defaultValue={data.tagline ?? ""}
              hint="One line, shown under your name on the sign-in page"
            />
            <ColorField label="Primary colour" value={primaryColor} onChange={setPrimaryColor} />
            <ColorField label="Accent colour" value={accentColor} onChange={setAccentColor} />
          </div>
        </section>

        <Preview primaryColor={primaryColor} accentColor={accentColor} schoolName={data.schoolName} />

        {message && (
          <p
            role={message.tone === "error" ? "alert" : undefined}
            className={
              message.tone === "error"
                ? "rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400"
                : "text-sm text-emerald-600 dark:text-emerald-400"
            }
          >
            {message.text}
          </p>
        )}

        <button type="submit" disabled={update.isPending} className={SAVE_BUTTON}>
          {t("common.save")}
        </button>
      </form>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium">{label}</label>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          type="color"
          value={value}
          aria-label={`${label} picker`}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 w-12 cursor-pointer rounded border border-slate-300 bg-white dark:border-slate-700"
        />
        <input
          type="text"
          value={value}
          aria-label={label}
          onChange={(event) => onChange(event.target.value)}
          className="w-32 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
        />
      </div>
    </div>
  );
}

/**
 * Shows the chosen colours before they are saved.
 *
 * Scoped to this element rather than `:root` — writing the live variables
 * would repaint the whole console from an unsaved colour, and an admin who
 * navigated away mid-experiment would take that colour with them.
 */
function Preview({
  primaryColor,
  accentColor,
  schoolName,
}: {
  primaryColor: string;
  accentColor: string;
  schoolName: string;
}) {
  const valid = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(primaryColor);
  const ramp = valid ? brandRamp(primaryColor) : null;

  return (
    <section className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
      <h2 className="mb-4 text-lg font-semibold">Preview</h2>
      {!valid ? (
        <p className="text-sm text-amber-700 dark:text-amber-500">
          Enter a hex colour such as #1d4ed8 to see the preview.
        </p>
      ) : (
        <div
          style={ramp as React.CSSProperties}
          className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-600 text-xl font-bold text-white">
            {schoolName.trim().charAt(0).toUpperCase()}
          </span>
          <button
            type="button"
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
            style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, ${accentColor} 100%)` }}
          >
            Primary action
          </button>
          <span className="rounded-lg bg-brand-100 px-3 py-1.5 text-sm font-medium text-brand-700">
            Highlight
          </span>
        </div>
      )}
    </section>
  );
}
