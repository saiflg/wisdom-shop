"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import {
  useSettings,
  useTestEmail,
  useUpdateSettings,
  type SettingEntry,
} from "@/lib/use-settings";

function SourceBadge({ entry }: { entry: SettingEntry }) {
  if (entry.source === "database") {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
        Saved here
      </span>
    );
  }
  if (entry.source === "environment") {
    return (
      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800 dark:bg-sky-950/60 dark:text-sky-300">
        From environment
      </span>
    );
  }
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
      Not set
    </span>
  );
}

export function SettingsPanel() {
  const user = useAuthStore((s) => s.user);
  const isSuperAdmin = user?.roles.includes("SUPER_ADMIN") ?? false;

  const { data, isLoading, error } = useSettings();
  const update = useUpdateSettings();
  const testEmail = useTestEmail();

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!isSuperAdmin) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
        <p className="font-medium">Only a super admin can change these settings</p>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          They include payment credentials and mail server access, so they sit behind a
          narrower gate than the rest of the admin area.
        </p>
      </div>
    );
  }

  if (isLoading) return <p className="text-sm text-slate-600 dark:text-slate-400">Loading settings…</p>;

  if (error) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
        Couldn&apos;t load settings: {error.message}
      </p>
    );
  }

  if (!data) return null;

  async function handleSave(group: string) {
    setSaveError(null);
    setSaved(false);

    const values: Record<string, string> = {};
    for (const entry of data!.settings.filter((s) => s.group === group)) {
      const draft = drafts[entry.key];
      // Only fields the admin actually touched are sent. Sending untouched
      // secret fields would submit the empty string and wipe stored keys.
      if (draft !== undefined) values[entry.key] = draft;
    }
    if (Object.keys(values).length === 0) return;

    try {
      await update.mutateAsync(values);
      // Drop the drafts for this group so the fields fall back to showing the
      // stored (masked) state rather than the plaintext just typed.
      setDrafts((current) => {
        const next = { ...current };
        for (const key of Object.keys(values)) delete next[key];
        return next;
      });
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Couldn't save those settings.");
    }
  }

  const inputClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900";

  return (
    <div className="space-y-8">
      {saveError && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {saveError}
        </p>
      )}
      {saved && (
        <p role="status" className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          Settings saved. They take effect immediately — no restart needed.
        </p>
      )}

      {data.groups.map((group) => {
        const entries = data.settings.filter((s) => s.group === group.id);

        return (
          <section
            key={group.id}
            className="rounded-2xl border border-slate-200 p-5 sm:p-6 dark:border-slate-800"
          >
            <h2 className="text-lg font-semibold">{group.label}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{group.description}</p>

            <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
              {entries.map((entry) => (
                <div key={entry.key}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label htmlFor={entry.key} className="text-sm font-medium">
                      {entry.label}
                    </label>
                    <SourceBadge entry={entry} />
                  </div>

                  <input
                    id={entry.key}
                    type={entry.secret ? "password" : entry.type === "number" ? "number" : "text"}
                    autoComplete="off"
                    className={`mt-1.5 ${inputClass}`}
                    // A secret is never sent to the browser, so the field shows
                    // the mask as a placeholder and stays empty: typing replaces
                    // the value, leaving it alone keeps what is stored.
                    placeholder={
                      entry.secret && entry.configured
                        ? `${entry.value} — leave blank to keep`
                        : (entry.placeholder ?? "")
                    }
                    value={drafts[entry.key] ?? (entry.secret ? "" : (entry.value ?? ""))}
                    onChange={(e) =>
                      setDrafts((current) => ({ ...current, [entry.key]: e.target.value }))
                    }
                  />

                  {entry.help && <p className="mt-1 text-xs text-slate-500">{entry.help}</p>}
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => handleSave(group.id)}
                disabled={update.isPending}
                className="rounded-lg bg-brand-gradient px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {update.isPending ? "Saving…" : `Save ${group.label.toLowerCase()}`}
              </button>

              {group.id === "email" && (
                <button
                  type="button"
                  onClick={() => testEmail.mutate()}
                  disabled={testEmail.isPending}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium transition hover:border-brand-400 disabled:opacity-60 dark:border-slate-700"
                >
                  {testEmail.isPending ? "Testing…" : "Test connection"}
                </button>
              )}

              {group.id === "email" && testEmail.data && (
                <span
                  role="status"
                  className={
                    testEmail.data.ok
                      ? "text-sm text-emerald-700 dark:text-emerald-400"
                      : "text-sm text-red-700 dark:text-red-400"
                  }
                >
                  {testEmail.data.message}
                </span>
              )}
            </div>

            {group.id === "payments" && (
              <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                Keys are encrypted before they are stored and are never sent back to this
                page — the masked hint is all the server will return. Saving a blank field
                keeps the current value; to remove a key entirely, clear it and save while
                no environment variable is set for it.
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
