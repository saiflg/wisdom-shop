"use client";

import { useMemo, useState } from "react";
import { ApiError } from "@/lib/api";
import { useModuleCatalog, useSetSchoolModules, type SchoolDetail } from "@/lib/use-schools";

/**
 * What this school may use.
 *
 * Shows three different things that are easy to confuse and expensive to
 * confuse: what the plan grants, what somebody changed for this school
 * specifically, and what the school therefore actually has. An operator
 * about to answer "why can't they see payroll?" needs all three.
 *
 * Switching a module off here is not cosmetic. The API refuses those routes
 * for this school from the moment it is saved — hiding the menu item is the
 * courtesy, the 403 is the control.
 */
export function SchoolModulesPanel({ school }: { school: SchoolDetail }) {
  const { data: catalog, isLoading } = useModuleCatalog();
  const save = useSetSchoolModules(school.id);

  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const enabled = useMemo(() => new Set(school.modules), [school.modules]);
  const planGrants = useMemo(() => new Set(school.planModules), [school.planModules]);

  const isOn = (key: string) => pending[key] ?? enabled.has(key);
  /** Entries rather than keys, so each change carries its value and stays typed. */
  const changed = Object.entries(pending).filter(([key, on]) => on !== enabled.has(key));

  const groups = useMemo(() => {
    const byGroup = new Map<string, NonNullable<typeof catalog>>();
    for (const item of catalog ?? []) {
      const list = byGroup.get(item.group) ?? [];
      list.push(item);
      byGroup.set(item.group, list);
    }
    return [...byGroup.entries()];
  }, [catalog]);

  const submit = async () => {
    setMessage(null);
    try {
      await save.mutateAsync({
        modules: changed.map(([key, on]) => ({ module: key, enabled: on })),
        reason: reason.trim(),
      });
      setPending({});
      setReason("");
      setMessage({ tone: "ok", text: "Saved. This school's access changed immediately." });
    } catch (err) {
      setMessage({
        tone: "error",
        text: err instanceof ApiError ? err.message : "Couldn't change those modules.",
      });
    }
  };

  if (isLoading) return <p className="text-sm text-slate-500">Loading modules…</p>;

  return (
    <section className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
      <h2 className="text-lg font-semibold">Modules</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        What this school can use. Anything switched off is refused by the API, not merely hidden from the menu.
      </p>

      <div className="mt-4 space-y-5">
        {groups.map(([group, modules]) => (
          <div key={group}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{group}</h3>
            <ul className="mt-2 space-y-2">
              {modules.map((item) => {
                const on = isOn(item.key);
                const overridden = !item.core && planGrants.has(item.key) !== on;
                return (
                  <li
                    key={item.key}
                    className="flex items-start gap-3 rounded-lg border border-slate-200 px-4 py-3 dark:border-slate-800"
                  >
                    <input
                      type="checkbox"
                      id={`module-${item.key}`}
                      checked={on}
                      disabled={item.core}
                      onChange={(event) => setPending((current) => ({ ...current, [item.key]: event.target.checked }))}
                      className="mt-1 h-4 w-4 shrink-0 accent-platform-600 disabled:opacity-40"
                    />
                    <label htmlFor={`module-${item.key}`} className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {item.label}
                        {item.core && (
                          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            always on
                          </span>
                        )}
                        {overridden && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                            {on ? "added for this school" : "removed for this school"}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">{item.description}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {changed.length > 0 && (
        <div className="mt-5 space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
            {changed.length} change{changed.length === 1 ? "" : "s"} not yet saved.
          </p>
          <label htmlFor="module-reason" className="block text-sm font-medium">
            Why
            <input
              id="module-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Upgraded to Premium on the August renewal"
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
            <span className="mt-1 block text-xs font-normal text-slate-500">
              Recorded against your account, once per module changed.
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={save.isPending || reason.trim().length < 4}
              className="rounded-lg bg-platform-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-platform-500 disabled:opacity-50"
            >
              {save.isPending ? "Saving…" : "Save modules"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPending({});
                setReason("");
              }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={message.tone === "ok" ? "mt-4 text-sm text-emerald-600" : "mt-4 text-sm text-red-600"}
        >
          {message.text}
        </p>
      )}

      {school.moduleChanges.length > 0 && (
        <details className="mt-5">
          <summary className="cursor-pointer text-sm font-medium text-slate-600 hover:underline dark:text-slate-400">
            Module history ({school.moduleChanges.length})
          </summary>
          <ul className="mt-3 space-y-2">
            {school.moduleChanges.map((change) => (
              <li key={change.id} className="rounded-lg border border-slate-200 px-4 py-2 text-sm dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs">{change.module}</span>
                  <span
                    className={
                      change.enabled
                        ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                        : "rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-400"
                    }
                  >
                    {change.enabled ? "enabled" : "disabled"}
                  </span>
                  <span className="ml-auto text-xs text-slate-500">
                    {new Date(change.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1">{change.reason}</p>
                <p className="mt-0.5 text-xs text-slate-500">by {change.actorEmail}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
