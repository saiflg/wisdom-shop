"use client";

import { useState } from "react";
import { errorMessage } from "@/lib/api";
import { useClasses } from "@/lib/use-classes";
import {
  AUDIENCES,
  useAnnouncements,
  useDiscardDraft,
  usePreviewAnnouncement,
  useSendAnnouncement,
  useSendDraft,
  type AnnouncementPreview,
  type SentAnnouncement,
} from "@/lib/use-announcements";

/**
 * Telling the whole school something.
 *
 * The shape of this screen is one decision: **you cannot send without seeing
 * the count first**. An announcement reaches hundreds of people, costs money
 * per head on SMS, and cannot be recalled — so "Check who this reaches" comes
 * before "Send", and changing any field puts the check back.
 */
export default function AnnouncementsPage() {
  const { data: sent } = useAnnouncements();
  const { data: classes } = useClasses();
  const preview = usePreviewAnnouncement();
  const send = useSendAnnouncement();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<string>("ALL_PARENTS");
  const [classId, setClassId] = useState("");
  const [channels, setChannels] = useState<string[]>(["EMAIL"]);

  const [checked, setChecked] = useState<AnnouncementPreview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const input = { title, body, audience, classId: classId || undefined, channels };

  /* Any edit invalidates the count. Sending a notice to four hundred people
     on the strength of a figure calculated for different text is exactly the
     mistake this screen exists to prevent. */
  const changed = () => {
    setChecked(null);
    setResult(null);
  };

  const check = async () => {
    setProblem(null);
    setResult(null);
    try {
      setChecked(await preview.mutateAsync(input));
    } catch (err) {
      setChecked(null);
      setProblem(errorMessage(err, "Couldn't work out who this would reach."));
    }
  };

  const confirm = async () => {
    setProblem(null);
    try {
      const outcome = await send.mutateAsync(input);
      setResult(`Sent to ${outcome.sent} ${outcome.sent === 1 ? "person" : "people"}.`);
      setChecked(null);
      setTitle("");
      setBody("");
    } catch (err) {
      setProblem(errorMessage(err, "Couldn't send that."));
    }
  };

  const toggleChannel = (channel: string) => {
    setChannels((current) =>
      current.includes(channel) ? current.filter((c) => c !== channel) : [...current, channel],
    );
    changed();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Announcements</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          One message to a whole audience. Every send is recorded in the outbox, and anybody who could not be
          reached is listed rather than quietly skipped.
        </p>
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
        <label className="block text-sm font-medium">
          Title
          <input
            value={title}
            onChange={(event) => { setTitle(event.target.value); changed(); }}
            maxLength={150}
            placeholder="School closed on Friday"
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </label>

        <label className="block text-sm font-medium">
          Message
          <textarea
            value={body}
            onChange={(event) => { setBody(event.target.value); changed(); }}
            rows={4}
            maxLength={2000}
            placeholder="The school will be closed on Friday 21st for a public holiday."
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <span className="text-xs text-slate-500">{body.length}/2000</span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Who is this for?
            <select
              value={audience}
              onChange={(event) => { setAudience(event.target.value); changed(); }}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              {AUDIENCES.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          {audience === "CLASS" && (
            <label className="block text-sm font-medium">
              Which class?
              <select
                value={classId}
                onChange={(event) => { setClassId(event.target.value); changed(); }}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="">Choose a class…</option>
                {(classes ?? []).map((klass) => (
                  <option key={klass.id} value={klass.id}>{klass.name}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        <fieldset>
          <legend className="text-sm font-medium">How should it go out?</legend>
          <div className="mt-1 flex gap-4">
            {["EMAIL", "SMS"].map((channel) => (
              <label key={channel} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={channels.includes(channel)}
                  onChange={() => toggleChannel(channel)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600"
                />
                {channel === "EMAIL" ? "Email" : "Text message"}
              </label>
            ))}
          </div>
        </fieldset>

        {problem && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{problem}</p>}
        {result && <p role="status" className="text-sm font-medium text-emerald-600">{result}</p>}

        {/* The gate. There is deliberately no way to send without checking. */}
        {!checked ? (
          <button
            type="button"
            onClick={() => void check()}
            disabled={preview.isPending || !title.trim() || !body.trim() || channels.length === 0}
            className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
          >
            {preview.isPending ? "Checking…" : "Check who this reaches"}
          </button>
        ) : (
          <div className="space-y-3 rounded-xl border border-brand-200 bg-brand-50/60 p-4 dark:border-brand-900 dark:bg-brand-950/20">
            <p className="text-sm font-semibold">{checked.audience}</p>

            {checked.channels.map((plan) => (
              <div key={plan.channel} className="text-sm">
                <p className="font-medium">{plan.summary}</p>
                {plan.examples.length > 0 && (
                  <p className="text-xs text-slate-500">
                    e.g. {plan.examples.join(", ")}
                    {plan.reach > plan.examples.length ? ` and ${plan.reach - plan.examples.length} more` : ""}
                  </p>
                )}
                {plan.warning && (
                  <p className="mt-1 rounded-lg bg-amber-100 px-3 py-2 text-xs font-medium text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                    {plan.warning}
                  </p>
                )}
                {/* Named, not counted. "12 skipped" tells an office nothing;
                    the names tell them who to telephone instead. */}
                {plan.skippedCount > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-slate-500">
                      {plan.skippedCount} will not receive it — see who
                    </summary>
                    <ul className="mt-1 space-y-0.5">
                      {plan.skipped.map((person) => (
                        <li key={person.userId} className="text-xs text-slate-500">
                          {person.name} — {person.reason}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            ))}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void confirm()}
                disabled={send.isPending || checked.totalSends === 0}
                className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
              >
                {send.isPending ? "Sending…" : `Send to ${checked.totalSends}`}
              </button>
              <button
                type="button"
                onClick={() => setChecked(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
              >
                Back
              </button>
            </div>
          </div>
        )}
      </div>

      <section>
        {/* Drafts sit above the history because they are the only rows here
            that still need something doing. The API orders them this way; the
            screen does not re-sort. */}
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Drafts and what has been sent
        </h2>
        {(sent?.length ?? 0) === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Nothing announced yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {sent?.map((announcement) => (
              <li
                key={announcement.id}
                className={`rounded-xl border p-4 ${
                  announcement.status === "DRAFT"
                    ? "border-amber-300 dark:border-amber-900"
                    : "border-slate-200 dark:border-slate-800"
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold">
                    {announcement.title}
                    {announcement.status === "DRAFT" && (
                      <span className="ml-2 text-xs font-normal text-amber-600">draft — not sent</span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500">
                    {/* A draft has no send date, and inventing one would make
                        it read as sent in the one place people look. */}
                    {announcement.sentAt
                      ? new Date(announcement.sentAt).toLocaleString()
                      : "not sent yet"}
                    {announcement.sentByName ? ` · ${announcement.sentByName}` : ""}
                  </p>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-400">
                  {announcement.body || <span className="italic text-slate-400">Nothing written yet.</span>}
                </p>
                {announcement.status === "SENT" ? (
                  <p className="mt-1.5 text-xs text-slate-500">
                    {announcement.audienceLabel} · {announcement.channels.join(" and ").toLowerCase()} ·{" "}
                    reached {announcement.reached}
                    {announcement.skipped > 0 ? `, ${announcement.skipped} skipped` : ""}
                  </p>
                ) : (
                  <DraftActions announcement={announcement} />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * What can be done with a draft.
 *
 * Send goes through the same path as any announcement, so a draft that was
 * written weeks ago is checked against the school roll as it stands today —
 * not as it stood when somebody started writing.
 */
function DraftActions({ announcement }: { announcement: SentAnnouncement }) {
  const send = useSendDraft(announcement.id);
  const discard = useDiscardDraft();
  const [note, setNote] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const ready = Boolean(announcement.body?.trim() && announcement.audience && announcement.channels.length);

  const doSend = async () => {
    setNote(null);
    try {
      const result = await send.mutateAsync();
      setNote(`Sent to ${result.reached}.`);
    } catch (err) {
      setNote(errorMessage(err, "Could not send that draft"));
    }
  };

  return (
    <div className="mt-2 space-y-2">
      {!ready && (
        // Said before the button is pressed rather than as an error after.
        <p className="text-xs text-slate-500">
          Still needs {[
            announcement.body?.trim() ? null : "something written",
            announcement.audience ? null : "an audience",
            announcement.channels.length ? null : "a way to send it",
          ]
            .filter(Boolean)
            .join(", ")}
          .
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {/* Two presses to send. This reaches every family in the school at
            once, and a draft sitting in a list is exactly the thing somebody
            clicks by accident while scrolling. */}
        {confirming ? (
          <>
            <button
              type="button"
              onClick={doSend}
              disabled={send.isPending}
              className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {send.isPending ? "Sending…" : "Yes, send it now"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-700"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={!ready}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-40 dark:border-slate-700"
          >
            Send this
          </button>
        )}
        <button
          type="button"
          onClick={() => discard.mutateAsync(announcement.id)}
          disabled={discard.isPending}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-500 disabled:opacity-50 dark:border-slate-700"
        >
          Discard
        </button>
      </div>
      {note && <p className="text-xs text-slate-600 dark:text-slate-400">{note}</p>}
    </div>
  );
}
