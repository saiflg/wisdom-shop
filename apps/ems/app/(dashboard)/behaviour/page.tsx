"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { useCanAuthor, useIsSchoolAdmin } from "@/lib/use-can-author";
import { useStudents } from "@/lib/use-students";
import { usePortalChildren } from "@/lib/use-wallet";
import {
  useBehaviourForStudent,
  useCreateBehaviourRecord,
  useWithdrawBehaviourRecord,
  wasAmended,
  type BehaviourKind,
  type BehaviourRecord,
  type BehaviourSummary,
} from "@/lib/use-behaviour";

/**
 * What the school has written down about one child.
 *
 * One child at a time, always. There is no list across children and nothing
 * ordered by points, here or in the API — this data would make a "best and
 * worst behaved" ranking trivial to produce, and producing it is how a record
 * meant to help a child becomes something used against them.
 */
export default function BehaviourPage() {
  const isStaff = useCanAuthor();
  const { data: students } = useStudents();
  const { data: children, isError: portalUnavailable } = usePortalChildren(!isStaff);
  const [studentProfileId, setStudentProfileId] = useState<string | null>(null);

  const options = isStaff
    ? (students ?? []).map((s) => ({ id: s.id, name: `${s.user.firstName} ${s.user.lastName}` }))
    : (children ?? []).map((c) => ({ id: c.id, name: `${c.user.firstName} ${c.user.lastName}` }));

  const only = options.length === 1 ? options[0] : undefined;
  const chosen = studentProfileId ?? only?.id ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Behaviour</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          Merits and concerns, one child at a time. A concern is not a punishment — most of what a school
          writes down is a child who needs help rather than a child in trouble.
        </p>
      </div>

      {!isStaff && portalUnavailable && (
        <p className="text-sm text-amber-600">
          Your school has not switched on the family portal, so this list is not available to you here.
        </p>
      )}

      {options.length > 1 && (
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          {isStaff ? "Student" : "Child"}
          <select
            value={chosen ?? ""}
            onChange={(event) => setStudentProfileId(event.target.value || null)}
            className="mt-1 block w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="">Choose…</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {chosen ? (
        <StudentBehaviour studentProfileId={chosen} isStaff={isStaff} />
      ) : (
        options.length > 1 && (
          <p className="text-sm text-slate-600 dark:text-slate-400">Choose someone to see their record.</p>
        )
      )}
    </div>
  );
}

function StudentBehaviour({ studentProfileId, isStaff }: { studentProfileId: string; isStaff: boolean }) {
  const { data, isLoading } = useBehaviourForStudent(studentProfileId);

  if (isLoading) return <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <Summary summary={data.summary} />
      {isStaff && <NewRecord studentProfileId={studentProfileId} />}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Record</h2>
        {data.records.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Nothing has been written down about this child.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {data.records.map((record) => (
              <RecordRow key={record.id} record={record} isStaff={isStaff} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Summary({ summary }: { summary: BehaviourSummary }) {
  return (
    <section className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
      <div className="flex flex-wrap gap-8">
        {/* Counts beside points, never instead of them: ten one-point merits
            and one ten-point merit are the same total and a very different
            term. */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Merits</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-600">{summary.merits}</p>
          <p className="text-xs text-slate-500">{summary.meritPoints} points</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Concerns</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-amber-600">{summary.concerns}</p>
          <p className="text-xs text-slate-500">{summary.concernPoints} points</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Net</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{summary.netPoints}</p>
        </div>
      </div>

      {summary.topCategories.length > 0 && (
        <p className="mt-4 text-xs text-slate-500">
          Most often: {summary.topCategories.map((c) => `${c.category} (${c.count})`).join(" · ")}
        </p>
      )}
    </section>
  );
}

function RecordRow({ record, isStaff }: { record: BehaviourRecord; isStaff: boolean }) {
  const withdraw = useWithdrawBehaviourRecord();
  const isAdmin = useIsSchoolAdmin();
  const merit = record.kind === "MERIT";

  return (
    <li
      className={`rounded-xl border p-4 ${
        merit ? "border-emerald-200 dark:border-emerald-900" : "border-amber-200 dark:border-amber-900"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            <span className={merit ? "text-emerald-600" : "text-amber-600"}>
              {merit ? "Merit" : "Concern"}
            </span>
            <span className="ms-2 text-slate-600 dark:text-slate-400">{record.category}</span>
            {record.points > 0 && <span className="ms-2 text-xs text-slate-500">{record.points} points</span>}
          </p>
          <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{record.description}</p>
          <p className="mt-1 text-xs text-slate-500">
            {new Date(record.occurredAt).toLocaleDateString()} · {record.recordedByName}
            {record.class && ` · ${record.class.name}`}
            {/* Said out loud. A record about a child that could be rewritten
                with no trace would be worth nothing to a family disputing
                it. */}
            {wasAmended(record) && <span className="ms-1 italic">· edited</span>}
          </p>
        </div>
        {isStaff && isAdmin && (
          <button
            type="button"
            onClick={() => withdraw.mutateAsync(record.id)}
            disabled={withdraw.isPending}
            className="shrink-0 rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold disabled:opacity-50 dark:border-slate-700"
          >
            Withdraw
          </button>
        )}
      </div>
    </li>
  );
}

function NewRecord({ studentProfileId }: { studentProfileId: string }) {
  const create = useCreateBehaviourRecord();
  const [kind, setKind] = useState<BehaviourKind>("MERIT");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [points, setPoints] = useState("1");
  const [occurredAt, setOccurredAt] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setNote(null);
    try {
      await create.mutateAsync({
        studentProfileId,
        kind,
        category: category.trim(),
        description: description.trim(),
        points: Number(points) || 0,
        occurredAt: occurredAt ? new Date(occurredAt).toISOString() : undefined,
      });
      setCategory("");
      setDescription("");
      setOccurredAt("");
      setNote("Written down.");
    } catch (err) {
      setNote(err instanceof ApiError ? err.message : "Could not save that");
    }
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Write something down</h2>

      <div className="mt-3 flex flex-wrap gap-3">
        <label className="text-xs text-slate-500">
          Kind
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as BehaviourKind)}
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="MERIT">Merit</option>
            <option value="CONCERN">Concern</option>
          </select>
        </label>
        <label className="text-xs text-slate-500">
          Category
          <input
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            required
            maxLength={80}
            placeholder="Helpfulness"
            className="mt-1 block w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        <label className="text-xs text-slate-500">
          Points
          <input
            type="number"
            min={0}
            max={100}
            value={points}
            onChange={(event) => setPoints(event.target.value)}
            className="mt-1 block w-20 rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        <label className="text-xs text-slate-500">
          When {/* Not when it is being typed: Friday break written up on
                    Monday should not be filed as Monday. */}
          <input
            type="date"
            value={occurredAt}
            onChange={(event) => setOccurredAt(event.target.value)}
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
      </div>

      <label className="mt-3 block text-xs text-slate-500">
        What happened
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          required
          maxLength={1000}
          rows={2}
          placeholder="Stayed behind to help clear up after the science lesson."
          className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
      </label>

      <p className="mt-2 text-xs text-slate-500">
        Points are always positive — whether they count for or against is decided by the kind. This child and
        their family can read this.
      </p>

      <button
        type="submit"
        disabled={create.isPending || !category.trim() || !description.trim()}
        className="mt-3 rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {create.isPending ? "Saving…" : "Save"}
      </button>
      {note && <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">{note}</p>}
    </form>
  );
}
