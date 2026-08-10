"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { useUpdateSchool, type SchoolDetail } from "@/lib/use-schools";

/**
 * Editing a school's own details.
 *
 * Only two fields, and the absence of the rest is the design. `slug` seeded
 * the database name and is what a user types at login; `databaseName` is
 * where the school's data physically lives. Neither can be edited here
 * because changing them in this table would not move anything — it would
 * simply make the row disagree with reality.
 */
export function SchoolDetailsPanel({ school }: { school: SchoolDetail }) {
  const update = useUpdateSchool(school.id);
  const [name, setName] = useState(school.name);
  const [customDomain, setCustomDomain] = useState(school.customDomain ?? "");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    setName(school.name);
    setCustomDomain(school.customDomain ?? "");
  }, [school]);

  const dirty = name.trim() !== school.name || customDomain.trim() !== (school.customDomain ?? "");

  const save = async () => {
    setMessage(null);
    try {
      await update.mutateAsync({ name: name.trim(), customDomain: customDomain.trim() });
      setMessage({ tone: "ok", text: "Saved." });
    } catch (err) {
      setMessage({
        tone: "error",
        text: err instanceof ApiError ? err.message : "Couldn't save those details.",
      });
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
      <h2 className="text-lg font-semibold">School details</h2>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-platform-500 focus:ring-2 focus:ring-platform-500/20 dark:border-slate-700 dark:bg-slate-900"
          />
          <span className="mt-1 block text-xs font-normal text-slate-500">
            Shown on the school&apos;s own login page and console.
          </span>
        </label>

        <label className="block text-sm font-medium">
          Custom domain
          <input
            value={customDomain}
            onChange={(event) => setCustomDomain(event.target.value)}
            placeholder="portal.stmarys.sch.ng"
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-platform-500 focus:ring-2 focus:ring-platform-500/20 dark:border-slate-700 dark:bg-slate-900"
          />
          <span className="mt-1 block text-xs font-normal text-slate-500">
            A domain the school owns and points at us. Clear it to remove. A certificate for it is a deployment
            step, not something this saves.
          </span>
        </label>
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <Fact label="Slug" value={school.slug} hint="Not editable — it named the database" />
        <Fact label="Database" value={school.databaseName} />
        <Fact label="Created" value={new Date(school.createdAt).toLocaleDateString()} />
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={update.isPending || !dirty || name.trim().length < 2}
          className="rounded-lg bg-platform-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-platform-500 disabled:opacity-50"
        >
          {update.isPending ? "Saving…" : "Save details"}
        </button>
        {message && (
          <p
            role={message.tone === "error" ? "alert" : "status"}
            className={message.tone === "ok" ? "text-sm text-emerald-600" : "text-sm text-red-600"}
          >
            {message.text}
          </p>
        )}
      </div>
    </section>
  );
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900">
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-all font-mono text-xs">{value}</dd>
      {hint && <dd className="mt-1 text-xs text-slate-500">{hint}</dd>}
    </div>
  );
}
