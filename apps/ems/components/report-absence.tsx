"use client";

import { useState } from "react";
import { errorMessage } from "@/lib/api";
import {
  ABSENCE_REASONS,
  useAbsenceNotes,
  useReportAbsence,
  useWithdrawAbsenceNote,
  type AbsenceNote,
} from "@/lib/use-absence-notes";

const today = () => new Date().toISOString().slice(0, 10);

/**
 * A parent telling the school their child will be away.
 *
 * The school marks a child absent, the office gets an alert, and somebody
 * telephones the family — when the parent knew at seven that morning. This is
 * the message that was missing.
 *
 * It is careful to promise only what it does. A note does not excuse an
 * absence; it tells the school, and the school decides. Saying otherwise
 * would leave a parent believing a matter was settled when the register still
 * says their child is missing.
 */
export function ReportAbsence({ studentProfileId, childName }: { studentProfileId: string; childName: string }) {
  const { data: notes } = useAbsenceNotes(studentProfileId);
  const report = useReportAbsence();
  const withdraw = useWithdrawAbsenceNote();

  const [open, setOpen] = useState(false);
  const [fromDate, setFrom] = useState(today());
  const [toDate, setTo] = useState(today());
  const [reason, setReason] = useState<string>("ILLNESS");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Live, rather than only after submitting: a parent who picks the wrong end
  // date should see it immediately, not be told off once they press send.
  const backwards = toDate < fromDate;
  const needsWhy = reason === "OTHER" && note.trim().length === 0;

  const submit = async () => {
    setError(null);
    try {
      await report.mutateAsync({
        studentProfileId,
        fromDate,
        toDate,
        reason,
        note: note.trim() || undefined,
      });
      setSent(true);
      setOpen(false);
      setNote("");
      setReason("ILLNESS");
      setFrom(today());
      setTo(today());
    } catch (err) {
      setError(errorMessage(err, "Couldn't send that to the school."));
    }
  };

  const live = (notes ?? []).filter((n) => n.state !== "WITHDRAWN").slice(0, 4);

  return (
    <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Absence</h2>
        {!open && (
          <button
            type="button"
            onClick={() => { setOpen(true); setSent(false); }}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-500"
          >
            Tell the school {childName.split(" ")[0]} will be away
          </button>
        )}
      </div>

      {sent && !open && (
        <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          Sent. The school will see it when they take the register.
        </p>
      )}

      {open && (
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium">
              First day away
              <input
                type="date"
                value={fromDate}
                onChange={(event) => {
                  setFrom(event.target.value);
                  // Almost every absence is one day, so the end follows the
                  // start until a parent deliberately moves it.
                  if (toDate < event.target.value) setTo(event.target.value);
                }}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
            <label className="text-xs font-medium">
              Last day away
              <input
                type="date"
                value={toDate}
                min={fromDate}
                onChange={(event) => setTo(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
          </div>

          {backwards && <p className="text-xs text-red-600">The last day cannot be before the first day.</p>}

          <label className="block text-xs font-medium">
            Reason
            <select
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              {ABSENCE_REASONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-medium">
            {reason === "OTHER" ? "Please say briefly why" : "Anything the school should know (optional)"}
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              maxLength={500}
              placeholder={reason === "ILLNESS" ? "You do not have to describe symptoms." : ""}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </label>

          {error && (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={report.isPending || backwards || needsWhy}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
            >
              {report.isPending ? "Sending…" : "Send to the school"}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setError(null); }}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
            >
              Cancel
            </button>
          </div>

          {/* Said plainly, because a parent who believes an absence is now
              "excused" will be surprised by the register. */}
          <p className="text-xs text-slate-500">
            This tells the school. It does not change the register — a teacher still marks attendance.
          </p>
        </div>
      )}

      {live.length > 0 && (
        <ul className="mt-3 space-y-2">
          {live.map((entry) => (
            <NoteRow key={entry.id} note={entry} onWithdraw={(id) => void withdraw.mutateAsync(id)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function NoteRow({ note, onWithdraw }: { note: AbsenceNote; onWithdraw: (id: string) => void }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900">
      <span className="min-w-0">
        <span className="font-medium">{note.dates}</span>
        <span className="text-slate-500"> · {note.reasonLabel}</span>
        {note.note && <span className="mt-0.5 block text-xs text-slate-500">{note.note}</span>}
      </span>

      <span className="flex shrink-0 items-center gap-2 text-xs">
        {note.state === "ACKNOWLEDGED" ? (
          <span className="text-emerald-600">Seen by the school</span>
        ) : (
          <span className="text-slate-500">Sent</span>
        )}
        {note.canWithdraw && (
          <button
            type="button"
            onClick={() => onWithdraw(note.id)}
            className="font-semibold text-brand-600 hover:underline"
          >
            Take back
          </button>
        )}
      </span>
    </li>
  );
}
