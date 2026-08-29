"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { useIsSchoolAdmin } from "@/lib/use-can-author";
import { useStaff } from "@/lib/use-staff";
import { useAuthStore } from "@/store/auth-store";
import {
  STATUS_LABEL,
  STATUS_STYLE,
  SUGGESTED_AREAS,
  TRANSITION_LABEL,
  useAppraisals,
  useCreateAppraisal,
  useTransitionAppraisal,
  useUpdateAppraisal,
  type Appraisal,
  type AppraisalRating,
  type AppraisalStatus,
} from "@/lib/use-appraisals";

/**
 * Staff appraisals.
 *
 * The rule the screen is built around: only the person being appraised can
 * acknowledge it. The acknowledge button appears for them and for nobody
 * else — not their reviewer, not an administrator — because the buttons come
 * from the same function that decides, and it refuses everybody else.
 */
export default function AppraisalsPage() {
  const isAdmin = useIsSchoolAdmin();
  const me = useAuthStore((state) => state.user?.id ?? null);
  const { data: appraisals, isLoading } = useAppraisals();

  const mine = (appraisals ?? []).filter((a) => a.subjectUserId === me);
  const written = (appraisals ?? []).filter((a) => a.reviewerUserId === me);
  const others = (appraisals ?? []).filter((a) => a.subjectUserId !== me && a.reviewerUserId !== me);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Appraisals</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          Nobody writes their own, and only the person being appraised can say they have seen it.
        </p>
      </div>

      {isAdmin && <NewAppraisal />}

      {isLoading && <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>}

      <Group title="About me" appraisals={mine} emptyText="Nothing has been shared with you." />
      <Group title="Written by me" appraisals={written} emptyText="You have not written any." />
      {isAdmin && others.length > 0 && <Group title="Everyone else" appraisals={others} emptyText="" />}
    </div>
  );
}

function Group({
  title,
  appraisals,
  emptyText,
}: {
  title: string;
  appraisals: Appraisal[];
  emptyText: string;
}) {
  if (appraisals.length === 0 && !emptyText) return null;
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      {appraisals.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">{emptyText}</p>
      ) : (
        <div className="mt-2 space-y-3">
          {appraisals.map((appraisal) => (
            <AppraisalCard key={appraisal.id} appraisal={appraisal} />
          ))}
        </div>
      )}
    </section>
  );
}

function NewAppraisal() {
  const create = useCreateAppraisal();
  const { data: staff } = useStaff();
  const me = useAuthStore((state) => state.user?.id ?? null);
  const [subjectUserId, setSubjectUserId] = useState("");
  const [periodLabel, setPeriodLabel] = useState("2026-2027 First term");
  const [error, setError] = useState<string | null>(null);

  // Yourself is not in the list. The API and the database both refuse it; the
  // screen simply never offers it, which is a better way to be told.
  const candidates = (staff ?? []).filter((member) => member.id !== me);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await create.mutateAsync({ subjectUserId, periodLabel: periodLabel.trim() });
      setSubjectUserId("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start that appraisal");
    }
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Start an appraisal</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <select
          value={subjectUserId}
          onChange={(event) => setSubjectUserId(event.target.value)}
          required
          aria-label="Who is being appraised"
          className="w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="">Choose somebody…</option>
          {candidates.map((member) => (
            <option key={member.id} value={member.id}>
              {member.firstName} {member.lastName}
            </option>
          ))}
        </select>
        <input
          value={periodLabel}
          onChange={(event) => setPeriodLabel(event.target.value)}
          required
          maxLength={120}
          aria-label="Period"
          className="w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
        <button
          type="submit"
          disabled={create.isPending || !subjectUserId}
          className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Start
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </form>
  );
}

function AppraisalCard({ appraisal }: { appraisal: Appraisal }) {
  const me = useAuthStore((state) => state.user?.id ?? null);
  const [open, setOpen] = useState(false);
  const isSubject = appraisal.subjectUserId === me;

  return (
    <article className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            {appraisal.subject
              ? `${appraisal.subject.firstName} ${appraisal.subject.lastName}`
              : "This appraisal"}
            <span className="ms-2 text-sm font-normal text-slate-500">{appraisal.periodLabel}</span>
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Reviewer {appraisal.reviewerName}
            {appraisal.sharedAt && ` · shared ${new Date(appraisal.sharedAt).toLocaleDateString()}`}
            {appraisal.acknowledgedAt &&
              ` · acknowledged ${new Date(appraisal.acknowledgedAt).toLocaleDateString()}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Null, not zero: zero is off the 1–5 scale and would read as the
              worst possible appraisal. */}
          <span className="text-sm tabular-nums text-slate-600 dark:text-slate-400">
            {appraisal.overall === null ? "not rated" : `${appraisal.overall} / 5`}
          </span>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[appraisal.status]}`}>
            {STATUS_LABEL[appraisal.status]}
          </span>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold dark:border-slate-700"
          >
            {open ? "Close" : "Open"}
          </button>
        </div>
      </div>

      {open && <Detail appraisal={appraisal} isSubject={isSubject} />}
    </article>
  );
}

function Detail({ appraisal, isSubject }: { appraisal: Appraisal; isSubject: boolean }) {
  const update = useUpdateAppraisal(appraisal.id);
  const move = useTransitionAppraisal(appraisal.id);
  const [ratings, setRatings] = useState<AppraisalRating[]>(
    appraisal.ratings.length > 0
      ? appraisal.ratings
      : SUGGESTED_AREAS.map((area) => ({ area, score: 3 })),
  );
  const [text, setText] = useState({
    strengths: appraisal.strengths ?? "",
    development: appraisal.development ?? "",
  });
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const editable = appraisal.status === "DRAFT";
  const moves = appraisal.availableTransitions;

  const save = async () => {
    setMessage(null);
    try {
      await update.mutateAsync({ ...text, ratings });
      setMessage("Saved.");
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not save");
    }
  };

  const go = async (to: AppraisalStatus) => {
    setMessage(null);
    try {
      await move.mutateAsync({ to, note: note.trim() || undefined });
      setNote("");
    } catch (err) {
      // Where "only the person being appraised can acknowledge it" surfaces.
      setMessage(err instanceof ApiError ? err.message : "Could not do that");
    }
  };

  return (
    <div className="mt-4 space-y-4 border-t border-slate-200 pt-4 dark:border-slate-800">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ratings</p>
        <ul className="mt-2 space-y-1">
          {ratings.map((rating, index) => (
            <li key={index} className="flex flex-wrap items-center gap-2">
              <span className="w-52 truncate text-sm">{rating.area}</span>
              {editable ? (
                <select
                  value={rating.score}
                  onChange={(event) =>
                    setRatings(
                      ratings.map((r, i) => (i === index ? { ...r, score: Number(event.target.value) } : r)),
                    )
                  }
                  aria-label={`${rating.area} score`}
                  className="rounded-lg border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  {[1, 2, 3, 4, 5].map((score) => (
                    <option key={score} value={score}>
                      {score}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-sm tabular-nums">{rating.score} / 5</span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Field
          label="Strengths"
          value={text.strengths}
          editable={editable}
          onChange={(strengths) => setText({ ...text, strengths })}
        />
        <Field
          label="Where to develop"
          value={text.development}
          editable={editable}
          onChange={(development) => setText({ ...text, development })}
        />
      </div>

      {appraisal.acknowledgementNote && (
        <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Their reply</p>
          <p className="mt-1 whitespace-pre-wrap text-sm">{appraisal.acknowledgementNote}</p>
        </div>
      )}

      {/* Offered only to the person it is about, because the function that
          produced this list refuses everybody else. */}
      {moves.includes("ACKNOWLEDGED") && (
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={2000}
          placeholder="Anything you want to say about it (optional)"
          className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
      )}

      <div className="flex flex-wrap gap-2">
        {editable && (
          <button
            type="button"
            onClick={save}
            disabled={update.isPending}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50 dark:border-slate-700"
          >
            {update.isPending ? "Saving…" : "Save"}
          </button>
        )}
        {moves.map((to) => (
          <button
            key={to}
            type="button"
            onClick={() => go(to)}
            disabled={move.isPending}
            className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 ${
              to === "ACKNOWLEDGED"
                ? "bg-brand-gradient text-white"
                : "border border-slate-300 dark:border-slate-700"
            }`}
          >
            {TRANSITION_LABEL[to]}
          </button>
        ))}
      </div>

      {moves.length === 0 && appraisal.status === "SHARED" && !isSubject && (
        // Said plainly rather than leaving a head teacher hunting for a
        // button that was never going to be there.
        <p className="text-xs text-slate-500">
          Waiting for them to acknowledge it. Only the person being appraised can do that.
        </p>
      )}

      {message && <p className="text-xs text-amber-600">{message}</p>}
    </div>
  );
}

function Field({
  label,
  value,
  editable,
  onChange,
}: {
  label: string;
  value: string;
  editable: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
      {label}
      {editable ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={4}
          maxLength={2000}
          className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case dark:border-slate-700 dark:bg-slate-900"
        />
      ) : (
        <p className="mt-1 whitespace-pre-wrap text-sm font-normal normal-case text-slate-700 dark:text-slate-300">
          {value || <span className="italic text-slate-400">Nothing written.</span>}
        </p>
      )}
    </label>
  );
}
