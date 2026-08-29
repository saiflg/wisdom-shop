"use client";

import { useState } from "react";
import { errorMessage } from "@/lib/api";
import {
  useGuardianInvitations,
  useInviteGuardian,
  useRevokeInvitation,
  type CreatedInvitation,
  type GuardianEntry,
} from "@/lib/use-guardians";

/**
 * Inviting a parent to set up their own portal password.
 *
 * The office sends a link; the parent chooses the password. Nobody here ever
 * sees it — which is the point, because the alternative this replaces was an
 * administrator typing a password on a parent's behalf and therefore knowing
 * how to sign in as that family.
 */
export function GuardianInvite({ guardian }: { guardian: GuardianEntry }) {
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<CreatedInvitation | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const invite = useInviteGuardian();
  const { data: history } = useGuardianInvitations(open ? guardian.guardianUserId : null);
  const revoke = useRevokeInvitation(guardian.guardianUserId);

  const send = async () => {
    setMessage(null);
    try {
      setCreated(await invite.mutateAsync(guardian.guardianUserId));
      setOpen(true);
    } catch (err) {
      setMessage(errorMessage(err, "Couldn't create an invitation."));
    }
  };

  // Nowhere to send it, so the button would only ever produce an error.
  if (!guardian.email) {
    return <p className="mt-2 text-xs text-slate-500">Add an email address before inviting this parent.</p>;
  }

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        {guardian.hasPassword ? (
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            Can sign in
          </span>
        ) : (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            Has never signed in
          </span>
        )}

        <button
          type="button"
          onClick={() => void send()}
          disabled={invite.isPending}
          className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-900"
        >
          {invite.isPending
            ? "Creating…"
            : guardian.hasPassword
              ? "Send a password reset link"
              : "Invite to the portal"}
        </button>

        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="text-xs font-semibold text-brand-600 hover:underline"
        >
          {open ? "Hide invitations" : "Invitations"}
        </button>
      </div>

      {/* Resetting is the same mechanism, and saying so stops an office
          wondering whether it will wipe the account. */}
      {guardian.hasPassword && (
        <p className="mt-1.5 text-xs text-slate-500">
          They keep their current password until they follow the new link and choose another.
        </p>
      )}

      {created && <InvitationLink invitation={created} onDismiss={() => setCreated(null)} />}

      {message && (
        <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
          {message}
        </p>
      )}

      {open && history && history.length > 0 && (
        <ul className="mt-2 space-y-1 border-s-2 border-slate-200 ps-3 dark:border-slate-800">
          {history.map((invitation) => (
            <li key={invitation.id} className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span
                className={
                  invitation.state === "ACCEPTED"
                    ? "font-semibold text-emerald-600"
                    : invitation.state === "PENDING"
                      ? "font-semibold text-amber-600"
                      : ""
                }
              >
                {invitation.expiresIn}
              </span>
              {invitation.sentByName && <span>· sent by {invitation.sentByName}</span>}
              {invitation.state === "PENDING" && (
                <button
                  type="button"
                  onClick={() => void revoke.mutateAsync(invitation.id).catch(() => undefined)}
                  className="font-semibold text-slate-400 transition hover:text-red-600"
                >
                  Cancel
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {open && history && history.length === 0 && (
        <p className="mt-2 text-xs text-slate-500">No invitations sent yet.</p>
      )}
    </div>
  );
}

/**
 * The link, shown once.
 *
 * Not emailed by this software — a school's own mail, or a printed slip, is
 * how most of them will actually reach a parent, and pretending otherwise
 * would mean silently failing when the school has no mail configured. So it
 * is put on screen to be copied, with a plain warning that it will not be
 * shown again.
 */
function InvitationLink({ invitation, onDismiss }: { invitation: CreatedInvitation; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invitation.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard access can be refused; the link is on screen to select by
      // hand, so this is not worth an error message.
    }
  };

  return (
    <div className="mt-2 rounded-lg border border-brand-300 bg-brand-50 p-3 dark:border-brand-800 dark:bg-brand-950/30">
      <p className="text-xs font-semibold">
        Send this to {invitation.guardian.name} at {invitation.guardian.email}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto rounded bg-white px-2 py-1.5 text-xs dark:bg-slate-900">
          {invitation.url}
        </code>
        <button
          type="button"
          onClick={() => void copy()}
          className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-500"
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold transition hover:bg-white dark:border-slate-700"
        >
          Done
        </button>
      </div>

      <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
        {invitation.expiresIn}. Copy it now — it cannot be shown again, and anyone with the link can set this
        parent&apos;s password.
        {invitation.supersededCount > 0 && " Any earlier link sent to them has stopped working."}
      </p>
    </div>
  );
}
