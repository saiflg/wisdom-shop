"use client";

import { useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/api";
import {
  useConversation,
  useLockConversation,
  usePostMessage,
  useRemoveMessage,
  useReportMessage,
  type ChatMessage,
} from "@/lib/use-class-chat";

/**
 * The class conversation.
 *
 * The supervision notice comes from the server and is rendered verbatim,
 * above everything, every time — not tucked into a tooltip or shown once on
 * first visit. A child should never be surprised to learn their teacher read
 * this.
 */
export function ClassChat({ classId }: { classId: string }) {
  const { data, isLoading, error } = useConversation(classId);
  const post = usePostMessage(classId);
  const remove = useRemoveMessage(classId);
  const report = useReportMessage(classId);
  const lock = useLockConversation(classId);

  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const count = data?.messages.length ?? 0;

  // Scroll on arrival and on each new message, not on every poll — otherwise
  // reading older messages fights the five-second refresh.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [count]);

  if (isLoading) return <p className="text-sm text-slate-500">Loading the class chat…</p>;
  if (error || !data) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
        {errorMessage(error, "Couldn't open the class chat.")}
      </p>
    );
  }

  const send = async () => {
    setProblem(null);
    setNote(null);
    try {
      await post.mutateAsync(draft);
      setDraft("");
    } catch (err) {
      // The API's own wording — "Slow down a moment before sending another
      // message" — is written for a child. Replacing it with "failed" would
      // be a downgrade.
      setProblem(errorMessage(err, "Couldn't send that."));
    }
  };

  return (
    <section className="flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-4 dark:border-slate-800">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Class chat</h2>
        {data.canModerate && (
          <button
            type="button"
            onClick={() =>
              void lock
                .mutateAsync({ locked: !data.locked, reason: data.locked ? undefined : "Paused by a teacher" })
                .catch((err) => setProblem(errorMessage(err, "Couldn't change that.")))
            }
            className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            {data.locked ? "Let students post again" : "Pause students posting"}
          </button>
        )}
      </div>

      <p className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        {data.notice}
      </p>

      <div className="max-h-[28rem] space-y-3 overflow-y-auto p-4">
        {data.messages.length === 0 && (
          <p className="text-sm text-slate-500">Nothing here yet. Say hello to your class.</p>
        )}
        {data.messages.map((message) => (
          <Message
            key={message.id}
            message={message}
            canModerate={data.canModerate}
            onRemove={() =>
              void remove
                .mutateAsync(message.id)
                .catch((err) => setProblem(errorMessage(err, "Couldn't remove that.")))
            }
            onReport={async (reason) => {
              setProblem(null);
              try {
                const result = await report.mutateAsync({ messageId: message.id, reason });
                setNote(result.message);
              } catch (err) {
                setProblem(errorMessage(err, "Couldn't report that."));
              }
            }}
          />
        ))}
        <div ref={endRef} />
      </div>

      <div className="space-y-2 border-t border-slate-200 p-4 dark:border-slate-800">
        {data.locked && !data.canPost && (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            A teacher has paused this chat{data.lockedReason ? `: ${data.lockedReason}` : "."}
          </p>
        )}

        {data.canPost && (
          <div className="flex flex-wrap gap-2">
            <label htmlFor="chat-draft" className="sr-only">
              Message your class
            </label>
            <input
              id="chat-draft"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && draft.trim()) void send();
              }}
              placeholder="Message your class…"
              maxLength={2000}
              className="min-w-[12rem] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={post.isPending || !draft.trim()}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
            >
              Send
            </button>
          </div>
        )}

        {!data.canPost && !data.locked && (
          <p className="text-sm text-slate-500">You can read this conversation but not post in it.</p>
        )}

        {problem && (
          <p role="alert" className="text-sm text-red-600">
            {problem}
          </p>
        )}
        {note && (
          <p role="status" className="text-sm text-emerald-600">
            {note}
          </p>
        )}
      </div>
    </section>
  );
}

function Message({
  message,
  canModerate,
  onRemove,
  onReport,
}: {
  message: ChatMessage;
  canModerate: boolean;
  onRemove: () => void;
  onReport: (reason: string) => void;
}) {
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");

  const staffAuthor = message.authorRole === "STAFF";

  return (
    <div className={message.mine ? "flex flex-col items-end" : "flex flex-col items-start"}>
      <div
        className={
          message.deleted
            ? "max-w-[85%] rounded-2xl border border-dashed border-slate-300 px-4 py-2 text-sm italic text-slate-500 dark:border-slate-700"
            : staffAuthor
              ? "max-w-[85%] rounded-2xl bg-brand-50 px-4 py-2 text-sm dark:bg-brand-950/40"
              : message.mine
                ? "max-w-[85%] rounded-2xl bg-brand-600 px-4 py-2 text-sm text-white"
                : "max-w-[85%] rounded-2xl bg-slate-100 px-4 py-2 text-sm dark:bg-slate-800"
        }
      >
        <p className="text-xs font-semibold opacity-80">
          {message.authorName}
          {staffAuthor && " · teacher"}
        </p>
        <p className="mt-0.5 whitespace-pre-wrap break-words">{message.body}</p>
        {/* Staff see what a removed message said. Students never do, including
            the author — see toMessageView. */}
        {message.deleted && message.removedBody && (
          <p className="mt-1 rounded bg-slate-200 px-2 py-1 text-xs not-italic text-slate-700 dark:bg-slate-700 dark:text-slate-200">
            Removed text: {message.removedBody}
          </p>
        )}
      </div>

      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
        <span>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        {!message.deleted && (message.mine || canModerate) && (
          <button type="button" onClick={onRemove} className="hover:underline">
            Remove
          </button>
        )}
        {!message.deleted && !message.mine && (
          <button type="button" onClick={() => setReporting((open) => !open)} className="hover:underline">
            Tell a teacher
          </button>
        )}
      </div>

      {reporting && (
        <div className="mt-1 flex w-full max-w-md flex-wrap gap-2">
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="What is wrong with this message?"
            className="min-w-[10rem] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
          />
          <button
            type="button"
            disabled={reason.trim().length < 3}
            onClick={() => {
              onReport(reason.trim());
              setReporting(false);
              setReason("");
            }}
            className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            Send to a teacher
          </button>
        </div>
      )}
    </div>
  );
}
