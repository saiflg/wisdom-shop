"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { useCanAuthor } from "@/lib/use-can-author";
import { useClasses } from "@/lib/use-classes";
import { useSubjects } from "@/lib/use-subjects";
import {
  STATUS_LABEL,
  STATUS_STYLE,
  TRANSITION_LABEL,
  useCreateLessonNote,
  useLessonNotes,
  useTransitionLessonNote,
  useUpdateLessonNote,
  type LessonNote,
  type LessonNoteStatus,
} from "@/lib/use-lesson-notes";

/**
 * The written subject content for a week, vetted before children read it.
 *
 * Not the same thing as a lesson plan, which is what the teacher prepares to
 * do. This is what the class copies down — and in most schools here it does
 * not reach a child until a head teacher has read and signed it.
 */
export default function LessonNotesPage() {
  const isStaff = useCanAuthor();
  const { data: classes } = useClasses();
  const [classId, setClassId] = useState("");
  const { data: notes, isLoading } = useLessonNotes(classId ? { classId } : {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Lesson notes</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          {isStaff
            ? "What a class is taught, written out week by week. A note reaches the children once it has been vetted."
            : "The notes your teachers have approved, week by week."}
        </p>
      </div>

      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
        Class
        <select
          value={classId}
          onChange={(event) => setClassId(event.target.value)}
          className="mt-1 block w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="">Every class</option>
          {classes?.map((schoolClass) => (
            <option key={schoolClass.id} value={schoolClass.id}>
              {schoolClass.name} · {schoolClass.academicYear}
            </option>
          ))}
        </select>
      </label>

      {isStaff && <NewNote />}

      {isLoading && <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>}
      {notes?.length === 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {isStaff ? "No notes yet for that choice." : "Nothing has been approved for you to read yet."}
        </p>
      )}

      <div className="space-y-3">
        {notes?.map((note) => (
          <NoteRow key={note.id} note={note} isStaff={isStaff} />
        ))}
      </div>
    </div>
  );
}

function NewNote() {
  const create = useCreateLessonNote();
  const { data: classes } = useClasses();
  const { data: subjects } = useSubjects();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    classId: "",
    subjectId: "",
    term: "First",
    weekNumber: "1",
    title: "",
    body: "",
  });
  const [error, setError] = useState<string | null>(null);

  const schoolClass = classes?.find((c) => c.id === form.classId);
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!schoolClass) return;
    try {
      await create.mutateAsync({
        classId: form.classId,
        subjectId: form.subjectId,
        // Taken from the class rather than typed again: two places to say
        // which year it is means two places for them to disagree.
        academicYear: schoolClass.academicYear,
        term: form.term,
        weekNumber: Number(form.weekNumber),
        title: form.title.trim(),
        body: form.body,
      });
      setForm({ ...form, title: "", body: "" });
      setOpen(false);
    } catch (err) {
      // The one people hit is the duplicate: one note per subject, class and
      // week, and the API says so in words.
      setError(err instanceof ApiError ? err.message : "Could not save that note");
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white"
      >
        New note
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">New note</h2>

      <div className="mt-3 flex flex-wrap gap-3">
        <label className="text-xs text-slate-500">
          Class
          <select
            value={form.classId}
            onChange={(event) => set({ classId: event.target.value })}
            required
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="">Choose…</option>
            {classes?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-500">
          Subject
          <select
            value={form.subjectId}
            onChange={(event) => set({ subjectId: event.target.value })}
            required
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="">Choose…</option>
            {subjects?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-500">
          Term
          <select
            value={form.term}
            onChange={(event) => set({ term: event.target.value })}
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <option>First</option>
            <option>Second</option>
            <option>Third</option>
          </select>
        </label>
        <label className="text-xs text-slate-500">
          Week
          <input
            type="number"
            min={1}
            max={52}
            value={form.weekNumber}
            onChange={(event) => set({ weekNumber: event.target.value })}
            className="mt-1 block w-20 rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
      </div>

      <label className="mt-3 block text-xs text-slate-500">
        Title
        <input
          value={form.title}
          onChange={(event) => set({ title: event.target.value })}
          required
          maxLength={200}
          placeholder="Adding fractions with different denominators"
          className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
      </label>

      <label className="mt-3 block text-xs text-slate-500">
        The note
        <textarea
          value={form.body}
          onChange={(event) => set({ body: event.target.value })}
          required
          rows={8}
          maxLength={50000}
          className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
      </label>

      <p className="mt-2 text-xs text-slate-500">
        Saved as a draft. Nobody outside the staffroom sees it until it has been vetted.
      </p>

      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={create.isPending || !form.classId || !form.subjectId || !form.title.trim()}
          className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {create.isPending ? "Saving…" : "Save draft"}
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

function NoteRow({ note, isStaff }: { note: LessonNote; isStaff: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{note.title}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Week {note.weekNumber} · {note.term} term · {note.subject?.name}
            {note.class && ` · ${note.class.name}`} · {note.authorName}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Shown to staff only. A child does not need to know a note was
              sent back twice before they were allowed to read it. */}
          {isStaff && (
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[note.status]}`}>
              {STATUS_LABEL[note.status]}
            </span>
          )}
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold dark:border-slate-700"
          >
            {open ? "Close" : "Read"}
          </button>
        </div>
      </div>

      {note.reviewComment && isStaff && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          {note.reviewedByName ? `${note.reviewedByName}: ` : ""}
          {note.reviewComment}
        </p>
      )}

      {open && <NoteBody note={note} isStaff={isStaff} />}
    </section>
  );
}

function NoteBody({ note, isStaff }: { note: LessonNote; isStaff: boolean }) {
  const update = useUpdateLessonNote(note.id);
  const transition = useTransitionLessonNote(note.id);
  const [body, setBody] = useState(note.body);
  const [comment, setComment] = useState("");
  const [note_, setNote] = useState<string | null>(null);

  const editable = isStaff && (note.status === "DRAFT" || note.status === "RETURNED");
  const moves = note.availableTransitions ?? [];

  const save = async () => {
    setNote(null);
    try {
      await update.mutateAsync({ body });
      setNote("Saved.");
    } catch (err) {
      setNote(err instanceof ApiError ? err.message : "Could not save");
    }
  };

  const move = async (to: LessonNoteStatus) => {
    setNote(null);
    try {
      await transition.mutateAsync({ to, comment: comment.trim() || undefined });
      setComment("");
    } catch (err) {
      // Where "a note cannot be approved by the person who wrote it" surfaces
      // — the rule the whole screen exists for.
      setNote(err instanceof ApiError ? err.message : "Could not do that");
    }
  };

  return (
    <div className="mt-4 space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
      {editable ? (
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={12}
          maxLength={50000}
          className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
      ) : (
        <div className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{note.body}</div>
      )}

      {isStaff && (
        <>
          {/* Only ever the moves the API would allow: the list comes from the
              same pure function that decides. A button that looks real and
              does nothing is this project's standing complaint. */}
          {moves.includes("RETURNED") && (
            <input
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              maxLength={1000}
              placeholder="What needs changing? (required to send back)"
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
                onClick={() => move(to)}
                disabled={transition.isPending}
                className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 ${
                  to === "APPROVED"
                    ? "bg-brand-gradient text-white"
                    : "border border-slate-300 dark:border-slate-700"
                }`}
              >
                {TRANSITION_LABEL[to]}
              </button>
            ))}
          </div>

          {moves.length === 0 && note.status === "SUBMITTED" && (
            // Said plainly rather than leaving a teacher wondering why there
            // is no Approve button on their own note.
            <p className="text-xs text-slate-500">
              Waiting for someone else to vet this. A note cannot be approved by the person who wrote it.
            </p>
          )}
        </>
      )}

      {note_ && <p className="text-xs text-red-600">{note_}</p>}
    </div>
  );
}
