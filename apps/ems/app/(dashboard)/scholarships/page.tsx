"use client";

import { useMemo, useState } from "react";
import { errorMessage } from "@/lib/api";
import { useStudents } from "@/lib/use-students";
import {
  useAwardScholarship,
  useScholarships,
  useWithdrawScholarship,
  type DiscountKind,
  type Scholarship,
} from "@/lib/use-discounts";

/**
 * Standing awards: who has one, what it is worth, and what it has done.
 *
 * A scholarship is a decision about a child rather than about a bill, so it
 * lives here rather than on an invoice. The number that matters on this
 * screen is how many bills each has actually reduced — an award granted and
 * never applied is either a mistake or a child who was never invoiced, and
 * both are worth somebody noticing.
 */
export default function ScholarshipsPage() {
  const { data: awards, isLoading } = useScholarships();
  const { data: students } = useStudents();
  const award = useAwardScholarship();
  const withdraw = useWithdrawScholarship();

  const [open, setOpen] = useState(false);
  const [studentProfileId, setStudent] = useState("");
  const [name, setName] = useState("");
  const [sponsor, setSponsor] = useState("");
  const [kind, setKind] = useState<DiscountKind>("PERCENT");
  const [value, setValue] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const active = useMemo(() => (awards ?? []).filter((a) => a.status === "ACTIVE"), [awards]);
  const ended = useMemo(() => (awards ?? []).filter((a) => a.status !== "ACTIVE"), [awards]);
  const unused = active.filter((a) => a.timesApplied === 0);

  const grant = async () => {
    setProblem(null);
    const parsed = Number(value);
    try {
      await award.mutateAsync({
        studentProfileId,
        name: name.trim(),
        sponsor: sponsor.trim() || undefined,
        kind,
        value: kind === "PERCENT" ? Math.round(parsed) : Math.round(parsed * 100),
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      setOpen(false);
      setName("");
      setSponsor("");
      setValue("");
      setStudent("");
    } catch (err) {
      setProblem(errorMessage(err, "Couldn't award that scholarship."));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Scholarships</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            A standing award reduces every invoice raised while it runs, including bills that do not exist yet.
            For money off one bill only, use the discount on that invoice.
          </p>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Award a scholarship
          </button>
        )}
      </div>

      {open && (
        <div className="space-y-3 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Student
              <select
                value={studentProfileId}
                onChange={(event) => setStudent(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="">Choose a student…</option>
                {(students ?? []).map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.user.firstName} {student.user.lastName}
                    {student.studentCode ? ` · ${student.studentCode}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-medium">
              What is it called?
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Founder's Scholarship"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </label>

            <label className="text-sm font-medium">
              Who is funding it? (optional)
              <input
                value={sponsor}
                onChange={(event) => setSponsor(event.target.value)}
                placeholder="Al-Madina Foundation"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </label>

            <div className="flex gap-2">
              <label className="text-sm font-medium">
                Kind
                <select
                  value={kind}
                  onChange={(event) => setKind(event.target.value as DiscountKind)}
                  className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="PERCENT">Percentage</option>
                  <option value="FIXED">An amount</option>
                </select>
              </label>
              <label className="flex-1 text-sm font-medium">
                {kind === "PERCENT" ? "Per cent off" : "Amount off each bill"}
                <input
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  inputMode="decimal"
                  placeholder={kind === "PERCENT" ? "50" : "25000"}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
              </label>
            </div>

            <label className="text-sm font-medium">
              From (optional)
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
            <label className="text-sm font-medium">
              Until (optional)
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
              <span className="text-xs text-slate-500">Leave empty to run until it is withdrawn.</span>
            </label>
          </div>

          {problem && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{problem}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void grant()}
              disabled={award.isPending || !studentProfileId || !name.trim() || !value.trim()}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
            >
              {award.isPending ? "Awarding…" : "Award it"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Worth a nudge rather than a warning: an award that has never reduced
          a bill is either a mistake or a child nobody has invoiced yet. */}
      {unused.length > 0 && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          {unused.length === 1 ? "1 award has" : `${unused.length} awards have`} never reduced a bill. That
          happens when the student has not been invoiced since it was granted.
        </p>
      )}

      {isLoading && <p className="text-sm text-slate-500">Loading awards…</p>}
      {awards && awards.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
          No scholarships awarded yet.
        </p>
      )}

      {active.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Running</h2>
          <ul className="mt-2 space-y-2">
            {active.map((scholarship) => (
              <AwardRow
                key={scholarship.id}
                scholarship={scholarship}
                onWithdraw={(reason) => void withdraw.mutateAsync({ id: scholarship.id, reason })}
              />
            ))}
          </ul>
        </section>
      )}

      {ended.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Withdrawn</h2>
          {/* Kept rather than deleted: the discounts these already granted are
              still on invoices the school has sent, and it has to explain them. */}
          <ul className="mt-2 space-y-2">
            {ended.map((scholarship) => (
              <AwardRow key={scholarship.id} scholarship={scholarship} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function AwardRow({
  scholarship,
  onWithdraw,
}: {
  scholarship: Scholarship;
  onWithdraw?: (reason: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <li className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">
            {scholarship.studentName}
            <span className="ml-2 font-normal text-slate-500">{scholarship.name}</span>
          </p>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
            {scholarship.describedAs}
            {scholarship.sponsor ? ` · funded by ${scholarship.sponsor}` : ""}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {scholarship.timesApplied === 0
              ? "Has not reduced a bill yet"
              : `Reduced ${scholarship.timesApplied} ${scholarship.timesApplied === 1 ? "bill" : "bills"}`}
            {scholarship.awardedByName ? ` · awarded by ${scholarship.awardedByName}` : ""}
          </p>
          {scholarship.withdrawnReason && (
            <p className="mt-0.5 text-xs italic text-slate-500">“{scholarship.withdrawnReason}”</p>
          )}
        </div>

        {onWithdraw && !confirming && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="shrink-0 text-xs font-semibold text-brand-600 hover:underline"
          >
            Withdraw
          </button>
        )}
      </div>

      {confirming && onWithdraw && (
        <div className="mt-3 space-y-2 border-t border-slate-200 pt-3 dark:border-slate-700">
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Future invoices will be charged in full. Bills already reduced by this award are left exactly as
            they are.
          </p>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why is it ending?"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { onWithdraw(reason); setConfirming(false); }}
              disabled={reason.trim().length < 3}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              Withdraw it
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold dark:border-slate-700"
            >
              Keep it
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
