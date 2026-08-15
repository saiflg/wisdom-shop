"use client";

import { useState } from "react";
import { apiFetch, errorMessage } from "@/lib/api";
import { authHeaders, useAuthQueryState } from "@/lib/api-auth";
import type { CreatedInvitation } from "@/lib/use-guardians";
import type { StaffMember } from "@/lib/use-staff";

/**
 * Inviting a member of staff to set up their own password.
 *
 * The same mechanism parents use, for a reason that matters more here rather
 * than less: an administrator who types a colleague's password knows how to
 * sign in as them, and a teacher's account reaches every child's record in
 * the school.
 */
export function StaffInvite({ member }: { member: StaffMember }) {
  const { accessToken } = useAuthQueryState();
  const [created, setCreated] = useState<CreatedInvitation | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);

  const send = async () => {
    setMessage(null);
    setSending(true);
    try {
      setCreated(
        await apiFetch<CreatedInvitation>(`/v1/staff/${member.id}/invitations`, {
          method: "POST",
          headers: authHeaders(accessToken),
        }),
      );
    } catch (err) {
      setMessage(errorMessage(err, "Couldn't create an invitation."));
    } finally {
      setSending(false);
    }
  };

  if (!member.email) {
    return <span className="text-xs text-slate-500">No email address — cannot be invited.</span>;
  }

  if (created) {
    return (
      <div className="mt-2 space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
        <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
          Send this link to {member.firstName}. {created.expiresIn}.
        </p>
        <div className="flex gap-2">
          <input
            readOnly
            value={created.url}
            onFocus={(event) => event.currentTarget.select()}
            className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs dark:border-slate-700 dark:bg-slate-900"
          />
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(created.url);
              setCopied(true);
            }}
            className="shrink-0 rounded bg-brand-600 px-3 py-1 text-xs font-semibold text-white"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        {/* Said plainly, because there is no way to recover it and somebody
            will otherwise close this expecting to find it again. */}
        <p className="text-xs text-emerald-800 dark:text-emerald-300">
          This link is shown once and cannot be found again. If it is lost, send another.
        </p>
      </div>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => void send()}
        disabled={sending}
        className="text-xs font-semibold text-brand-600 hover:underline disabled:opacity-50"
      >
        {sending ? "Creating…" : member.hasPassword ? "Send a password reset link" : "Invite to set a password"}
      </button>
      {message && <span className="text-xs text-red-600">{message}</span>}
    </span>
  );
}
