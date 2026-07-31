"use client";

/* eslint-disable @next/next/no-img-element -- the QR code is a data: URI
   generated per-request; next/image would add nothing and cannot optimise it. */

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { FormField } from "@/components/form-field";
import {
  useDisableTwoFactor,
  useEnableTwoFactor,
  useStartTwoFactorSetup,
  type TwoFactorSetup,
} from "@/lib/use-account";

type Stage = "idle" | "enrolling" | "recovery" | "disabling";

export function TwoFactorPanel() {
  const [stage, setStage] = useState<Stage>("idle");
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const startSetup = useStartTwoFactorSetup();
  const enable = useEnableTwoFactor();
  const disable = useDisableTwoFactor();

  function reset() {
    setStage("idle");
    setSetup(null);
    setCode("");
    setPassword("");
    setError(null);
  }

  async function handleStart() {
    setError(null);
    try {
      const result = await startSetup.mutateAsync();
      setSetup(result);
      setStage("enrolling");
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 400
          ? "Two-factor authentication is already enabled on this account."
          : "Couldn't start setup. Please try again.",
      );
    }
  }

  async function handleEnable() {
    setError(null);
    try {
      const result = await enable.mutateAsync({ code });
      setRecoveryCodes(result.recoveryCodes);
      setStage("recovery");
      setCode("");
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? "That code isn't valid. Check your authenticator app and try again."
          : "Couldn't enable two-factor authentication. Please try again.",
      );
    }
  }

  async function handleDisable() {
    setError(null);
    try {
      await disable.mutateAsync({ code, password });
      reset();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? "That password or code isn't valid."
          : "Couldn't disable two-factor authentication. Please try again.",
      );
    }
  }

  const inputClass =
    "mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 dark:border-slate-700 dark:bg-slate-900";

  return (
    <section className="border-t border-slate-200 pt-10 dark:border-slate-800">
      <h2 className="text-lg font-semibold">Two-factor authentication</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Add a code from an authenticator app to your sign-in.
      </p>

      {error && (
        <p role="alert" className="mt-4 max-w-md rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </p>
      )}

      {stage === "idle" && (
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleStart}
            disabled={startSetup.isPending}
            className="rounded-lg bg-brand-gradient px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {startSetup.isPending ? "Preparing…" : "Set up two-factor"}
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setStage("disabling");
            }}
            className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium transition hover:border-brand-400 dark:border-slate-700"
          >
            Turn off two-factor
          </button>
        </div>
      )}

      {stage === "enrolling" && setup && (
        <div className="mt-4 max-w-md space-y-4">
          <p className="text-sm">
            Scan this with your authenticator app, then enter the 6-digit code it shows.
          </p>
          <img
            src={setup.qrCodeDataUrl}
            alt="Two-factor authentication QR code"
            className="h-48 w-48 rounded-lg bg-white p-2"
          />
          <details className="text-sm text-slate-600 dark:text-slate-400">
            <summary className="cursor-pointer">Can&apos;t scan the code?</summary>
            <p className="mt-2">
              Enter this key manually: <code className="break-all font-mono">{setup.secret}</code>
            </p>
          </details>

          <div>
            <label htmlFor="enable-code" className="block text-sm font-medium">
              Authentication code
            </label>
            <input
              id="enable-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleEnable}
              disabled={enable.isPending || code.length !== 6}
              className="rounded-lg bg-brand-gradient px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {enable.isPending ? "Verifying…" : "Verify and enable"}
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium dark:border-slate-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {stage === "recovery" && (
        <div className="mt-4 max-w-md space-y-4">
          <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <p className="font-semibold">Save these recovery codes now.</p>
            <p className="mt-1">
              Each one works once if you lose your authenticator. They are not shown again.
            </p>
          </div>
          <ul className="grid grid-cols-2 gap-2 font-mono text-sm">
            {recoveryCodes.map((recoveryCode) => (
              <li key={recoveryCode} className="rounded border border-slate-200 px-3 py-2 dark:border-slate-800">
                {recoveryCode}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => {
              setRecoveryCodes([]);
              reset();
            }}
            className="rounded-lg bg-brand-gradient px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            I&apos;ve saved them
          </button>
        </div>
      )}

      {stage === "disabling" && (
        <div className="mt-4 max-w-md space-y-4">
          <p className="text-sm">Confirm your password and a current code to turn two-factor off.</p>
          <FormField
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div>
            <label htmlFor="disable-code" className="block text-sm font-medium">
              Authentication code
            </label>
            <input
              id="disable-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleDisable}
              disabled={disable.isPending || !password || code.length !== 6}
              className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {disable.isPending ? "Turning off…" : "Turn off two-factor"}
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium dark:border-slate-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
