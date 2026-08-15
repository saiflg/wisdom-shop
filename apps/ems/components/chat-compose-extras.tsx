"use client";

import { useEffect, useRef, useState } from "react";

/** Mirrors the API's allowlist. The server decides; this only filters the picker. */
export const ACCEPTED_UPLOADS = "image/png,image/jpeg,image/webp,image/gif,application/pdf";

const MAX_VOICE_SECONDS = 120;

/**
 * Recording a voice note.
 *
 * MediaRecorder, so nothing is uploaded until the child presses send and the
 * audio never touches a third party. The microphone is released the moment
 * recording stops — a browser tab holding an open microphone is the kind of
 * thing that ends up in a newspaper, and a school is exactly where it would.
 */
export function useVoiceRecorder() {
  const [supported, setSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        typeof MediaRecorder !== "undefined" &&
        Boolean(navigator.mediaDevices?.getUserMedia),
    );
    return () => releaseEverything();
  }, []);

  const releaseEverything = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    recorder.current = null;
  };

  const start = async () => {
    setError(null);
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = media;
      chunks.current = [];

      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const rec = new MediaRecorder(media, { mimeType: mime });
      rec.ondataavailable = (event) => event.data.size > 0 && chunks.current.push(event.data);
      rec.start();
      recorder.current = rec;

      setSeconds(0);
      setRecording(true);
      timer.current = setInterval(() => {
        setSeconds((current) => {
          // Stops itself rather than recording until the tab is closed.
          if (current + 1 >= MAX_VOICE_SECONDS) void stop();
          return current + 1;
        });
      }, 1000);
    } catch {
      setError("The microphone is not available. Check the permission for this site.");
      releaseEverything();
    }
  };

  const stop = (): Promise<{ file: File; seconds: number } | null> =>
    new Promise((resolve) => {
      const rec = recorder.current;
      if (!rec || rec.state === "inactive") {
        releaseEverything();
        setRecording(false);
        resolve(null);
        return;
      }

      rec.onstop = () => {
        const type = rec.mimeType || "audio/webm";
        const blob = new Blob(chunks.current, { type });
        const extension = type.includes("mp4") ? "m4a" : "webm";
        const captured = seconds;
        releaseEverything();
        setRecording(false);
        resolve(
          blob.size > 0
            ? { file: new File([blob], `voice-note.${extension}`, { type }), seconds: captured }
            : null,
        );
      };
      rec.stop();
    });

  const cancel = () => {
    const rec = recorder.current;
    if (rec && rec.state !== "inactive") {
      rec.onstop = () => undefined;
      rec.stop();
    }
    releaseEverything();
    setRecording(false);
    setSeconds(0);
  };

  return { supported, recording, seconds, error, start, stop, cancel };
}

export function formatSeconds(total: number): string {
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
