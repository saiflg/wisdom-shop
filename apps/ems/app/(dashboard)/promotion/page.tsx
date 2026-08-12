"use client";

import { useMemo, useState } from "react";
import { errorMessage } from "@/lib/api";
import { useClasses } from "@/lib/use-classes";
import {
  useApplyPromotion,
  usePromotionPreview,
  type PromotionChoice,
  type PromotionDecision,
  type PromotionRequest,
  type PromotionResult,
} from "@/lib/use-promotion";

/**
 * End of year: move every child up.
 *
 * Three deliberate frictions, because this rewrites every enrolment in the
 * school at once and the person doing it is usually tired and in a hurry:
 *
 *   1. Nothing happens until the whole plan has been read. Preview is a
 *      separate step and the Apply button does not exist before it.
 *   2. Any child with nowhere to go blocks the whole run. Their class has no
 *      destination, and proceeding would leave them enrolled nowhere while
 *      their classmates moved on — invisible until a register came up short.
 *   3. Applying asks for the destination year to be typed. A misclick that
 *      moves 400 children is not undoable from this screen.
 */

const OUTCOME_STYLE: Record<PromotionDecision["outcome"], string> = {
  PROMOTE: "text-emerald-700 dark:text-emerald-400",
  REPEAT: "text-amber-700 dark:text-amber-400",
  GRADUATE: "text-sky-700 dark:text-sky-400",
  ALREADY_DONE: "text-slate-500",
  NO_TARGET_CLASS: "text-red-700 dark:text-red-400",
  CANNOT_REPEAT: "text-red-700 dark:text-red-400",
};

const GRADUATE_VALUE = "__graduate__";

export default function PromotionPage() {
  const { data: classes } = useClasses();
  const preview = usePromotionPreview();
  const apply = useApplyPromotion();

  const years = useMemo(
    () => [...new Set((classes ?? []).map((c) => c.academicYear))].sort(),
    [classes],
  );

  const [fromYear, setFromYear] = useState("");
  const [toYear, setToYear] = useState("");
  const [mappings, setMappings] = useState<Record<string, string | null>>({});
  const [overrides, setOverrides] = useState<Record<string, PromotionChoice>>({});
  const [confirmYear, setConfirmYear] = useState("");
  const [result, setResult] = useState<PromotionResult | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const fromClasses = (classes ?? []).filter((c) => c.academicYear === fromYear);
  const toClasses = (classes ?? []).filter((c) => c.academicYear === toYear);

  const request = (): PromotionRequest => ({
    fromAcademicYear: fromYear,
    toAcademicYear: toYear,
    classMappings: mappings,
    overrides,
  });

  const runPreview = async () => {
    setProblem(null);
    setResult(null);
    try {
      await preview.mutateAsync(request());
    } catch (err) {
      setProblem(errorMessage(err, "Couldn't work out the plan."));
    }
  };

  const runApply = async () => {
    setProblem(null);
    try {
      setResult(await apply.mutateAsync(request()));
      await preview.mutateAsync(request());
    } catch (err) {
      setProblem(errorMessage(err, "Couldn't move the students."));
    }
  };

  const plan = preview.data;
  const blocked = (plan?.blockers.length ?? 0) > 0;
  const canApply = Boolean(plan) && !blocked && confirmYear.trim() === toYear && plan!.summary.total > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">End of year</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          Move every student into next year&apos;s classes. Choose where each class goes, read the plan,
          then apply it. Nothing changes until you do — and running it twice is safe.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium">Current year</span>
          <select
            value={fromYear}
            onChange={(e) => {
              setFromYear(e.target.value);
              setMappings({});
              setOverrides({});
            }}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="">Choose…</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium">Next year</span>
          <select
            value={toYear}
            onChange={(e) => {
              setToYear(e.target.value);
              setMappings({});
              setConfirmYear("");
            }}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="">Choose…</option>
            {years
              .filter((y) => y !== fromYear)
              .map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
          </select>
        </label>
      </div>

      {fromYear && toYear && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Where does each class go?
          </h2>
          {fromClasses.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
              No classes in {fromYear}.
            </p>
          )}
          {fromClasses.map((cls) => (
            <div
              key={cls.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800"
            >
              <span className="min-w-[8rem] font-medium">{cls.name}</span>
              <span className="text-slate-400">→</span>
              <select
                value={mappings[cls.id] === null ? GRADUATE_VALUE : (mappings[cls.id] ?? "")}
                onChange={(e) =>
                  setMappings((m) => {
                    const next = { ...m };
                    // Three states, not two: a class id means "move there",
                    // null means "leaving the school", and ABSENT means "not
                    // decided". The API treats an absent class as unconfigured
                    // and blocks the run, which is the point — so choosing
                    // "Not decided" must delete the key rather than store
                    // undefined next to a meaningful null.
                    if (e.target.value === GRADUATE_VALUE) next[cls.id] = null;
                    else if (e.target.value) next[cls.id] = e.target.value;
                    else delete next[cls.id];
                    return next;
                  })
                }
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="">Not decided</option>
                {toClasses.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
                <option value={GRADUATE_VALUE}>Leaving the school</option>
              </select>
            </div>
          ))}

          <button
            type="button"
            onClick={() => void runPreview()}
            disabled={preview.isPending || fromClasses.length === 0}
            className="rounded-full bg-brand-gradient px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {preview.isPending ? "Working it out…" : "Show me the plan"}
          </button>
        </div>
      )}

      {problem && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {problem}
        </p>
      )}

      {result && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
          Done — {result.applied} {result.applied === 1 ? "student was" : "students were"} moved.
        </p>
      )}

      {plan && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-4 rounded-xl border border-slate-200 p-4 text-sm dark:border-slate-800">
            <span><strong>{plan.summary.promote}</strong> moving up</span>
            <span><strong>{plan.summary.repeat}</strong> repeating</span>
            <span><strong>{plan.summary.graduate}</strong> leaving</span>
            <span className="text-slate-500"><strong>{plan.summary.alreadyDone}</strong> already done</span>
            {plan.summary.problems > 0 && (
              <span className="text-red-700 dark:text-red-400">
                <strong>{plan.summary.problems}</strong> with nowhere to go
              </span>
            )}
          </div>

          {blocked && (
            <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-300">
              {plan.blockers.length} student(s) have nowhere to go. Choose a destination for every class
              above — leaving them out would enrol them nowhere at all.
            </p>
          )}

          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left dark:bg-slate-900">
                <tr>
                  <th className="px-4 py-2 font-medium">Student</th>
                  <th className="px-4 py-2 font-medium">Now</th>
                  <th className="px-4 py-2 font-medium">What happens</th>
                  <th className="px-4 py-2 font-medium">Change</th>
                </tr>
              </thead>
              <tbody>
                {plan.decisions.map((d) => (
                  <tr key={d.studentProfileId} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-2">{d.studentName}</td>
                    <td className="px-4 py-2 text-slate-500">{d.fromClassName}</td>
                    <td className={`px-4 py-2 ${OUTCOME_STYLE[d.outcome]}`}>{d.reason}</td>
                    <td className="px-4 py-2">
                      {d.outcome === "ALREADY_DONE" ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        <select
                          value={overrides[d.studentProfileId] ?? ""}
                          onChange={(e) => {
                            const v = e.target.value as PromotionChoice | "";
                            setOverrides((o) => {
                              const next = { ...o };
                              if (v) next[d.studentProfileId] = v;
                              else delete next[d.studentProfileId];
                              return next;
                            });
                          }}
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                        >
                          <option value="">As class</option>
                          <option value="PROMOTE">Move up</option>
                          <option value="REPEAT">Repeat</option>
                          <option value="GRADUATE">Leaving</option>
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {Object.keys(overrides).length > 0 && (
            <button
              type="button"
              onClick={() => void runPreview()}
              className="rounded-full border border-slate-300 px-4 py-1.5 text-sm dark:border-slate-700"
            >
              Update the plan with my changes
            </button>
          )}

          {!blocked && plan.summary.total > 0 && (
            <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50/60 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
              <p className="text-sm">
                This will move {plan.summary.promote + plan.summary.repeat + plan.summary.graduate} student
                record(s). Type <strong>{toYear}</strong> to confirm.
              </p>
              <div className="flex flex-wrap gap-2">
                <label htmlFor="confirm-year" className="sr-only">
                  Type the destination year to confirm
                </label>
                <input
                  id="confirm-year"
                  value={confirmYear}
                  onChange={(e) => setConfirmYear(e.target.value)}
                  placeholder={toYear}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
                <button
                  type="button"
                  onClick={() => void runApply()}
                  disabled={!canApply || apply.isPending}
                  className="rounded-full bg-brand-gradient px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {apply.isPending ? "Moving students…" : "Apply"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
