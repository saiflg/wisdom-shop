"use client";

import { useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/api";
import {
  useParentThread,
  usePostParentMessage,
  useWithdrawParentMessage,
} from "@/lib/use-parent-messages";

/**
 * One conversation between a family and the school.
 *
 * The same component both ways round — a parent writing to the school and a
 * teacher answering are the same conversation, and building two views of it
 * is how they drift into disagreeing about what was said.
 */
export function ParentThread({ studentProfileId }: { studentProfileId: string }) {
  const { data, isLoading, error } = useParentThread(studentProfileId);
  const post = usePostParentMessage(studentProfileId);
  const withdraw = useWithdrawParentMessage(studentProfileId);

  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const count = data?.messages.length ?? 0;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [count]);

  if (isLoading) return <p className="text-sm text-slate-500">Loading the conversation…</p>;
  if (error || !data) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
        {errorMessage(error, "Couldn't open that conversation.")}
      </p>
    );
  }

  const send = async () => {
    setProblem(null);
    try {
      await post.mutateAsync(draft);
      setDraft("");
    } catch (err) {
      // The API's wording is written for a person — "Slow down a moment
      // before sending another message" — and replacing it would be a
      // downgrade.
      setProblem(errorMessage(err, "Couldn't send that."));
    }
  };

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800">
      <div className="max-h-[26rem] space-y-3 overflow-y-auto p-4">
        {data.messages.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-500">
            {data.youAre === "FAMILY"
              ? "Nothing yet. Write to the school about your child here — any of their teachers can answer."
              : "Nothing yet from this family."}
          </p>
        )}

        {data.messages.map((message) => {
          const fromSchool = message.side === "SCHOOL";
          return (
            <div key={message.id} className={message.mine ? "flex flex-col items-end" : "flex flex-col items-start"}>
              <div
                className={
                  message.deleted
                    ? "max-w-[85%] rounded-2xl border border-dashed border-slate-300 px-4 py-2 text-sm italic text-slate-500 dark:border-slate-700"
                    : message.mine
                      ? "max-w-[85%] rounded-2xl bg-brand-600 px-4 py-2 text-sm text-white"
                      : fromSchool
                        ? "max-w-[85%] rounded-2xl bg-brand-50 px-4 py-2 text-sm dark:bg-brand-950/40"
                        : "max-w-[85%] rounded-2xl bg-slate-100 px-4 py-2 text-sm dark:bg-slate-800"
                }
              >
                <p className="text-xs font-semibold opacity-80">
                  {message.authorName}
                  {fromSchool && " · school"}
                </p>
                <p className="mt-0.5 whitespace-pre-wrap break-words">{message.body}</p>
              </div>

              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
                <span>{new Date(message.createdAt).toLocaleString()}</span>
                {!message.deleted && message.mine && (
                  <button
                    type="button"
                    onClick={() =>
                      void withdraw
                        .mutateAsync(message.id)
                        .catch((err) => setProblem(errorMessage(err, "Couldn't withdraw that.")))
                    }
                    className="hover:underline"
                  >
                    Withdraw
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {data.canPost && (
        <div className="space-y-2 border-t border-slate-200 p-4 dark:border-slate-800">
          <div className="flex flex-wrap gap-2">
            <label htmlFor="parent-draft" className="sr-only">
              Write a message
            </label>
            <input
              id="parent-draft"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && draft.trim()) void send();
              }}
              placeholder={data.youAre === "FAMILY" ? "Write to the school…" : "Reply to the family…"}
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

          {data.youAre === "FAMILY" && (
            <p className="text-xs text-slate-500">
              This goes to your child&apos;s teachers and the school office, not to one person — so somebody can
              always answer.
            </p>
          )}

          {problem && (
            <p role="alert" className="text-sm text-red-600">
              {problem}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
