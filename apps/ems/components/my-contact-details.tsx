"use client";

import { useState } from "react";
import { errorMessage } from "@/lib/api";
import { useMyContact, useUpdateMyContact } from "@/lib/use-guardians";

/**
 * What the school holds for this parent, and the one part of it they may
 * change themselves.
 *
 * The telephone number, and nothing else. The email address is what they
 * sign in with, and an account able to rewrite its own login identifier
 * turns a session that should not have been open into a permanent one — so
 * changing that goes through the office, who can see who they are talking
 * to. Saying so beside the field is kinder than a refusal after typing.
 */
export function MyContactDetails() {
  const { data: contact, isLoading } = useMyContact();
  const update = useUpdateMyContact();

  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (isLoading || !contact) return null;

  const start = () => {
    setPhone(contact.phone ?? "");
    setMessage(null);
    setSaved(false);
    setEditing(true);
  };

  const save = async () => {
    setMessage(null);
    try {
      await update.mutateAsync({ phone: phone.trim() === "" ? null : phone });
      setEditing(false);
      setSaved(true);
    } catch (err) {
      setMessage(errorMessage(err, "Couldn't save your number."));
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Your contact details</h2>
        {!editing && (
          <button type="button" onClick={start} className="text-xs font-semibold text-brand-600 hover:underline">
            Change my phone number
          </button>
        )}
      </div>

      {/* Worth saying plainly: a parent with no number on file is one the
          school cannot ring if their child is taken ill. */}
      {!contact.phone && !editing && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          The school has no phone number for you. Please add one so they can reach you about your child.
        </p>
      )}

      {editing ? (
        <div className="mt-3 space-y-2">
          <label className="block text-xs font-medium">
            Phone number
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              type="tel"
              autoFocus
              placeholder="e.g. 0803 123 4567"
              className="mt-1 w-full max-w-xs rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </label>

          {message && (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400">
              {message}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={update.isPending}
              className="rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
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
        </div>
      ) : (
        <dl className="mt-2 space-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-slate-500">Phone</dt>
            <dd>{contact.phone ?? <span className="text-slate-400">Not on file</span>}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-slate-500">Email</dt>
            <dd className="min-w-0">
              {contact.email ?? <span className="text-slate-400">Not on file</span>}
              <span className="mt-0.5 block text-xs text-slate-500">
                You sign in with this. Ask the school office to change it.
              </span>
            </dd>
          </div>
        </dl>
      )}

      {saved && <p className="mt-2 text-xs text-emerald-600">Saved. Thank you.</p>}
    </section>
  );
}
