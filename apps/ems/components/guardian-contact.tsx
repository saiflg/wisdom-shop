"use client";

import { useState } from "react";
import { errorMessage } from "@/lib/api";
import { useUpdateGuardianContact, type GuardianEntry } from "@/lib/use-guardians";

/**
 * How the school can reach a family, and how to fix it when it cannot.
 *
 * The parents overview has always been able to say "this family has no email
 * or phone on file". Until now the directory showed an email, no telephone
 * number, and no way to change either — so the alert pointed at a page where
 * nothing could be done.
 */
export function GuardianContact({ guardian }: { guardian: GuardianEntry }) {
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState(guardian.email ?? "");
  const [phone, setPhone] = useState(guardian.phone ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const update = useUpdateGuardianContact();

  const unreachable = !guardian.email && !guardian.phone;

  const start = () => {
    setEmail(guardian.email ?? "");
    setPhone(guardian.phone ?? "");
    setMessage(null);
    setSaved(null);
    setEditing(true);
  };

  const save = async () => {
    setMessage(null);
    try {
      const result = await update.mutateAsync({
        guardianUserId: guardian.guardianUserId,
        // Empty means "clear it", which is different from not sending it at
        // all — so both are always sent from a form that shows both.
        email: email.trim() === "" ? null : email,
        phone: phone.trim() === "" ? null : phone,
      });
      setEditing(false);
      setSaved(result.changed.length === 0 ? "Nothing changed." : "Saved.");
    } catch (err) {
      setMessage(errorMessage(err, "Couldn't save those details."));
    }
  };

  // Warned before pressing save rather than only refused after: a rule a
  // person meets only as an error teaches them the form is broken.
  const wouldLockOut = guardian.hasPassword && Boolean(guardian.email) && email.trim() === "";

  if (!editing) {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className={unreachable ? "font-semibold text-amber-700 dark:text-amber-400" : "text-slate-500"}>
          {guardian.email ?? "No email"}
          {guardian.phone ? ` · ${guardian.phone}` : " · no phone"}
        </span>
        <button
          type="button"
          onClick={start}
          className="font-semibold text-brand-600 hover:underline"
        >
          Edit contact details
        </button>
        {saved && <span className="text-emerald-600">{saved}</span>}
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs font-medium">
          Email
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            placeholder="none on file"
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
        <label className="text-xs font-medium">
          Phone
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            type="tel"
            placeholder="none on file"
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </label>
      </div>

      {wouldLockOut && (
        <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          This parent signs in with that email address. Clearing it would lock them out of the portal, so it
          will be refused.
        </p>
      )}

      {message && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {message}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={update.isPending || wouldLockOut}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
        >
          {update.isPending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
        >
          Cancel
        </button>
      </div>

      <p className="text-xs text-slate-500">
        The phone number is stored exactly as you type it — this software never reformats it.
      </p>
    </div>
  );
}
