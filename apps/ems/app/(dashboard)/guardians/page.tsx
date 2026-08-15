"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { errorMessage } from "@/lib/api";
import { useGuardianDirectory } from "@/lib/use-guardians";
import { filterGuardians, householdSummary, neverSignedIn, unreachable, withoutEmail } from "@/lib/guardian-directory";
import { PersonPhoto } from "@/components/person-photo";
import { GuardianInvite } from "@/components/guardian-invite";
import { GuardianContact } from "@/components/guardian-contact";

/**
 * Every family in the school.
 *
 * One row per parent, not per child, so a mother of three is one row with
 * three children on it rather than three near-identical rows.
 */
export default function GuardiansPage() {
  const { data: guardians, isLoading, error } = useGuardianDirectory();
  const [query, setQuery] = useState("");

  const shown = useMemo(() => filterGuardians(guardians ?? [], query), [guardians, query]);
  const noEmail = useMemo(() => withoutEmail(guardians ?? []), [guardians]);
  const cannotReach = useMemo(() => unreachable(guardians ?? []), [guardians]);
  const waiting = useMemo(() => neverSignedIn(guardians ?? []), [guardians]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Parents and guardians</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          Search by a parent&apos;s name or by their child&apos;s — somebody ringing about a pupil rarely gives
          their own name first.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="guardian-search" className="sr-only">
          Search parents and children
        </label>
        <input
          id="guardian-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search a parent or a child…"
          className="min-w-[16rem] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
        {guardians && (
          <span className="text-sm text-slate-500">
            {shown.length} of {guardians.length}
          </span>
        )}
      </div>

      {/* Surfaced before somebody sends an email announcement and assumes it
          arrived. These parents need a phone call or a letter home. */}
      {noEmail.length > 0 && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          {noEmail.length} {noEmail.length === 1 ? "family has" : "families have"} no email address on file — an
          emailed announcement will not reach them.
          {cannotReach.length > 0 && (
            <>
              {" "}
              <strong>
                {cannotReach.length} of {noEmail.length === cannotReach.length ? "those" : "them"} have no phone
                number either, so there is no way to reach them at all.
              </strong>
            </>
          )}
        </p>
      )}

      {/* The other half of the same problem: the school believes these
          families can see their child's marks, and they cannot. */}
      {waiting.length > 0 && (
        <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700 dark:bg-slate-900 dark:text-slate-300">
          {waiting.length} {waiting.length === 1 ? "parent has" : "parents have"} never signed in. Invite them
          below so they can see attendance, homework and results.
        </p>
      )}

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {errorMessage(error, "Couldn't load the parent directory.")}
        </p>
      )}

      {guardians && guardians.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
          No guardians recorded yet. Guardians are added from a student&apos;s record.
        </p>
      )}

      {guardians && guardians.length > 0 && shown.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
          Nobody matches “{query}”.
        </p>
      )}

      <ul className="space-y-2">
        {shown.map((guardian) => (
          <li
            key={guardian.guardianUserId}
            className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800"
          >
            <PersonPhoto
              userId={guardian.guardianUserId}
              name={`${guardian.firstName} ${guardian.lastName}`}
              size="md"
            />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {guardian.firstName} {guardian.lastName}
              </p>
              <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">{householdSummary(guardian)}</p>
              <GuardianContact guardian={guardian} />

              {guardian.children.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {guardian.children.map((child) => (
                    <li key={child.linkId}>
                      <Link
                        href={`/students/${child.studentProfileId}`}
                        className="rounded-full bg-slate-100 px-3 py-1 text-xs transition hover:bg-brand-100 dark:bg-slate-800 dark:hover:bg-brand-950/40"
                      >
                        {child.name}
                        {child.className && ` · ${child.className}`}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}

              <GuardianInvite guardian={guardian} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
