"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * The teacher's board.
 *
 * A lesson used to arrive as a grey chat bubble, which is what a support
 * ticket looks like. A classroom is a board at the front of a room, so this
 * is one: dark green, chalk-coloured writing, a wooden frame. The point is
 * not decoration — it tells a child at a glance which part of the page is
 * being taught and which part is them talking.
 *
 * Everything that moves here is CSS animation, never a JS-driven transform,
 * because globals.css already neutralises CSS animation for
 * `html[data-reduce-motion]` and for `prefers-reduced-motion`. A student who
 * needs stillness gets it without this component knowing anything about it.
 */

/** A word, or the whitespace between two, with its offset in the whole text. */
interface Token {
  text: string;
  start: number;
  isWord: boolean;
}

/**
 * Splits text into words and the gaps between them, keeping every character.
 *
 * Offsets are what the speech synthesiser reports — `onboundary` gives a
 * `charIndex` into the string it was handed — so the split has to be lossless
 * or the highlight drifts further out of step with every word.
 */
export function tokenise(text: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /\s+/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      tokens.push({ text: text.slice(cursor, match.index), start: cursor, isWord: true });
    }
    tokens.push({ text: match[0], start: match.index, isWord: false });
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) tokens.push({ text: text.slice(cursor), start: cursor, isWord: true });
  return tokens;
}

/**
 * The index of the word containing `charIndex`, or -1 before the first one.
 *
 * Searches backwards, so an offset landing in the gap between two words stays
 * on the word just spoken rather than jumping ahead to one that has not been.
 */
export function wordAt(tokens: Token[], charIndex: number): number {
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const token = tokens[i];
    if (token && token.isWord && token.start <= charIndex) return i;
  }
  return -1;
}

/**
 * A lesson on the board, read aloud with the current word lit up.
 *
 * The highlight is driven by the synthesiser's own `onboundary` events rather
 * than a timer: a timer drifts within a sentence, and a child following the
 * highlight to keep their place is worse off with a confident wrong answer
 * than with none. Where the browser does not report boundaries the text
 * simply is not highlighted and the reading still works.
 */
export function BoardText({ text, alt }: { text: string; alt?: string | null }) {
  // What is spoken includes the diagram's description; what is highlighted is
  // only the lesson, because the description is not on screen as words.
  //
  // The offsets still line up: `spoken` *begins* with `text`, so every
  // charIndex within the lesson indexes the same character in both. Once the
  // voice runs on into the description, charIndex passes the end of `text`
  // and `wordAt` clamps to the last word — so the highlight rests on the
  // final word while the picture is described, which is where a reader's eye
  // would be anyway. Building `tokens` from `spoken` instead would look more
  // consistent and would light up words that are not there.
  const spoken = useMemo(() => [text, alt].filter(Boolean).join(". "), [text, alt]);
  const tokens = useMemo(() => tokenise(text), [text]);

  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(-1);
  const activeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    // Speech carries on after the component unmounts, so a student who
    // navigates away mid-sentence is not followed around by it.
    return () => window.speechSynthesis?.cancel();
  }, []);

  // Keeps the lit word on screen during a long lesson. `nearest` rather than
  // `center` so short lessons that already fit are not yanked about.
  useEffect(() => {
    if (active >= 0) activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [active]);

  const stop = () => {
    window.speechSynthesis.cancel();
    setSpeaking(false);
    setActive(-1);
  };

  const start = () => {
    const utterance = new SpeechSynthesisUtterance(spoken);
    utterance.rate = 0.95;

    utterance.onboundary = (event) => {
      // Only word boundaries move the highlight; sentence boundaries would
      // jump it back to the start of the sentence just finished.
      if (event.name && event.name !== "word") return;
      setActive(wordAt(tokens, event.charIndex));
    };
    utterance.onend = () => {
      setSpeaking(false);
      setActive(-1);
    };
    utterance.onerror = () => {
      setSpeaking(false);
      setActive(-1);
    };

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  };

  return (
    <>
      <p className="chalk-text whitespace-pre-wrap text-[0.95rem] leading-relaxed">
        {tokens.map((token, index) =>
          token.isWord ? (
            <span
              key={`${token.start}-${index}`}
              ref={index === active ? activeRef : undefined}
              className={index === active ? "chalk-word-active" : undefined}
            >
              {token.text}
            </span>
          ) : (
            <span key={`${token.start}-${index}`}>{token.text}</span>
          ),
        )}
      </p>

      {supported && spoken && (
        <button
          type="button"
          onClick={speaking ? stop : start}
          className="chalk-button"
          aria-label={speaking ? "Stop reading this lesson aloud" : "Read this lesson aloud"}
        >
          {speaking ? "◼ Stop reading" : "▶ Read aloud"}
        </button>
      )}
    </>
  );
}

/**
 * The diagram, pinned to the board like a chart rather than drawn on it.
 *
 * On a light card on purpose. The model picks its own colours — a red dashed
 * height line, a blue triangle — and it picks them for paper. Dropping that
 * straight onto dark green would make half of them invisible, and the
 * sanitiser deliberately forbids the `style` attribute that would let us
 * recolour it. A pinned chart is also what a real classroom does.
 */
export function BoardDiagram({ svg, alt }: { svg: string; alt: string | null }) {
  return (
    <figure className="chalk-pin">
      {/* Sanitised server-side before it was ever stored — see
          sanitize-svg.ts. The safety lives at the point of storage, so a
          diagram that reached the database is one that passed. */}
      <div
        role="img"
        aria-label={alt ?? "Diagram"}
        className="overflow-x-auto rounded-md bg-white p-3 [&>svg]:h-auto [&>svg]:w-full [&>svg]:max-w-md"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {/* Shown, not only announced: a description written for a screen reader
          is just as useful to a student who finds the picture hard to read. */}
      {alt && <figcaption className="mt-1.5 text-xs text-emerald-100/70">{alt}</figcaption>}
    </figure>
  );
}

/** The teacher writing: three pieces of chalk tapping, rather than a spinner. */
export function ChalkThinking({ label }: { label: string }) {
  return (
    <div className="chalk-board chalk-board-thinking" role="status" aria-live="polite">
      <span className="chalk-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="chalk-text text-sm">{label}</span>
    </div>
  );
}
