"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ApiError } from "@/lib/api";
import { useChangeSchoolStatus, useSchool } from "@/lib/use-schools";
import { StatusBadge } from "@/components/status-badge";
import { SubscriptionPanel } from "@/components/subscription-panel";

export default function SchoolDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: school, isLoading, error } = useSchool(params.id);

  if (isLoading) return <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>;
  if (error) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
        {error.message}
      </p>
    );
  }
  if (!school) return null;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/schools" className="text-sm text-slate-600 hover:underline dark:text-slate-400">
          ← Tenants
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{school.name}</h1>
          <StatusBadge status={school.status} />
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {school.slug} · {school.databaseName}
        </p>
      </div>

      <SubscriptionPanel schoolId={school.id} />

      <LifecycleActions schoolId={school.id} status={school.status} />

      <section className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
        <h2 className="text-lg font-semibold">Lifecycle history</h2>
        {school.lifecycleEvents.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            No status changes since onboarding.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {school.lifecycleEvents.map((event) => (
              <li key={event.id} className="rounded-lg border border-slate-200 px-4 py-3 text-sm dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={event.fromStatus} />
                  <span aria-hidden="true">→</span>
                  <StatusBadge status={event.toStatus} />
                  <span className="ml-auto text-xs text-slate-500">
                    {new Date(event.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="mt-2">{event.reason}</p>
                <p className="mt-1 text-xs text-slate-500">by {event.actorEmail}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
        <h2 className="text-lg font-semibold">Provisioning history</h2>
        {school.provisioningAttempts.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">No attempts recorded.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {school.provisioningAttempts.map((attempt) => (
              <li
                key={attempt.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm dark:border-slate-800"
              >
                <span className="font-mono text-xs">{attempt.step}</span>
                <span
                  className={
                    attempt.success
                      ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                      : "rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-400"
                  }
                >
                  {attempt.success ? "ok" : "failed"}
                </span>
                {attempt.errorMessage && (
                  <span className="w-full break-words text-xs text-red-600 dark:text-red-400">
                    {attempt.errorMessage}
                  </span>
                )}
                <span className="ml-auto text-xs text-slate-500">
                  {new Date(attempt.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * Only the transitions the API actually allows are offered. PROVISIONING
 * and FAILED are recovered through retry-provisioning, not by editing
 * status, so no button is shown for them — see school-lifecycle.ts.
 */
function LifecycleActions({ schoolId, status }: { schoolId: string; status: string }) {
  const action = status === "ACTIVE" ? "suspend" : status === "SUSPENDED" ? "reactivate" : null;
  const change = useChangeSchoolStatus(schoolId, action ?? "suspend");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  if (!action) {
    return (
      <section className="rounded-2xl border border-slate-200 p-5 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
        This school is {status.toLowerCase()}. Status changes are unavailable until provisioning resolves — use retry
        provisioning instead.
      </section>
    );
  }

  const isSuspend = action === "suspend";

  return (
    <section className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
      <h2 className="text-lg font-semibold">{isSuspend ? "Suspend this school" : "Return this school to service"}</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        {isSuspend
          ? "Every user of this school is locked out immediately, including anyone currently signed in."
          : "Users will be able to sign in again immediately."}
      </p>

      <div className="mt-3 space-y-3">
        <div>
          <label htmlFor="reason" className="block text-sm font-medium">
            Reason
          </label>
          <input
            id="reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={isSuspend ? "Non-payment: invoice 4021 overdue" : "Payment received"}
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-platform-500 focus:ring-2 focus:ring-platform-500/20 dark:border-slate-700 dark:bg-slate-900"
          />
          <p className="mt-1 text-xs text-slate-500">Recorded against your account in the lifecycle history.</p>
        </div>

        {message && (
          <p
            role={message.tone === "error" ? "alert" : undefined}
            className={
              message.tone === "error"
                ? "rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400"
                : "text-sm text-emerald-600 dark:text-emerald-400"
            }
          >
            {message.text}
          </p>
        )}

        <button
          type="button"
          disabled={change.isPending || reason.trim().length < 3}
          onClick={async () => {
            setMessage(null);
            try {
              await change.mutateAsync(reason.trim());
              setReason("");
              setMessage({ tone: "ok", text: isSuspend ? "School suspended." : "School reactivated." });
            } catch (err) {
              setMessage({
                tone: "error",
                text: err instanceof ApiError ? err.message : "That didn't work.",
              });
            }
          }}
          className={
            isSuspend
              ? "rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
              : "rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          }
        >
          {isSuspend ? "Suspend school" : "Reactivate school"}
        </button>
      </div>
    </section>
  );
}
