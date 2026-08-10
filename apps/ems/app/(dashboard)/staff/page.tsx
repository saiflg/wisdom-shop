"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useStaff } from "@/lib/use-staff";
import { PersonPhoto } from "@/components/person-photo";
import {
  bankSummary,
  employmentState,
  employmentSummary,
  filterStaff,
  isTeaching,
  missingBankDetails,
  type StaffGroup,
} from "@/lib/staff-directory";

const GROUPS: { value: StaffGroup; label: string }[] = [
  { value: "all", label: "Everyone" },
  { value: "teaching", label: "Teaching" },
  { value: "non-teaching", label: "Non-teaching" },
];

const BADGE = "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold";

export default function StaffDirectoryPage() {
  const searchParams = useSearchParams();
  const { data: staff, isLoading, error } = useStaff();

  // The nav has a separate "Non-teaching staff" entry, and it lands here with
  // the filter already applied rather than on a near-identical second page.
  const [group, setGroup] = useState<StaffGroup>(
    searchParams.get("group") === "non-teaching" ? "non-teaching" : "all",
  );
  const [query, setQuery] = useState("");

  const today = useMemo(() => new Date(), []);
  const visible = useMemo(() => filterStaff(staff ?? [], { query, group }), [staff, query, group]);
  const unpayable = useMemo(() => missingBankDetails(staff ?? [], today), [staff, today]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Staff directory</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            Everyone with a staff login, teaching and non-teaching. Bank details are shown here only as whether
            an account is on file — the number itself lives behind a reason and a log entry.
          </p>
        </div>
        <Link
          href="/staff/new"
          className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Register staff
        </Link>
      </div>

      {staff && staff.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Staff" value={String(staff.length)} />
          <Stat label="Teaching" value={String(staff.filter(isTeaching).length)} />
          <Stat
            label="No bank account"
            value={String(unpayable.length)}
            tone={unpayable.length > 0 ? "warn" : "ok"}
            hint={unpayable.length > 0 ? "payroll would skip them" : "everyone can be paid"}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-slate-200 p-1 dark:border-slate-800">
          {GROUPS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setGroup(option.value)}
              aria-pressed={group === option.value}
              className={
                group === option.value
                  ? "rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white"
                  : "rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-900"
              }
            >
              {option.label}
            </button>
          ))}
        </div>

        <label className="min-w-[14rem] flex-1 text-sm">
          <span className="sr-only">Search staff</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, staff number, job title or email"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Loading staff…</p>}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          Couldn&apos;t load the staff directory: {error.message}
        </p>
      )}

      {staff && staff.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
          Nobody has a staff record yet. Register the first one to get started.
        </p>
      )}

      {staff && staff.length > 0 && visible.length === 0 && (
        <p className="text-sm text-slate-500">Nobody matches that.</p>
      )}

      <ul className="space-y-2">
        {visible.map((member) => {
          const state = employmentState(member, today);
          return (
            <li key={member.id}>
              <Link
                href={`/staff/${member.id}`}
                className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-4 transition hover:border-brand-400 dark:border-slate-800"
              >
                <PersonPhoto userId={member.id} name={`${member.firstName} ${member.lastName}`} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">
                      {member.firstName} {member.lastName}
                    </span>
                    {state === "ENDED" && (
                      <span className={`${BADGE} bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300`}>
                        left
                      </span>
                    )}
                    {state === "FUTURE" && (
                      <span className={`${BADGE} bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300`}>
                        not started
                      </span>
                    )}
                    {!isTeaching(member) && (
                      <span className={`${BADGE} bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300`}>
                        non-teaching
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">{employmentSummary(member)}</span>
                </span>
                <span
                  className={
                    member.bank.hasAccountNumber
                      ? "shrink-0 text-xs text-slate-500"
                      : "shrink-0 text-xs font-semibold text-amber-600 dark:text-amber-400"
                  }
                >
                  {bankSummary(member)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-slate-500">
        Looking for who has read someone&apos;s bank details? That is the{" "}
        <Link href="/staff/access-log" className="font-semibold text-brand-600 hover:underline">
          bank-detail access log
        </Link>
        .
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "ok",
  hint,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={
          tone === "warn"
            ? "mt-1 text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400"
            : "mt-1 text-2xl font-bold tabular-nums"
        }
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
