"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { useClasses } from "@/lib/use-classes";
import { useSubjects } from "@/lib/use-subjects";
import {
  fromMarks,
  toMarks,
  useApplyResultTemplate,
  useCreateResultTemplate,
  useDeleteResultTemplate,
  useResultTemplates,
  type ResultTemplate,
  type ResultTemplateComponent,
} from "@/lib/use-result-templates";

/**
 * The shape of a term's assessments, stored once and applied.
 *
 * A school with 12 subjects across 6 classes types "CA1 10, CA2 10, CA3 10,
 * Exam 70" 72 times a term. Any one of those typed 10/10/10/60 deflates a
 * whole class by ten percent, and it is invisible on an individual report
 * card — you only see it by adding up a column nobody adds up.
 */
export default function ResultTemplatesPage() {
  const { data: templates, isLoading } = useResultTemplates();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Result templates</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          How a term is marked — the tests, what each is out of, and what each is worth. Apply one to a class
          and it creates those assessments for every subject you choose.
        </p>
      </div>

      <NewTemplate />

      {isLoading && <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>}
      {templates?.length === 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          No templates yet. Most schools have one for continuous assessment plus an exam.
        </p>
      )}

      <div className="space-y-3">
        {templates?.map((template) => (
          <TemplateRow key={template.id} template={template} />
        ))}
      </div>
    </div>
  );
}

const BLANK: ResultTemplateComponent[] = [
  { name: "CA1", maxScoreHundredths: 1000, weightPercent: 10 },
  { name: "CA2", maxScoreHundredths: 1000, weightPercent: 10 },
  { name: "CA3", maxScoreHundredths: 1000, weightPercent: 10 },
  { name: "Exam", maxScoreHundredths: 7000, weightPercent: 70 },
];

function NewTemplate() {
  const create = useCreateResultTemplate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [rows, setRows] = useState<ResultTemplateComponent[]>(BLANK);
  const [error, setError] = useState<string | null>(null);

  const total = rows.reduce((sum, row) => sum + (Number(row.weightPercent) || 0), 0);

  const setRow = (index: number, patch: Partial<ResultTemplateComponent>) =>
    setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await create.mutateAsync({ name: name.trim(), components: rows });
      setName("");
      setRows(BLANK);
      setOpen(false);
    } catch (err) {
      // The weight message from the API names the actual total, which is the
      // one thing a person needs in order to fix it.
      setError(err instanceof ApiError ? err.message : "Could not save that template");
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white"
      >
        New template
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">New template</h2>
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
        maxLength={120}
        placeholder="Junior CA and Exam"
        aria-label="Template name"
        className="mt-3 w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
      />

      <ul className="mt-4 space-y-2">
        {rows.map((row, index) => (
          <li key={index} className="flex flex-wrap items-center gap-2">
            <input
              value={row.name}
              onChange={(event) => setRow(index, { name: event.target.value })}
              aria-label={`Component ${index + 1} name`}
              className="w-32 rounded-lg border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
            <label className="text-xs text-slate-500">
              out of
              <input
                type="number"
                min={1}
                value={toMarks(row.maxScoreHundredths)}
                onChange={(event) => setRow(index, { maxScoreHundredths: fromMarks(Number(event.target.value)) })}
                aria-label={`${row.name} maximum mark`}
                className="ms-1 w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
            <label className="text-xs text-slate-500">
              worth
              <input
                type="number"
                min={1}
                max={100}
                value={row.weightPercent}
                onChange={(event) => setRow(index, { weightPercent: Number(event.target.value) })}
                aria-label={`${row.name} weight percent`}
                className="ms-1 w-16 rounded-lg border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
              %
            </label>
            <button
              type="button"
              onClick={() => setRows(rows.filter((_, i) => i !== index))}
              className="text-xs text-slate-500 underline"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setRows([...rows, { name: "", maxScoreHundredths: 1000, weightPercent: 0 }])}
          className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold dark:border-slate-700"
        >
          Add row
        </button>
        {/* Shown live rather than only on submit: the total is the whole
            point of the screen, and finding out it was 90 after saving is
            how the mistake got made in the first place. */}
        <span className={total === 100 ? "text-xs text-emerald-600" : "text-xs text-amber-600"}>
          Weights total {total}%{total === 100 ? "" : " — must be 100%"}
        </span>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={create.isPending || total !== 100 || !name.trim()}
          className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {create.isPending ? "Saving…" : "Save template"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-700"
        >
          Cancel
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </form>
  );
}

function TemplateRow({ template }: { template: ResultTemplate }) {
  const remove = useDeleteResultTemplate();
  const [applying, setApplying] = useState(false);

  return (
    <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            {template.name}
            {template.isDefault && <span className="ms-2 text-xs text-slate-500">· default</span>}
          </p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {template.components
              .map((c) => `${c.name} (${toMarks(c.maxScoreHundredths)} marks, ${c.weightPercent}%)`)
              .join(" · ")}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setApplying((value) => !value)}
            aria-expanded={applying}
            className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold dark:border-slate-700"
          >
            {applying ? "Close" : "Apply to a class"}
          </button>
          <button
            type="button"
            onClick={() => remove.mutateAsync(template.id)}
            disabled={remove.isPending}
            className="rounded-lg border border-red-300 px-3 py-1 text-xs font-semibold text-red-600 disabled:opacity-50 dark:border-red-900"
          >
            Remove
          </button>
        </div>
      </div>

      {applying && <ApplyPanel template={template} />}
    </section>
  );
}

function ApplyPanel({ template }: { template: ResultTemplate }) {
  const { data: classes } = useClasses();
  const { data: subjects } = useSubjects();
  const apply = useApplyResultTemplate(template.id);

  const [classId, setClassId] = useState("");
  const [term, setTerm] = useState("First");
  const [chosen, setChosen] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);

  const schoolClass = classes?.find((c) => c.id === classId);
  const willCreate = chosen.length * template.components.length;

  const run = async () => {
    setNote(null);
    if (!schoolClass) return;
    try {
      const result = await apply.mutateAsync({
        classId,
        academicYear: schoolClass.academicYear,
        term,
        subjectIds: chosen,
      });
      // "Already there" is reported plainly, because an admin who clicks
      // twice should be told nothing happened the second time rather than
      // being left to wonder whether it doubled anything.
      setNote(
        result.alreadyPresent > 0
          ? `${result.created} created, ${result.alreadyPresent} already there.`
          : `${result.created} assessments created.`,
      );
    } catch (err) {
      setNote(err instanceof ApiError ? err.message : "Could not apply that template");
    }
  };

  return (
    <div className="mt-4 space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
      <div className="flex flex-wrap gap-3">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Class
          <select
            value={classId}
            onChange={(event) => setClassId(event.target.value)}
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="">Choose a class</option>
            {classes?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.academicYear}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Term
          <select
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case dark:border-slate-700 dark:bg-slate-900"
          >
            <option>First</option>
            <option>Second</option>
            <option>Third</option>
          </select>
        </label>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Subjects</p>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {subjects?.map((subject) => (
            <li key={subject.id}>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={chosen.includes(subject.id)}
                  onChange={() =>
                    setChosen(
                      chosen.includes(subject.id)
                        ? chosen.filter((s) => s !== subject.id)
                        : [...chosen, subject.id],
                    )
                  }
                  className="h-4 w-4 rounded border-slate-300"
                />
                <span className="min-w-0 truncate">{subject.name}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={apply.isPending || !classId || chosen.length === 0}
          className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {apply.isPending ? "Applying…" : "Apply"}
        </button>
        {/* Said before, not after. Forty-eight rows is a lot to create on
            somebody's behalf without telling them the number first. */}
        {willCreate > 0 && (
          <span className="text-xs text-slate-500">
            Creates {willCreate} assessment{willCreate === 1 ? "" : "s"}
            {schoolClass ? ` in ${schoolClass.name}, ${term} term` : ""}. Applying twice changes nothing.
          </span>
        )}
      </div>
      {note && <p className="text-xs text-slate-600 dark:text-slate-400">{note}</p>}
    </div>
  );
}
