"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ApiError } from "@/lib/api";
import {
  useTutorSession,
  useAskTutor,
  useContinueClass,
  usePauseClass,
  useResumeClass,
  useEndTutorSession,
  type LessonResource,
  type TutorTurn,
} from "@/lib/use-ai-teacher";
import { useAuthStore } from "@/store/auth-store";

export default function TutorLessonPage() {
  const params = useParams<{ id: string }>();
  const sessionId = params?.id ?? "";
  const user = useAuthStore((s) => s.user);

  const { data: session, isLoading, error } = useTutorSession(sessionId);
  const ask = useAskTutor(sessionId);
  const continueClass = useContinueClass(sessionId);
  const pause = usePauseClass(sessionId);
  const resume = useResumeClass(sessionId);
  const endSession = useEndTutorSession(sessionId);

  const [question, setQuestion] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const busy = ask.isPending || continueClass.isPending;

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [session?.turns?.length, busy]);

  // Only the student whose lesson it is may speak in it; everyone else is
  // reading a record. The API enforces this — the UI just does not pretend
  // otherwise.
  const isOwner = Boolean(user && session?.startedByUser && session.startedByUser.id === user.id);
  const canAct = isOwner && session?.status !== "ENDED";
  const isClass = session?.mode === "AUTO";

  const run = async (action: () => Promise<unknown>, fallback: string) => {
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : fallback);
    }
  };

  const send = async () => {
    const trimmed = question.trim();
    if (!trimmed || busy) return;

    setActionError(null);
    setQuestion("");
    try {
      await ask.mutateAsync(trimmed);
    } catch (err) {
      // Put the question back so it is not lost to a failed send.
      setQuestion(trimmed);
      setActionError(err instanceof ApiError ? err.message : "Couldn't reach the teacher just now.");
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
        <div className="min-w-0 flex-1">
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

          {isClass && session.course && (
            <div className="mt-3 max-w-md">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>
                  {session.finished
                    ? "Course complete"
                    : `Next: ${session.currentLesson?.title ?? "—"}`}
                </span>
                <span>
                  {session.position} of {session.course.lessons.length}
                </span>
              </div>
              <div
                className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
                role="progressbar"
                aria-valuenow={session.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Course progress"
              >
                <div className="h-full bg-brand-600 transition-all" style={{ width: `${session.percent}%` }} />
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 gap-2">
          {canAct && isClass && session.status === "ACTIVE" && !session.finished && (
            <button
              type="button"
              onClick={() => void run(() => pause.mutateAsync(), "Couldn't pause the class.")}
              disabled={pause.isPending}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-900"
            >
              Pause
            </button>
          )}
          {session.status !== "ENDED" && isOwner && (
            <button
              type="button"
              onClick={() => void run(() => endSession.mutateAsync(), "Couldn't end the lesson.")}
              disabled={endSession.isPending}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-900"
            >
              End
            </button>
          )}
        </div>
      </div>

      {isClass && session.status === "PAUSED" && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          Paused. Pick up at <strong>{session.currentLesson?.title ?? "the next lesson"}</strong> whenever you like.
        </p>
      )}

      {/* Polite rather than assertive: a new lesson should be announced when
          the screen reader reaches a natural pause, not cut the student off
          mid-word. */}
      <div
        className="flex-1 space-y-3 overflow-y-auto rounded-xl border border-slate-200 p-4 dark:border-slate-800"
        role="log"
        aria-live="polite"
        aria-label="Lesson transcript"
      >
        {session.turns?.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-500">
            {!canAct
              ? "Nothing has been taught yet."
              : isClass
                ? "Press Start the class below when you're ready."
                : "Ask your first question below."}
          </p>
        )}

        {session.turns?.map((turn) => <Turn key={turn.id} turn={turn} />)}

        {busy && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-2.5 text-sm text-slate-500 dark:bg-slate-800">
              {continueClass.isPending ? "Preparing the next lesson…" : "Thinking…"}
            </div>
          </div>
        )}
        <div ref={bottom} />
      </div>

      {/* Demonstrations a teacher added. Offered, never forced: the student
          decides whether to watch before carrying on. */}
      {canAct && isClass && !session.finished && (session.resources?.length ?? 0) > 0 && (
        <Demonstrations resources={session.resources ?? []} />
      )}

      {actionError && <p className="text-sm text-red-600 dark:text-red-400">{actionError}</p>}

      {canAct ? (
        <div className="space-y-2">
          {isClass && !session.finished && (
            <button
              type="button"
              onClick={() => void run(() => continueClass.mutateAsync(), "Couldn't load the next lesson.")}
              disabled={busy}
              className="w-full rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
            >
              {session.position === 0
                ? "Start the class"
                : session.status === "PAUSED"
                  ? `Resume: ${session.currentLesson?.title ?? "next lesson"}`
                  : `Continue: ${session.currentLesson?.title ?? "next lesson"}`}
            </button>
          )}

          {isClass && session.finished && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
              You&apos;ve finished this course. You can still ask questions about it below.
            </p>
          )}

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
              placeholder={isClass ? "Ask about this lesson…" : "Ask a question…"}
              maxLength={1000}
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-900"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={busy || question.trim().length === 0}
              className="rounded-lg border border-slate-300 px-5 py-2 text-sm font-semibold transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-900"
            >
              Ask
            </button>
          </div>
          {isClass && (
            <p className="text-xs text-slate-500">Asking a question won&apos;t skip your place in the course.</p>
          )}
        </div>
      ) : (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-900">
          {session.status === "ENDED"
            ? "This lesson has ended. Its transcript is kept as a record."
            : "You are reading this lesson's transcript. Only the student can take part in it."}
        </p>
      )}
    </div>
  );
}

function Turn({ turn }: { turn: TutorTurn }) {
  if (turn.role === "STUDENT") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-brand-600 px-4 py-2.5 text-sm text-white">
          <span className="sr-only">You asked: </span>
          {turn.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] space-y-3 rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-2.5 dark:bg-slate-800">
        <span className="sr-only">Teacher: </span>
        <p className="whitespace-pre-wrap text-sm">{turn.content}</p>

        {turn.diagram && (
          <figure>
            {/* Sanitised server-side before it was ever stored — see
                sanitize-svg.ts. The safety lives at the point of storage, so
                a diagram that reached the database is one that passed. */}
            <div
              role="img"
              aria-label={turn.diagramAlt ?? "Diagram"}
              className="overflow-x-auto rounded-lg bg-white p-3 dark:bg-slate-900 [&>svg]:h-auto [&>svg]:w-full [&>svg]:max-w-md"
              dangerouslySetInnerHTML={{ __html: turn.diagram }}
            />
            {/* Shown, not only announced: a description written for a screen
                reader is just as useful to a student who finds the picture
                hard to interpret. */}
            {turn.diagramAlt && (
              <figcaption className="mt-1.5 text-xs text-slate-500">{turn.diagramAlt}</figcaption>
            )}
          </figure>
        )}

        <ReadAloud text={[turn.content, turn.diagramAlt].filter(Boolean).join(". ")} />
      </div>
    </div>
  );
}

/**
 * Reads a lesson out.
 *
 * The browser's own speech synthesiser: no API, no cost, no audio leaving the
 * device, and it works offline. Hidden entirely where it is unsupported
 * rather than offering a button that does nothing.
 */
function ReadAloud({ text }: { text: string }) {
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    // Speech carries on after the component unmounts, so a student who
    // navigates away mid-sentence is not followed around by it.
    return () => window.speechSynthesis?.cancel();
  }, []);

  if (!supported || !text) return null;

  const toggle = () => {
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="text-xs font-semibold text-brand-600 hover:underline"
      aria-label={speaking ? "Stop reading this lesson aloud" : "Read this lesson aloud"}
    >
      {speaking ? "◼ Stop reading" : "▶ Read aloud"}
    </button>
  );
}

function Demonstrations({ resources }: { resources: LessonResource[] }) {
  const [watching, setWatching] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Before you carry on — optional
      </p>
      <ul className="mt-2 space-y-2">
        {resources.map((resource) => (
          <li key={resource.id}>
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-sm">{resource.title}</span>
              {resource.embedUrl ? (
                <button
                  type="button"
                  onClick={() => setWatching(watching === resource.id ? null : resource.id)}
                  className="shrink-0 rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
                >
                  {watching === resource.id ? "Hide" : "Watch"}
                </button>
              ) : (
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="shrink-0 rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
                >
                  Open
                </a>
              )}
            </div>
            {watching === resource.id && resource.embedUrl && (
              <div className="mt-2 aspect-video w-full overflow-hidden rounded-lg bg-black">
                <iframe
                  src={resource.embedUrl}
                  title={resource.title}
                  allowFullScreen
                  // Only hosts the server vetted reach this point, and even
                  // they get no more than they need.
                  sandbox="allow-scripts allow-same-origin allow-presentation"
                  referrerPolicy="no-referrer"
                  className="h-full w-full border-0"
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
