"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { useIsSchoolAdmin } from "@/lib/use-can-author";
import { useStaff } from "@/lib/use-staff";
import { useAuthStore } from "@/store/auth-store";
import {
  relativeTime,
  useEndSession,
  useSessions,
  useSignOutEverywhere,
  useSignOutUser,
  type Session,
} from "@/lib/use-security";

/**
 * The devices that can reach your account.
 *
 * Two things this screen is careful not to claim. It does not mark one
 * session as "this device", because the access token carries no session id
 * and the server genuinely cannot tell — a wrong label here is worse than no
 * label. And an administrator can shut somebody's account down without ever
 * seeing their devices or the addresses they signed in from.
 */
export default function SecurityPage() {
  const { data, isLoading } = useSessions();
  const isAdmin = useIsSchoolAdmin();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Security</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          Everything currently signed in to your account. If you do not recognise one, end it.
        </p>
      </div>

      {isLoading && <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>}

      {data && (
        <>
          <section className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
            <div className="flex flex-wrap gap-8">
              <Stat label="Signed in" value={data.summary.active} />
              <Stat label="Ended" value={data.summary.revoked} />
              <Stat label="Expired" value={data.summary.expired} />
            </div>
          </section>

          <SignOutEverywhere active={data.summary.active} />

          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Sessions</h2>
            {data.sessions.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Nothing recorded yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-200 dark:divide-slate-800">
                {data.sessions.map((session) => (
                  <SessionRow key={session.id} session={session} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {isAdmin && <SignOutSomebody />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function SessionRow({ session }: { session: Session }) {
  const end = useEndSession();
  const [note, setNote] = useState<string | null>(null);

  const stop = async () => {
    setNote(null);
    try {
      const result = await end.mutateAsync(session.id);
      // Told, not treated as a failure: somebody clicking twice because the
      // first click seemed not to work should not be left wondering whether
      // their account is still reachable.
      if (result.alreadyEnded) setNote("That one had already ended.");
    } catch (err) {
      setNote(err instanceof ApiError ? err.message : "Could not end that session");
    }
  };

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">
          {session.device}
          {!session.active && (
            <span className="ml-2 text-xs font-normal text-slate-500">
              {session.revokedAt ? "ended" : "expired"}
            </span>
          )}
        </p>
        <p className="text-xs text-slate-500">
          {session.ipAddress ?? "address not recorded"} · last used {relativeTime(session.lastUsedAt)}
        </p>
        {note && <p className="text-xs text-amber-600">{note}</p>}
      </div>
      {session.active && (
        <button
          type="button"
          onClick={stop}
          disabled={end.isPending}
          className="shrink-0 rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold disabled:opacity-50 dark:border-slate-700"
        >
          End this
        </button>
      )}
    </li>
  );
}

function SignOutEverywhere({ active }: { active: number }) {
  const signOut = useSignOutEverywhere();
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const go = async () => {
    setNote(null);
    try {
      const result = await signOut.mutateAsync();
      setNote(`${result.ended} session${result.ended === 1 ? "" : "s"} ended. You will be signed out here too.`);
    } catch (err) {
      setNote(err instanceof ApiError ? err.message : "Could not sign out");
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Sign out everywhere</h2>
      {/* Said before the button, not after. The honest description of what
          this does — the server cannot tell which session is asking, so
          "everywhere else" would be a guess about the one thing somebody
          using this most needs to be right. */}
      <p className="mt-1 text-xs text-slate-500">
        This ends every session on your account, including this one. You will have to sign in again.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {confirming ? (
          <>
            <button
              type="button"
              onClick={go}
              disabled={signOut.isPending}
              className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {signOut.isPending ? "Ending…" : `Yes, end all ${active}`}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-700"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={active === 0}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-40 dark:border-slate-700"
          >
            Sign out everywhere
          </button>
        )}
      </div>
      {note && <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">{note}</p>}
    </section>
  );
}

/** For a lost laptop. Deliberately gives back a count and nothing else. */
function SignOutSomebody() {
  const signOut = useSignOutUser();
  const { data: staff } = useStaff();
  const me = useAuthStore((state) => state.user?.id ?? null);
  const [userId, setUserId] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const go = async () => {
    setNote(null);
    try {
      const result = await signOut.mutateAsync(userId);
      setNote(`${result.ended} session${result.ended === 1 ? "" : "s"} ended.`);
      setUserId("");
    } catch (err) {
      setNote(err instanceof ApiError ? err.message : "Could not sign them out");
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Sign somebody else out
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        For a lost laptop or an account somebody else has got into. You will see how many sessions ended, and
        nothing else — not their devices, and not where they signed in from.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <select
          value={userId}
          onChange={(event) => setUserId(event.target.value)}
          aria-label="Member of staff"
          className="w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="">Choose somebody…</option>
          {staff
            ?.filter((member) => member.id !== me)
            .map((member) => (
              <option key={member.id} value={member.id}>
                {member.firstName} {member.lastName}
              </option>
            ))}
        </select>
        <button
          type="button"
          onClick={go}
          disabled={signOut.isPending || !userId}
          className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 disabled:opacity-50 dark:border-red-900"
        >
          {signOut.isPending ? "Ending…" : "Sign them out"}
        </button>
      </div>
      {note && <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">{note}</p>}
    </section>
  );
}
