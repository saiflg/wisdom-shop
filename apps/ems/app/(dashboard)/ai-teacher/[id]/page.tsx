"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ApiError } from "@/lib/api";
import { useTutorSession, useAskTutor, useEndTutorSession } from "@/lib/use-ai-teacher";
import { useAuthStore } from "@/store/auth-store";

export default function TutorLessonPage() {
  const params = useParams<{ id: string }>();
  const sessionId = params?.id ?? "";
  const user = useAuthStore((s) => s.user);

  const { data: session, isLoading, error } = useTutorSession(sessionId);
  const ask = useAskTutor(sessionId);
  const endSession = useEndTutorSession(sessionId);

  const [question, setQuestion] = useState("");
  const [askError, setAskError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  // Follow the conversation the way a chat should, without stealing focus
  // from the input.
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [session?.turns?.length, ask.isPending]);

  // Only the student whose lesson it is may speak in it; everyone else is
  // reading a record. The API enforces this — the UI just does not pretend
  // otherwise.
  const isOwner = Boolean(user && session?.startedByUser && session.startedByUser.id === user.id);
  const canAsk = isOwner && session?.status === "ACTIVE";

  const send = async () => {
    const trimmed = question.trim();
    if (!trimmed || ask.isPending) return;

    setAskError(null);
    setQuestion("");
    try {
      await ask.mutateAsync(trimmed);
    } catch (err) {
      // Put the question back so it is not lost to a failed send.
      setQuestion(trimmed);
      setAskError(err instanceof ApiError ? err.message : "Couldn't reach the teacher just now.");
    }
  };

  if (isLoading) return <p className="text-sm text-slate-500">Loading lesson…</p>;
  if (error || !session) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-600 dark:text-red-400">Couldn&apos;t open that lesson.</p>
        <Link href="/ai-teacher" className="text-sm font-semibold text-brand-600 hover:underline">
          Back to lessons
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-9rem)] flex-col space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/ai-teacher" className="text-xs font-semibold text-brand-600 hover:underline">
            ← All lessons
          </Link>
          <h1 className="mt-1 truncate text-xl font-bold tracking-tight">{session.topic}</h1>
          <p className="text-xs text-slate-500">
            {session.subject?.name}
            {session.subject?.gradeLevel ? ` · ${session.subject.gradeLevel}` : ""}
            {session.startedByUser && !isOwner
              ? ` · ${session.startedByUser.firstName} ${session.startedByUser.lastName}`
              : ""}
          </p>
        </div>
        {session.status === "ACTIVE" && (
          <button
            type="button"
            onClick={() => endSession.mutate()}
            disabled={endSession.isPending}
            className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-900"
          >
            End lesson
          </button>
        )}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto rounded-xl border border-slate-200 p-4 dark:border-slate-800">
        {session.turns?.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-500">
            {canAsk ? "Ask your first question below." : "Nothing has been asked yet."}
          </p>
        )}

        {session.turns?.map((turn) => (
          <div key={turn.id} className={turn.role === "STUDENT" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                turn.role === "STUDENT"
                  ? "max-w-[80%] rounded-2xl rounded-br-sm bg-brand-600 px-4 py-2.5 text-sm text-white"
                  : "max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-2.5 text-sm dark:bg-slate-800"
              }
            >
              {turn.content}
            </div>
          </div>
        ))}

        {ask.isPending && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-2.5 text-sm text-slate-500 dark:bg-slate-800">
              Thinking…
            </div>
          </div>
        )}
        <div ref={bottom} />
      </div>

      {askError && <p className="text-sm text-red-600 dark:text-red-400">{askError}</p>}

      {canAsk ? (
        <div className="flex gap-2">
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            placeholder="Ask a question…"
            maxLength={1000}
            className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={ask.isPending || question.trim().length === 0}
            className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      ) : (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-900">
          {session.status === "ENDED"
            ? "This lesson has ended. Its transcript is kept as a record."
            : "You are reading this lesson's transcript. Only the student can ask questions in it."}
        </p>
      )}
    </div>
  );
}
