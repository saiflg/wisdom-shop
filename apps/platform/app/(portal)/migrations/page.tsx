"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { useApplyMigrations, useMigrationStatus, type SchoolDrift } from "@/lib/use-migrations";

const TONE: Record<SchoolDrift["level"], string> = {
  UP_TO_DATE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  BEHIND: "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  UNREACHABLE: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  AHEAD: "bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300",
};

const LABEL: Record<SchoolDrift["level"], string> = {
  UP_TO_DATE: "up to date",
  BEHIND: "behind",
  UNREACHABLE: "unreachable",
  AHEAD: "ahead of this build",
};

/**
 * Which schools' databases are level with the code.
 *
 * `prisma migrate deploy` runs once, when a school is provisioned. Nothing
 * re-runs it — so a migration added today reaches only schools created after
 * today, and the first symptom is a 500 on a screen that works for newer
 * customers. This page is the thing that makes that visible before a customer
 * finds it.
 */
export default function MigrationsPage() {
  const { data, isLoading, error, refetch, isFetching } = useMigrationStatus();
  const apply = useApplyMigrations();
  const [message, setMessage] = useState<string | null>(null);

  const run = async (schoolId?: string) => {
    setMessage(null);
    try {
      const result = await apply.mutateAsync(schoolId);
      setMessage(
        result.attempted === 0
          ? "Nothing needed migrating."
          : `${result.succeeded} of ${result.attempted} migrated${result.failed ? `, ${result.failed} failed` : ""}.`,
      );
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Couldn't run the migrations.");
    }
  };

  const behind = (data?.schools ?? []).filter((school) => school.level === "BEHIND");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Database migrations</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            Migrations run when a school is created and never again on their own. A school created before a
            release does not have that release&apos;s tables until it is migrated here.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          {isFetching ? "Checking…" : "Re-check"}
        </button>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Reading every school&apos;s database…</p>}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {error instanceof Error ? error.message : "Couldn't check the schools."}
        </p>
      )}

      {data && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <div>
              <p className="text-lg font-semibold">{data.summary.headline}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {data.summary.total} school{data.summary.total === 1 ? "" : "s"} · this build ships{" "}
                {data.migrationsInThisBuild} migrations
              </p>
            </div>
            {behind.length > 0 && (
              <button
                type="button"
                onClick={() => void run()}
                disabled={apply.isPending}
                className="rounded-lg bg-platform-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-platform-500 disabled:opacity-50"
              >
                {apply.isPending ? "Migrating…" : `Migrate ${behind.length} school${behind.length === 1 ? "" : "s"}`}
              </button>
            )}
          </div>

          {message && <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{message}</p>}

          <ul className="space-y-2">
            {data.schools.map((school) => (
              <li
                key={school.schoolId}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800"
              >
                <div className="min-w-0">
                  <p className="font-semibold">
                    {school.name}{" "}
                    <span className="font-normal text-slate-500">/{school.slug}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">{school.summary}</p>

                  {/* Named, not counted. "Behind by 3" tells an operator to
                      press a button; the names tell them what will change. */}
                  {school.pending.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5">
                      {school.pending.map((name) => (
                        <li key={name} className="font-mono text-xs text-slate-500">
                          {name}
                        </li>
                      ))}
                    </ul>
                  )}

                  {school.level === "AHEAD" && (
                    <p className="mt-1.5 max-w-lg text-xs text-violet-700 dark:text-violet-300">
                      This database has migrations this build does not. That means the code is older than the
                      database — a rollback, or a deploy from the wrong branch. Migrating will not fix it.
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${TONE[school.level]}`}>
                    {LABEL[school.level]}
                  </span>
                  {school.level === "BEHIND" && (
                    <button
                      type="button"
                      onClick={() => void run(school.schoolId)}
                      disabled={apply.isPending}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      Migrate
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <p className="text-xs text-slate-500">
            Schools are migrated one at a time. A failure on one does not stop the others, and every attempt is
            recorded in that school&apos;s provisioning history.
          </p>
        </>
      )}
    </div>
  );
}
