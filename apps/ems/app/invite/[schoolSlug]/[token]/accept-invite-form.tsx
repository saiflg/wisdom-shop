"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, errorMessage } from "@/lib/api";

interface CheckResult {
  valid: boolean;
  reason: string | null;
  name: string | null;
}

/**
 * The parent chooses their own password.
 *
 * The rules are stated up front rather than after a rejected attempt: a
 * parent setting this up on a phone, possibly once ever, should not have to
 * discover the requirements by failing.
 */
const RULES = [
  { label: "At least 10 characters", test: (v: string) => v.length >= 10 },
  { label: "A capital letter", test: (v: string) => /[A-Z]/.test(v) },
  { label: "A small letter", test: (v: string) => /[a-z]/.test(v) },
  { label: "A number", test: (v: string) => /\d/.test(v) },
  { label: "A symbol, like ! or #", test: (v: string) => /[^A-Za-z0-9]/.test(v) },
];

export function AcceptInviteForm({ schoolSlug, token }: { schoolSlug: string; token: string }) {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Asked before the form is drawn, so an expired link says so immediately
  // rather than after somebody has chosen and typed a password twice.
  useEffect(() => {
    let cancelled = false;
    apiFetch<CheckResult>("/v1/invitations/check", { method: "POST", body: { schoolSlug, token } })
      .then((result) => !cancelled && setCheck(result))
      .catch(() => !cancelled && setCheck({ valid: false, reason: "We couldn't check that link.", name: null }))
      .finally(() => !cancelled && setChecking(false));
    return () => {
      cancelled = true;
    };
  }, [schoolSlug, token]);

  const unmet = RULES.filter((rule) => !rule.test(password));
  const mismatch = confirm.length > 0 && confirm !== password;
  const ready = unmet.length === 0 && password === confirm && !saving;

  const submit = async () => {
    if (!ready) return;
    setError(null);
    setSaving(true);
    try {
      await apiFetch("/v1/invitations/accept", { method: "POST", body: { schoolSlug, token, password } });
      setDone(true);
      // Straight to the sign-in page, with the school already filled in.
      setTimeout(() => router.push(`/login?schoolSlug=${encodeURIComponent(schoolSlug)}`), 2500);
    } catch (err) {
      setError(errorMessage(err, "We couldn't set your password. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  if (checking) return <p className="mt-8 text-sm text-slate-500">Checking your link…</p>;

  if (!check?.valid) {
    return (
      <div className="mt-8 space-y-4">
        <h2 className="text-lg font-semibold">This link cannot be used</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">{check?.reason}</p>
        <Link
          href={`/login?schoolSlug=${encodeURIComponent(schoolSlug)}`}
          className="inline-block text-sm font-semibold text-brand-600 hover:underline"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold text-emerald-600">Your account is ready</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Taking you to sign in. Use your email address and the password you just chose.
        </p>
        <Link
          href={`/login?schoolSlug=${encodeURIComponent(schoolSlug)}`}
          className="inline-block text-sm font-semibold text-brand-600 hover:underline"
        >
          Sign in now
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <h2 className="text-lg font-semibold">
        {check.name ? `Welcome, ${check.name}` : "Set up your account"}
      </h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Choose a password to see your child&apos;s attendance, homework, results and fees. The school never sees
        it.
      </p>

      <form
        className="mt-6 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div>
          <label htmlFor="password" className="block text-sm font-medium">
            New password
          </label>
          <input
            id="password"
            type={show ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            autoFocus
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </div>

        <div>
          <label htmlFor="confirm" className="block text-sm font-medium">
            Type it again
          </label>
          <input
            id="confirm"
            type={show ? "text" : "password"}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
            aria-invalid={mismatch}
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          {mismatch && <p className="mt-1 text-xs text-red-600">These two do not match.</p>}
        </div>

        {/* Shown rather than hidden behind an eye icon only: a parent typing a
            long password once, on a phone, benefits more from seeing it than
            from hiding it from a room they are probably alone in. */}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={show}
            onChange={(event) => setShow(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 dark:border-slate-600"
          />
          Show what I am typing
        </label>

        <ul className="space-y-1">
          {RULES.map((rule) => {
            const met = rule.test(password);
            return (
              <li
                key={rule.label}
                className={`flex items-center gap-2 text-xs ${met ? "text-emerald-600" : "text-slate-500"}`}
              >
                <span aria-hidden>{met ? "✓" : "○"}</span>
                <span>{rule.label}</span>
                <span className="sr-only">{met ? " — done" : " — still needed"}</span>
              </li>
            );
          })}
        </ul>

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!ready}
          className="w-full rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
        >
          {saving ? "Setting your password…" : "Set my password"}
        </button>
      </form>
    </div>
  );
}
