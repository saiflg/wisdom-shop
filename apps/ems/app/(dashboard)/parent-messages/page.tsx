"use client";

import { useState } from "react";
import { errorMessage } from "@/lib/api";
import { useParentThreads } from "@/lib/use-parent-messages";
import { ParentThread } from "@/components/parent-thread";
import { PersonPhoto } from "@/components/person-photo";

/**
 * The school's side of its conversations with families.
 *
 * One list for the whole school rather than a per-teacher inbox, because a
 * parent writes to the school and whoever is on duty answers. Threads waiting
 * on a reply come first — an unanswered parent is the thing an office most
 * needs to see, and chronological order buries it.
 */
export default function ParentMessagesPage() {
  const { data: threads, isLoading, error } = useParentThreads();
  const [openId, setOpenId] = useState<string | null>(null);

  const waiting = threads?.filter((thread) => thread.awaitingSchool).length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Messages from families</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          Every conversation is about one child and is shared by that child&apos;s teachers and the office — a
          family is never left waiting because one person is away.
        </p>
      </div>

      {waiting > 0 && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          {waiting} {waiting === 1 ? "family is" : "families are"} waiting for a reply.
        </p>
      )}

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {errorMessage(error, "Couldn't load these conversations.")}
        </p>
      )}

      {threads && threads.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
          No family has written yet.
        </p>
      )}

      <ul className="space-y-2">
        {threads?.map((thread) => (
          <li key={thread.studentProfileId}>
            <button
              type="button"
              onClick={() =>
                setOpenId((current) => (current === thread.studentProfileId ? null : thread.studentProfileId))
              }
              aria-expanded={openId === thread.studentProfileId}
              className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-4 text-start transition hover:border-brand-400 dark:border-slate-800"
            >
              <PersonPhoto userId={thread.studentUserId} name={thread.studentName} size="md" />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{thread.studentName}</span>
                  {thread.className && <span className="text-xs text-slate-500">{thread.className}</span>}
                  {thread.awaitingSchool && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                      waiting for a reply
                    </span>
                  )}
                </span>
                {thread.preview && (
                  <span className="mt-0.5 block truncate text-xs text-slate-500">{thread.preview}</span>
                )}
              </span>
              {thread.lastMessageAt && (
                <span className="shrink-0 text-xs text-slate-400">
                  {new Date(thread.lastMessageAt).toLocaleDateString()}
                </span>
              )}
            </button>

            {openId === thread.studentProfileId && (
              <div className="mt-2">
                <ParentThread studentProfileId={thread.studentProfileId} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
