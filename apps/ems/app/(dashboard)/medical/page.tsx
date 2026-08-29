"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch } from "@/lib/api";
import { authHeaders, useAuthQueryState } from "@/lib/api-auth";
import { useCanAuthor } from "@/lib/use-can-author";
import { useStudents } from "@/lib/use-students";
import { usePortalChildren } from "@/lib/use-wallet";

type MedicalKind = "ALLERGY" | "CONDITION" | "MEDICATION" | "NOTE";
type Severity = "LIFE_THREATENING" | "SIGNIFICANT" | "MINOR";

const KIND_LABEL: Record<MedicalKind, string> = {
  ALLERGY: "Allergy",
  CONDITION: "Condition",
  MEDICATION: "Medication",
  NOTE: "Note",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  LIFE_THREATENING: "Life-threatening",
  SIGNIFICANT: "Significant",
  MINOR: "Minor",
};

const SEVERITY_STYLE: Record<Severity, string> = {
  LIFE_THREATENING: "bg-red-600 text-white",
  SIGNIFICANT: "bg-amber-500 text-white",
  MINOR: "bg-slate-500 text-white",
};

interface Entry {
  id: string;
  kind: MedicalKind;
  severity: Severity | null;
  title: string;
  detail: string | null;
  action: string | null;
  recordedByName: string;
  archivedAt: string | null;
}

interface Record_ {
  entries: Entry[];
  critical: Entry[];
  summary: { critical: number; allergies: number; conditions: number; medications: number; archived: number; empty: boolean };
}

const KEY = ["medical"];

function useRecord(studentProfileId: string | null) {
  const { accessToken, enabled } = useAuthQueryState();
  return useQuery({
    queryKey: [...KEY, studentProfileId],
    enabled: enabled && Boolean(studentProfileId),
    queryFn: () =>
      apiFetch<Record_>(`/v1/medical/students/${studentProfileId}`, { headers: authHeaders(accessToken) }),
  });
}

/**
 * A child's medical record.
 *
 * One child at a time, always. There is no route that lists across children,
 * because a list of every child in the school with a life-threatening allergy
 * is a document that should not exist in a school portal.
 */
export default function MedicalPage() {
  const isStaff = useCanAuthor();
  const { data: students } = useStudents();
  const { data: children } = usePortalChildren(!isStaff);
  const [chosen, setChosen] = useState<string | null>(null);

  const options = isStaff
    ? (students ?? []).map((s) => ({ id: s.id, name: `${s.user.firstName} ${s.user.lastName}` }))
    : (children ?? []).map((c) => ({ id: c.id, name: `${c.user.firstName} ${c.user.lastName}` }));

  const current = chosen ?? (options.length === 1 ? (options[0]?.id ?? null) : null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Medical records</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          Allergies, conditions and medication. Staff and the child&rsquo;s own family only — and never sent
          to the AI.
        </p>
      </div>

      {options.length > 1 && (
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          {isStaff ? "Student" : "Child"}
          <select
            value={current ?? ""}
            onChange={(event) => setChosen(event.target.value || null)}
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

      {current && <Record studentProfileId={current} isStaff={isStaff} />}
    </div>
  );
}

function Record({ studentProfileId, isStaff }: { studentProfileId: string; isStaff: boolean }) {
  const { data, isLoading } = useRecord(studentProfileId);

  if (isLoading) return <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>;
  if (!data) return null;

  return (
    <div className="space-y-5">
      {/* Short on purpose. A complete list gets skimmed; this one gets read. */}
      {data.critical.length > 0 && (
        <section className="rounded-2xl border-2 border-red-300 p-4 dark:border-red-900">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-400">
            Read before taking this child anywhere
          </p>
          <ul className="mt-2 space-y-2">
            {data.critical.map((entry) => (
              <li key={entry.id}>
                <p className="text-sm font-semibold">{entry.title}</p>
                {entry.action && <p className="text-sm text-red-700 dark:text-red-300">{entry.action}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* "Nothing recorded" is not "nothing to worry about". */}
      {data.summary.empty && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-400">
          Nothing has been recorded for this child. That is not the same as there being nothing to record —
          nobody has been asked.
        </p>
      )}

      {isStaff && <AddEntry studentProfileId={studentProfileId} />}

      <ul className="space-y-2">
        {data.entries.map((entry) => (
          <li
            key={entry.id}
            className={`rounded-xl border p-3 dark:border-slate-800 ${
              entry.archivedAt ? "border-slate-200 opacity-60" : "border-slate-200"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {entry.title}
                  <span className="ms-2 text-xs font-normal text-slate-500">{KIND_LABEL[entry.kind]}</span>
                  {entry.archivedAt && (
                    <span className="ms-2 text-xs font-normal italic text-slate-500">no longer current</span>
                  )}
                </p>
                {entry.detail && <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{entry.detail}</p>}
                {entry.action && (
                  <p className="mt-1 text-sm">
                    <span className="font-semibold">What to do: </span>
                    {entry.action}
                  </p>
                )}
                <p className="mt-1 text-xs text-slate-500">Recorded by {entry.recordedByName}</p>
              </div>
              {entry.severity && (
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${SEVERITY_STYLE[entry.severity]}`}>
                  {SEVERITY_LABEL[entry.severity]}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AddEntry({ studentProfileId }: { studentProfileId: string }) {
  const queryClient = useQueryClient();
  const accessToken = useAuthQueryState().accessToken;
  const add = useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      apiFetch(`/v1/medical/students/${studentProfileId}`, {
        method: "POST",
        headers: authHeaders(accessToken),
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });

  const [form, setForm] = useState({
    kind: "ALLERGY" as MedicalKind,
    severity: "SIGNIFICANT" as Severity | "",
    title: "",
    detail: "",
    action: "",
  });
  const [error, setError] = useState<string | null>(null);

  // A note carries no severity; an allergy or condition must have one. The
  // form follows the same rule the API enforces rather than letting somebody
  // submit into a refusal.
  const needsSeverity = form.kind === "ALLERGY" || form.kind === "CONDITION";
  const allowsSeverity = form.kind !== "NOTE";

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        try {
          await add.mutateAsync({
            kind: form.kind,
            severity: allowsSeverity && form.severity ? form.severity : undefined,
            title: form.title.trim(),
            detail: form.detail.trim() || undefined,
            action: form.action.trim() || undefined,
          });
          setForm({ ...form, title: "", detail: "", action: "" });
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Could not save that");
        }
      }}
      className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Record something</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <select
          value={form.kind}
          onChange={(event) => setForm({ ...form, kind: event.target.value as MedicalKind })}
          aria-label="Kind"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        >
          {(Object.keys(KIND_LABEL) as MedicalKind[]).map((kind) => (
            <option key={kind} value={kind}>
              {KIND_LABEL[kind]}
            </option>
          ))}
        </select>
        {allowsSeverity && (
          <select
            value={form.severity}
            onChange={(event) => setForm({ ...form, severity: event.target.value as Severity | "" })}
            aria-label="How serious"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            {!needsSeverity && <option value="">No severity</option>}
            {(Object.keys(SEVERITY_LABEL) as Severity[]).map((severity) => (
              <option key={severity} value={severity}>
                {SEVERITY_LABEL[severity]}
              </option>
            ))}
          </select>
        )}
        <input
          value={form.title}
          onChange={(event) => setForm({ ...form, title: event.target.value })}
          required
          maxLength={200}
          placeholder="Peanuts"
          aria-label="What it is"
          className="w-44 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
      </div>
      <input
        value={form.action}
        onChange={(event) => setForm({ ...form, action: event.target.value })}
        maxLength={2000}
        placeholder="What to do if it happens"
        aria-label="What to do if it happens"
        className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
      />
      {needsSeverity && (
        <p className="mt-2 text-xs text-slate-500">
          An allergy or condition needs a severity — nobody can judge that from the name alone.
        </p>
      )}
      <button
        type="submit"
        disabled={add.isPending || !form.title.trim()}
        className="mt-3 rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {add.isPending ? "Saving…" : "Save"}
      </button>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </form>
  );
}
