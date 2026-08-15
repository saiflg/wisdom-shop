"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Reading the lesson aloud.
 *
 * The browser's own speech synthesiser, deliberately: it costs nothing, works
 * offline, needs no key, and — the part that matters for a school — the
 * lesson text never leaves the child's device to be spoken. Sending a
 * transcript to a cloud voice service would mean shipping schoolwork about a
 * named child to a third party for no gain a parent would recognise.
 */

/** Slower than default. A teacher explaining something new does not gabble. */
export const TEACHING_RATE = 0.85;
const PITCH = 1.05;

/**
 * Voices, best first.
 *
 * The brief was a warm, unhurried woman's voice. Browsers expose wildly
 * different sets, so this is a preference order rather than a choice: named
 * female voices that actually sound like people first, then anything the
 * platform labels female, then whatever exists — a lesson that is read in the
 * wrong voice is better than one that is silent.
 */
const PREFERRED = [
  "Google UK English Female",
  "Microsoft Libby Online (Natural) - English (United Kingdom)",
  "Microsoft Sonia Online (Natural) - English (United Kingdom)",
  "Microsoft Aria Online (Natural) - English (United States)",
  "Google US English",
  "Samantha",
  "Karen",
  "Moira",
  "Tessa",
  "Microsoft Zira - English (United States)",
];

const FEMININE_HINT = /female|woman|libby|sonia|aria|zira|samantha|karen|moira|tessa|fiona|serena|amelie/i;

export function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;

  for (const name of PREFERRED) {
    const match = voices.find((voice) => voice.name === name);
    if (match) return match;
  }

  const english = voices.filter((voice) => voice.lang?.toLowerCase().startsWith("en"));
  const feminine = english.find((voice) => FEMININE_HINT.test(voice.name));
  if (feminine) return feminine;

  return english[0] ?? voices[0] ?? null;
}

/**
 * Strip what should be heard as speech, not read as markup.
 *
 * The tutor writes markdown — **bold**, bullet lists, headings. Spoken
 * literally that becomes "star star countable star star", which is worse than
 * no narration at all.
 */
export function speakableText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, ", ")
    .replace(/^\s*\d+\.\s+/gm, ", ")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function useLessonVoice() {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    setSupported(true);

    const load = () => {
      voiceRef.current = pickVoice(window.speechSynthesis.getVoices());
    };
    load();
    // Chrome populates the list asynchronously and fires this once ready.
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", load);
      window.speechSynthesis.cancel();
    };
  }, []);

  const stop = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      const clean = speakableText(text);
      if (!clean) return;

      // Whatever was being said is now out of date; the new lesson wins.
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(clean);
      if (voiceRef.current) utterance.voice = voiceRef.current;
      utterance.rate = TEACHING_RATE;
      utterance.pitch = PITCH;
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);

      setSpeaking(true);
      window.speechSynthesis.speak(utterance);
    },
    [],
  );

  return { supported, speaking, enabled, setEnabled, speak, stop, voiceName: voiceRef.current?.name ?? null };
}
