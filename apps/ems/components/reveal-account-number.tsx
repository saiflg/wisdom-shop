"use client";

import { useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/api";
import { useAuthQueryState } from "@/lib/api-auth";
import { revealAccountNumber, type RevealedAccount } from "@/lib/use-staff";

/** How long a revealed number stays on screen before it clears itself. */
const VISIBLE_SECONDS = 60;

/**
 * The one place a full account number appears on screen.
 *
 * Three things are deliberate here. The reason is required before the request
 * is made, because it is written to the log before the number comes back and a
 * log that says only "someone looked" is barely a log. The number is held in
 * local state and nowhere else — not in the query cache, not in a mutation
 * hook — so closing this panel really does drop it. And it hides itself after
 * a minute, because the realistic risk to a school bursar is not an attacker,
 * it is a screen left open in a room other people walk through.
 */
export function RevealAccountNumber({ userId, staffName }: { userId: string; staffName: string }) {
  const { accessToken } = useAuthQueryState();

  const [reason, setReason] = useState("");
  const [revealed, setRevealed] = useState<RevealedAccount | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(VISIBLE_SECONDS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clearing on unmount as well as on the timer: navigating away is the most
  // common way this panel is "closed".
  useEffect(() => {
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const hide = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setRevealed(null);
    setReason("");
  };

  const show = async () => {
    setError(null);
    setBusy(true);
    try {
      const account = await revealAccountNumber(userId, reason.trim(), accessToken);
      setRevealed(account);
      setSecondsLeft(VISIBLE_SECONDS);
      if (timer.current) clearInterval(timer.current);
      timer.current = setInterval(() => {
        setSecondsLeft((left) => {
          if (left <= 1) {
            if (timer.current) clearInterval(timer.current);
            timer.current = null;
            setRevealed(null);
            setReason("");
            return 0;
          }
          return left - 1;
        });
      }, 1000);
    } catch (err) {
      setError(errorMessage(err, "Couldn't read that account number."));
    } finally {
      setBusy(false);
    }
  };

  if (revealed) {
    return (
      <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
          {staffName}&apos;s account number
        </p>
        <p className="select-all text-2xl font-bold tabular-nums tracking-wider">{revealed.accountNumber}</p>
        <p className="text-xs text-amber-800 dark:text-amber-200">
          {revealed.accountName}
          {revealed.bankName ? ` · ${revealed.bankName}` : ""}
          {revealed.bankCode ? ` · ${revealed.bankCode}` : ""}
        </p>
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={hide}
            className="rounded-lg border border-amber-400 px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 dark:border-amber-700 dark:text-amber-100 dark:hover:bg-amber-900/40"
          >
            Hide now
          </button>
          <span className="text-xs text-amber-800 dark:text-amber-200" aria-live="off">
            Hides itself in {secondsLeft}s
          </span>
        </div>
        <p className="text-xs text-amber-800 dark:text-amber-200">
          This was recorded in the access log against your name, with the reason you gave.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <label htmlFor="reveal-reason" className="block text-sm font-medium">
        Show the full account number
      </label>
      <p className="text-xs text-slate-500">
        Say why. It goes in the log before the number is shown, so the log answers &ldquo;why&rdquo; and not
        merely &ldquo;who&rdquo;.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          id="reveal-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Preparing the October payroll run"
          className="min-w-[16rem] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
        <button
          type="button"
          onClick={() => void show()}
          disabled={busy || reason.trim().length < 4}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
        >
          {busy ? "Reading…" : "Show number"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
