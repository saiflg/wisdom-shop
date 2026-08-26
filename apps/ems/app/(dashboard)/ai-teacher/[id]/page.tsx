"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { BoardDiagram, BoardText, ChalkThinking } from "@/components/lesson-board";
import { ClassChat } from "@/components/class-chat";
import { useMyClasses } from "@/lib/use-class-chat";
import { useLessonVoice } from "@/lib/use-lesson-voice";

export default function TutorLessonPage() {
  const params = useParams<{ id: string }>();
  const sessionId = params?.id ?? "";
  const user = useAuthStore((s) => s.user);

  const board = useRef<HTMLDivElement>(null);
  const [fullScreen, setFullScreen] = useState(false);
  const voice = useLessonVoice();
  const spokenUpTo = useRef<string | null>(null);

  const { data: session, isLoading, error } = useTutorSession(sessionId);
  const ask = useAskTutor(sessionId);
  const continueClass = useContinueClass(sessionId);
  const pause = usePauseClass(sessionId);
  const resume = useResumeClass(sessionId);
  const endSession = useEndTutorSession(sessionId);

  const [question, setQuestion] = useState("");
  /*
   * Which demonstration is playing on the board.
   *
   * Held here rather than inside the panel so the player can be rendered in
   * the board column at board size. Inside the panel it was a thumbnail
   * beneath a list — fine on a laptop, useless on a projector, and in full
   * screen it sat below the fold entirely.
   */
  const [watching, setWatching] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const busy = ask.isPending || continueClass.isPending;

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [session?.turns?.length, busy]);

  // Read each new thing the teacher says, once. Keyed on the turn's id rather
  // than the count, so a refetch that returns the same transcript does not
  // start the whole lesson again.
  const turns = session?.turns;
  useEffect(() => {
    if (!voice.enabled || !turns?.length) return;
    const last = turns[turns.length - 1];
    if (!last || last.role !== "TUTOR" || spokenUpTo.current === last.id) return;
    spokenUpTo.current = last.id;
    voice.speak(last.content);
  }, [turns, voice]);

  // Stop talking the moment narration is switched off, rather than finishing
  // the paragraph — somebody turning it off usually wants silence now.
  useEffect(() => {
    if (!voice.enabled) voice.stop();
  }, [voice.enabled, voice]);

  /**
   * Real full screen, not a div that covers the viewport.
   *
   * This used to set `fixed inset-0 z-50` and nothing else, which fills the
   * browser's *content area* and leaves the address bar, the tabs and the
   * taskbar exactly where they were. On a laptop that looks like a bug; on
   * the projector a class is actually watching, it wastes the top third of
   * the screen. `document.fullscreenElement` was null the whole time.
   *
   * The overlay classes are kept — they are what makes the lesson fill
   * whatever space it is given, and they are also the fallback when the
   * browser refuses the request (an iframe without `allowfullscreen`, or a
   * policy that forbids it). Refusal then degrades to the old behaviour
   * rather than to a button that does nothing.
   */
  const toggleFullScreen = useCallback(() => {
    /*
     * Our own state decides, not `document.fullscreenElement`.
     *
     * Keying the toggle off the browser's flag looked right and stranded
     * anybody whose browser had refused the request: the overlay was up, the
     * flag was null, so every further press re-entered instead of leaving.
     * Escape still worked, which made it look like a broken button rather
     * than the wrong condition.
     */
    if (fullScreen) {
      // Only if the browser actually granted it; harmless when it did not.
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      setFullScreen(false);
      return;
    }

    setFullScreen(true);
    // Must happen inside the click for the browser to allow it.
    void board.current?.requestFullscreen?.().catch(() => {
      // Kept full screen: the overlay alone is still better than nothing.
    });
  }, [fullScreen]);

  // The browser's own exits — Escape, F11, the floating "leave full screen"
  // chip — never touch React state, so without this the button would still
  // read "Exit full screen" after the page had already left it.
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setFullScreen(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Escape also leaves the fallback overlay, which the browser knows nothing
  // about. A child who cannot find the way out of a full-screen page is stuck.
  useEffect(() => {
    if (!fullScreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.fullscreenElement) setFullScreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullScreen]);

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

  const resources = session.resources ?? [];
  const watchingResource = resources.find((resource) => resource.id === watching) ?? null;

  return (
    <div
      ref={board}
      className={
        fullScreen
          ? "lesson-fullscreen fixed inset-0 z-50 flex flex-col space-y-4 overflow-y-auto bg-white p-6 dark:bg-slate-950"
          : "flex h-[calc(100vh-9rem)] flex-col space-y-4"
      }
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Link href="/ai-teacher" className="text-xs font-semibold text-brand-600 hover:underline">
            ← All lessons
          </Link>
          <h1 className="mt-1 truncate text-xl font-bold tracking-tight">
            {session.followsScheme && session.currentLesson ? session.currentLesson.title : session.topic}
          </h1>
          <p className="text-xs text-slate-500">
            {session.subject?.name}
            {session.subject?.gradeLevel ? ` · ${session.subject.gradeLevel}` : ""}
            {session.startedByUser && !isOwner
              ? ` · ${session.startedByUser.firstName} ${session.startedByUser.lastName}`
              : ""}
          </p>

          {/* A student who typed "adverb" and was given "Parts of speech" has
              not been ignored — the class is following the school's published
              scheme, which is the point of anchoring it to one. Saying so is
              the difference between a lesson that looks wrong and one that
              looks deliberate. */}
          {session.followsScheme && (
            <p className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-900 dark:bg-brand-950/40 dark:text-brand-200">
              You asked about <span className="font-semibold">{session.topic}</span>. This class follows your
              school&apos;s scheme of work, so it starts where your class is up to — your question is covered as
              the course reaches it, and you can ask about it any time in the box below.
            </p>
          )}

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

        <div className="flex shrink-0 flex-wrap gap-2">
          {voice.supported && (
            <button
              type="button"
              onClick={() => voice.setEnabled((on) => !on)}
              aria-pressed={voice.enabled}
              title={voice.voiceName ? `Read aloud using ${voice.voiceName}` : "Read the lesson aloud"}
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
                voice.enabled
                  ? "border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300"
                  : "border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
              }`}
            >
              {voice.enabled ? (voice.speaking ? "Speaking…" : "Voice on") : "Read aloud"}
            </button>
          )}

          <button
            type="button"
            onClick={toggleFullScreen}
            aria-pressed={fullScreen}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
          >
            {fullScreen ? "Exit full screen" : "Full screen"}
          </button>

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

      {/* The board and the class beside it — stacked on a phone, side by side
          once there is room. Deliberately not a floating panel over the
          board: the lesson is what the student came for, and a chat window
          covering the diagram would be the wrong thing to lose. */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 xl:flex-row">
        {/* Polite rather than assertive: a new lesson should be announced when
            the screen reader reaches a natural pause, not cut the student off
            mid-word. */}
        <div
          className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-xl border border-slate-200 p-4 dark:border-slate-800"
          role="log"
          aria-live="polite"
          aria-label="Lesson transcript"
        >
          {watchingResource && (
            <div className="chalk-in mb-3">
              <div className="mx-auto w-full max-w-4xl">
                <div className="flex items-center justify-between gap-3 pb-2">
                  <p className="min-w-0 truncate text-sm font-semibold">{watchingResource.title}</p>
                  <button
                    type="button"
                    onClick={() => setWatching(null)}
                    className="shrink-0 rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
                  >
                    Close
                  </button>
                </div>
                {watchingResource.embedUrl ? (
                  <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
                    <iframe
                      src={watchingResource.embedUrl}
                      title={watchingResource.title}
                      // Full screen on the video itself, so a class can watch
                      // the demonstration edge to edge without leaving the
                      // lesson underneath it.
                      allowFullScreen
                      allow="accelerometer; encrypted-media; picture-in-picture; fullscreen"
                      sandbox="allow-scripts allow-same-origin allow-presentation"
                      referrerPolicy="no-referrer"
                      className="h-full w-full border-0"
                    />
                  </div>
                ) : (
                  <a
                    href={watchingResource.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="block rounded-xl border border-slate-300 p-4 text-sm font-semibold text-brand-600 hover:underline dark:border-slate-700"
                  >
                    Open this in a new tab
                  </a>
                )}
              </div>
            </div>
          )}

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
              <ChalkThinking
                label={continueClass.isPending ? "Preparing the next lesson…" : "Thinking…"}
              />
            </div>
          )}
          <div ref={bottom} />
        </div>

        <ClassmatesPanel />
      </div>

      {/* Demonstrations a teacher added. Offered, never forced: the student
          decides whether to watch.

          Not restricted to a taught class any more. A student typing their
          own questions is the one who most needs a worked example — they
          asked because they were stuck — and gating this on AUTO mode meant
          the school's videos were invisible to exactly that student, even
          once the server had matched one for them. */}
      {/* Available for as long as the lesson is open, including after the
          course has been taught. A child revising the night before an exam is
          exactly who wants the worked example again, and hiding it once the
          class finished meant the school's videos disappeared at the moment
          they became most useful. */}
      {canAct && resources.length > 0 && (
        <Demonstrations
          resources={resources}
          isClass={isClass}
          watching={watching}
          onWatch={setWatching}
        />
      )}

      {actionError && <p className="text-sm text-red-600 dark:text-red-400">{actionError}</p>}

      {canAct ? (
        <div className="space-y-2">
          {/* After a lesson has been taught, the choice is put to the student
              rather than leaving one button and hoping. A child who did not
              follow it will press "Continue" anyway if that is the only thing
              on the screen, and the lesson moves on without them. */}
          {isClass && !session.finished && session.position > 0 && (session.turns?.length ?? 0) > 0 && !busy && (
            <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <p className="text-sm font-medium">Did that make sense so far?</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void run(() => continueClass.mutateAsync(), "Couldn't load the next lesson.")}
                  disabled={busy}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
                >
                  Yes, carry on
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void run(
                      () => ask.mutateAsync("Please explain that last part again, more slowly and with a simpler example."),
                      "Couldn't ask for another explanation.",
                    )
                  }
                  disabled={busy}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-900"
                >
                  Explain it again
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void run(
                      () => ask.mutateAsync("Can you give me one more example of that, please?"),
                      "Couldn't ask for an example.",
                    )
                  }
                  disabled={busy}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-900"
                >
                  Another example
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Asking for more does not lose your place — the next lesson is still {session.currentLesson?.title ?? "waiting"}.
              </p>
            </div>
          )}

          {isClass && !session.finished && (session.position === 0 || (session.turns?.length ?? 0) === 0) && (
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
        // Loud enough to answer the question somebody actually asks, which is
        // "where has the question box gone?" — the previous grey whisper was
        // read as the feature being broken rather than as an explanation.
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          {session.status === "ENDED" ? (
            <p>This lesson has ended. Its transcript is kept as a record.</p>
          ) : (
            <>
              <p className="font-semibold">There is no question box on this lesson because it is not yours.</p>
              <p className="mt-1">
                {session.startedByUser
                  ? `${session.startedByUser.firstName} ${session.startedByUser.lastName} is the student taking it`
                  : "Another student is taking it"}
                , and only they can speak in it. You are reading the record.{" "}
                <Link href="/ai-teacher" className="font-semibold underline">
                  Start your own lesson
                </Link>{" "}
                to ask questions.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The class conversation, beside the lesson.
 *
 * Renders nothing at all when the viewer is in no class — an administrator
 * reading a transcript, or a student not yet enrolled. An empty panel taking
 * a third of the screen to say "you have no class" would cost the lesson more
 * room than it is worth.
 *
 * Collapsible, and closed is remembered for the session only: a student who
 * wants the whole width for a diagram should get it without that becoming a
 * permanent decision they have to undo later.
 */
function ClassmatesPanel() {
  const { data: classes, isLoading } = useMyClasses();
  const [open, setOpen] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  const first = classes?.[0];

  // Said rather than silently omitted. Rendering nothing was defensible and
  // read as a broken feature: an administrator opening a lesson saw a panel
  // that simply was not there and reported the class chat as missing. Staff
  // and parents belong to no class, which is the actual reason.
  if (!isLoading && !first) {
    return (
      <aside className="shrink-0 xl:w-96">
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-3 text-xs text-slate-500 dark:border-slate-700">
          <span className="font-semibold">Class chat</span> is where the students of one class talk to each
          other. You are not in a class, so there is nothing to show here — open a class from{" "}
          <Link href="/classes" className="font-semibold text-brand-600 hover:underline">
            Classes
          </Link>{" "}
          to see its conversation.
        </p>
      </aside>
    );
  }

  if (!first) return null;
  const classId = selected ?? first.id;

  return (
    <aside className="flex min-h-0 shrink-0 flex-col gap-2 xl:w-96">
      <div className="flex items-center justify-between gap-2">
        {(classes?.length ?? 0) > 1 ? (
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            <span className="sr-only">Which class</span>
            <select
              value={classId}
              onChange={(event) => setSelected(event.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
            >
              {(classes ?? []).map((klass) => (
                <option key={klass.id} value={klass.id}>
                  {klass.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{first.name}</p>
        )}

        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          {open ? "Hide classmates" : "Show classmates"}
        </button>
      </div>

      {open && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ClassChat classId={classId} />
        </div>
      )}
    </aside>
  );
}

function Turn({ turn }: { turn: TutorTurn }) {
  if (turn.role === "STUDENT") {
    return (
      <div className="chalk-in flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-brand-600 px-4 py-2.5 text-sm text-white">
          <span className="sr-only">You asked: </span>
          {turn.content}
        </div>
      </div>
    );
  }

  // The teacher writes on the board; the student's own questions stay as
  // bubbles. Two different things said by two different people should not
  // look like one conversation in one voice.
  return (
    <div className="chalk-in flex justify-start">
      <div className="chalk-board w-full max-w-[95%]">
        <span className="sr-only">Teacher: </span>
        <BoardText text={turn.content} alt={turn.diagramAlt} />
        {turn.diagram && <BoardDiagram svg={turn.diagram} alt={turn.diagramAlt} />}

        {/* Said out loud rather than left to happen. The words arrive first
            and the picture a few seconds later, so without this the board
            simply reflows under a student who has started reading — which
            reads as a glitch rather than as a teacher turning to draw. */}
        {turn.diagramPending && !turn.diagram && (
          <p className="mt-3 flex items-center gap-2 text-xs italic text-white/70" role="status">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-white/70" />
            Drawing a picture for this…
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The demonstrations this lesson can show, as a chooser.
 *
 * The player itself is not here — it renders on the board, where a class can
 * actually see it. This used to hold both, which meant a video played as a
 * thumbnail beneath a list at the bottom of the page: fine at arm's length,
 * useless on a projector, and in full screen it sat below the fold entirely.
 */
function Demonstrations({
  resources,
  isClass,
  watching,
  onWatch,
}: {
  resources: LessonResource[];
  isClass?: boolean;
  watching: string | null;
  onWatch: (id: string | null) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      {/* A taught class is about to move on, so "before you carry on" is the
          right words. A student who just asked a question is not carrying on
          anywhere — they asked because they were stuck. */}
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {isClass ? "Watch on the board — optional" : "Your school added these — optional"}
      </p>
      <ul className="mt-2 space-y-2">
        {resources.map((resource) => (
          <li key={resource.id} className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-sm">{resource.title}</span>
            {resource.embedUrl ? (
              <button
                type="button"
                onClick={() => onWatch(watching === resource.id ? null : resource.id)}
                aria-pressed={watching === resource.id}
                className="shrink-0 rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
              >
                {watching === resource.id ? "Hide" : "Watch"}
              </button>
            ) : (
              /* Not every link can be embedded — an arbitrary origin in an
                 iframe inside a school portal is a frame in a child's
                 session, so only vetted hosts get one. The rest are followed
                 knowingly. */
              <a
                href={resource.url}
                target="_blank"
                rel="noreferrer noopener"
                className="shrink-0 rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
              >
                Open
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
