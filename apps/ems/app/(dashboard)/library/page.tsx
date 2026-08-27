"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { useCanAuthor } from "@/lib/use-can-author";
import { useStudents } from "@/lib/use-students";
import {
  dueLabel,
  useAddBook,
  useBorrow,
  useCatalogue,
  useLibraryLimits,
  useLibraryLoans,
  useReturnLoan,
  type LibraryBook,
  type LibraryLoan,
  type LibrarySummary,
} from "@/lib/use-library";

/**
 * The shelves, and who has what.
 *
 * A book due today is not overdue anywhere on this screen — the rule lives in
 * library-rules.ts. The child has until the end of the day they were given,
 * and a library that says otherwise marks a child late for being punctual.
 */
export default function LibraryPage() {
  const isStaff = useCanAuthor();
  const [tab, setTab] = useState<"catalogue" | "loans">("catalogue");
  const [search, setSearch] = useState("");
  const { data, isLoading } = useCatalogue(search);
  const { data: limits } = useLibraryLimits();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Library</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          What the school owns and who has it.
          {limits && ` Up to ${limits.maxPerBorrower} books at a time, for ${limits.loanDays} days.`}
        </p>
      </div>

      {data && <Summary summary={data.summary} />}

      {isStaff && (
        <div className="flex gap-2">
          <Tab label="Catalogue" active={tab === "catalogue"} onClick={() => setTab("catalogue")} />
          <Tab label="Out on loan" active={tab === "loans"} onClick={() => setTab("loans")} />
        </div>
      )}

      {tab === "loans" && isStaff ? (
        <OnLoan />
      ) : (
        <>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by title or author"
            aria-label="Search the catalogue"
            className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />

          {isStaff && <NewBook />}

          {isLoading && <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>}
          {data?.books.length === 0 && (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {search ? "Nothing matches that." : "No books on the shelves yet."}
            </p>
          )}

          <ul className="space-y-2">
            {data?.books.map((book) => (
              <BookRow key={book.id} book={book} isStaff={isStaff} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Tab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
        active
          ? "bg-brand-gradient text-white"
          : "border border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-400"
      }`}
    >
      {label}
    </button>
  );
}

function Summary({ summary }: { summary: LibrarySummary }) {
  return (
    <section className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
      <div className="flex flex-wrap gap-8">
        {/* Titles beside copies, never instead of: forty copies of one book
            and forty different books are the same number and a very
            different library. */}
        <Stat label="Titles" value={summary.titles} />
        <Stat label="Copies" value={summary.copies} />
        <Stat label="Out" value={summary.onLoan} />
        <Stat label="Available" value={summary.available} />
        <Stat label="Overdue" value={summary.overdue} tone={summary.overdue > 0 ? "bad" : undefined} />
      </div>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "bad" }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tone === "bad" ? "text-red-600" : ""}`}>{value}</p>
    </div>
  );
}

function BookRow({ book, isStaff }: { book: LibraryBook; isStaff: boolean }) {
  const [issuing, setIssuing] = useState(false);

  return (
    <li className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{book.title}</p>
          <p className="text-xs text-slate-500">
            {book.author ?? "Author unknown"}
            {book.category && ` · ${book.category}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-xs tabular-nums text-slate-500">
            {book.availableCopies} of {book.copies} in
            {book.overdueLoans > 0 && <span className="ml-1 text-red-600">· {book.overdueLoans} late</span>}
          </span>
          {isStaff && (
            <button
              type="button"
              onClick={() => setIssuing((value) => !value)}
              disabled={book.availableCopies === 0}
              aria-expanded={issuing}
              className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold disabled:opacity-40 dark:border-slate-700"
            >
              {issuing ? "Cancel" : "Issue"}
            </button>
          )}
        </div>
      </div>

      {issuing && <IssuePanel book={book} onDone={() => setIssuing(false)} />}
    </li>
  );
}

function IssuePanel({ book, onDone }: { book: LibraryBook; onDone: () => void }) {
  const { data: students } = useStudents();
  const borrow = useBorrow();
  const [studentProfileId, setStudentProfileId] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const issue = async () => {
    setNote(null);
    try {
      await borrow.mutateAsync({ bookId: book.id, studentProfileId });
      onDone();
    } catch (err) {
      // Where "they have a book overdue" and "they already have a copy of
      // that book" surface — the reason, not a generic failure.
      setNote(err instanceof ApiError ? err.message : "Could not issue that");
    }
  };

  return (
    <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
      <label className="text-xs text-slate-500">
        To
        <select
          value={studentProfileId}
          onChange={(event) => setStudentProfileId(event.target.value)}
          className="mt-1 block w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="">Choose a student…</option>
          {students?.map((student) => (
            <option key={student.id} value={student.id}>
              {student.user.firstName} {student.user.lastName}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={issue}
        disabled={borrow.isPending || !studentProfileId}
        className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {borrow.isPending ? "Issuing…" : "Issue"}
      </button>
      {note && <p className="w-full text-xs text-amber-600">{note}</p>}
    </div>
  );
}

function OnLoan() {
  const { data: loans } = useLibraryLoans();
  const takeBack = useReturnLoan();
  const [note, setNote] = useState<string | null>(null);

  const give = async (loan: LibraryLoan) => {
    setNote(null);
    try {
      const result = await takeBack.mutateAsync(loan.id);
      // Scanning a book that is already in is not an error worth shouting
      // about; it is the second scan of the same barcode.
      if (result.alreadyReturned) setNote(`${loan.book.title} was already back in.`);
    } catch (err) {
      setNote(err instanceof ApiError ? err.message : "Could not take that back");
    }
  };

  if (!loans) return null;
  if (loans.length === 0) {
    return <p className="text-sm text-slate-600 dark:text-slate-400">Nothing is out at the moment.</p>;
  }

  return (
    <>
      {note && <p className="text-xs text-slate-600 dark:text-slate-400">{note}</p>}
      <ul className="divide-y divide-slate-200 dark:divide-slate-800">
        {loans.map((loan) => (
          <li key={loan.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{loan.book.title}</p>
              <p className="text-xs text-slate-500">
                {loan.studentProfile.user.firstName} {loan.studentProfile.user.lastName} ·{" "}
                <span className={loan.overdue ? "font-semibold text-red-600" : ""}>{dueLabel(loan)}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => give(loan)}
              disabled={takeBack.isPending}
              className="shrink-0 rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold disabled:opacity-50 dark:border-slate-700"
            >
              Take back
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function NewBook() {
  const add = useAddBook();
  const [form, setForm] = useState({ title: "", author: "", category: "", copies: "1" });
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await add.mutateAsync({
        title: form.title.trim(),
        author: form.author.trim() || undefined,
        category: form.category.trim() || undefined,
        copies: Number(form.copies) || 1,
      });
      setForm({ title: "", author: "", category: "", copies: "1" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add that book");
    }
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Add a book</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={form.title}
          onChange={(event) => setForm({ ...form, title: event.target.value })}
          required
          maxLength={300}
          placeholder="Title"
          aria-label="Title"
          className="min-w-[14rem] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
        <input
          value={form.author}
          onChange={(event) => setForm({ ...form, author: event.target.value })}
          maxLength={200}
          placeholder="Author"
          aria-label="Author"
          className="w-44 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
        <input
          value={form.category}
          onChange={(event) => setForm({ ...form, category: event.target.value })}
          maxLength={80}
          placeholder="Shelf"
          aria-label="Shelf or category"
          className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
        <input
          type="number"
          min={0}
          value={form.copies}
          onChange={(event) => setForm({ ...form, copies: event.target.value })}
          aria-label="How many copies"
          className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums dark:border-slate-700 dark:bg-slate-900"
        />
        <button
          type="submit"
          disabled={add.isPending || !form.title.trim()}
          className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {add.isPending ? "Adding…" : "Add"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </form>
  );
}
